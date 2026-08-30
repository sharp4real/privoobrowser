'use strict';

/**
 * Text extraction for files attached to Privoo AI.
 *
 * Deliberately TEXT ONLY. Nothing here uploads a file anywhere: the bytes are
 * read locally, turned into plain text, and only that text is ever placed in
 * the conversation. That keeps the feature honest about what leaves the machine
 * and avoids sending images or whole binaries to a provider.
 *
 * No native dependencies — everything is parsed with what ships in Node, so
 * this adds nothing to the install size.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ocr = require('./ai-ocr');

/** Hard ceiling on what we will read, before extraction. */
const MAX_BYTES = 25 * 1024 * 1024;
/** Ceiling on extracted text, so one huge file cannot blow the context window. */
const MAX_CHARS = 120000;

const PLAIN_EXT = new Set([
  '.txt', '.md', '.markdown', '.log', '.csv', '.tsv', '.json', '.xml', '.yml', '.yaml',
  '.html', '.htm', '.css', '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.rs',
  '.java', '.c', '.h', '.cpp', '.hpp', '.cs', '.php', '.sh', '.bat', '.ps1', '.sql',
  '.ini', '.cfg', '.conf', '.toml', '.env', '.srt', '.vtt',
]);

function clamp(text) {
  const t = String(text || '').replace(/\u0000/g, '');
  if (t.length <= MAX_CHARS) return { text: t, truncated: false };
  return { text: t.slice(0, MAX_CHARS), truncated: true };
}

/** Strip tags from HTML/XML, keeping readable text. */
function stripMarkup(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t\r\f]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

/**
 * Minimal ZIP reader. DOCX/XLSX/PPTX are ZIP containers, and Node can inflate
 * raw deflate streams, so the whole format is reachable without a dependency.
 * Returns a Map of entry name -> Buffer.
 */
function readZipEntries(buf, wanted) {
  const entries = new Map();
  // Find the End Of Central Directory record, scanning back from the end.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return entries;

  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < count; n++) {
    if (off + 46 > buf.length) break;
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method     = buf.readUInt16LE(off + 10);
    const compSize   = buf.readUInt32LE(off + 20);
    const nameLen    = buf.readUInt16LE(off + 28);
    const extraLen   = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff   = buf.readUInt32LE(off + 42);
    const name       = buf.toString('utf8', off + 46, off + 46 + nameLen);
    off += 46 + nameLen + extraLen + commentLen;

    if (wanted && !wanted(name)) continue;
    if (localOff + 30 > buf.length) continue;
    if (buf.readUInt32LE(localOff) !== 0x04034b50) continue;

    const lNameLen  = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    try {
      entries.set(name, method === 0 ? raw : zlib.inflateRawSync(raw));
    } catch { /* one bad entry must not kill the document */ }
  }
  return entries;
}

/** DOCX: text lives in word/document.xml, one <w:t> per run. */
function extractDocx(buf) {
  const e = readZipEntries(buf, (n) => n === 'word/document.xml');
  const xml = e.get('word/document.xml');
  if (!xml) return '';
  // Walk runs and paragraph closes in document order, emitting a newline at
  // each </w:p>. Collecting <w:t> values on their own runs every paragraph
  // together into one line.
  const src = xml.toString('utf8').replace(/<w:tab[^>]*\/>/g, '\t');
  const parts = [];
  const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>|<\/w:p>/g;
  let m;
  while ((m = re.exec(src))) parts.push(m[1] === undefined ? '\n' : m[1]);
  const joined = parts.join('');
  if (!joined.trim()) return stripMarkup(src);
  return joined
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** XLSX: shared strings plus each sheet's cells, rendered as TSV per row. */
function extractXlsx(buf) {
  const e = readZipEntries(buf, (n) =>
    n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));

  const shared = [];
  const ss = e.get('xl/sharedStrings.xml');
  if (ss) {
    const re = /<si>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = re.exec(ss.toString('utf8')))) {
      const texts = [];
      const tre = /<t[^>]*>([\s\S]*?)<\/t>/g;
      let t;
      while ((t = tre.exec(m[1]))) texts.push(t[1]);
      shared.push(stripMarkup(texts.join('')));
    }
  }

  const out = [];
  const sheets = [...e.keys()].filter((n) => n.startsWith('xl/worksheets/')).sort();
  for (const name of sheets) {
    const xml = e.get(name).toString('utf8');
    const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
    let r;
    while ((r = rowRe.exec(xml))) {
      const cells = [];
      const cRe = /<c[^>]*?(?:\st="(\w+)")?[^>]*>([\s\S]*?)<\/c>/g;
      let c;
      while ((c = cRe.exec(r[1]))) {
        const type = c[1];
        const vm = /<v>([\s\S]*?)<\/v>/.exec(c[2]);
        const im = /<t[^>]*>([\s\S]*?)<\/t>/.exec(c[2]);
        let val = '';
        if (type === 's' && vm) val = shared[parseInt(vm[1], 10)] || '';
        else if (im) val = stripMarkup(im[1]);
        else if (vm) val = vm[1];
        cells.push(val);
      }
      if (cells.some((x) => x !== '')) out.push(cells.join('\t'));
    }
  }
  return out.join('\n');
}

/** PPTX: one line per text run, per slide. */
function extractPptx(buf) {
  const e = readZipEntries(buf, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  const names = [...e.keys()].sort((a, b) => {
    const na = parseInt(a.match(/(\d+)/)[1], 10);
    const nb = parseInt(b.match(/(\d+)/)[1], 10);
    return na - nb;
  });
  const out = [];
  for (const n of names) {
    const xml = e.get(n).toString('utf8');
    const parts = [];
    const re = /<a:t>([\s\S]*?)<\/a:t>/g;
    let m;
    while ((m = re.exec(xml))) parts.push(stripMarkup(m[1]));
    if (parts.length) out.push('--- Slide ' + n.match(/(\d+)/)[1] + ' ---\n' + parts.join('\n'));
  }
  return out.join('\n\n');
}

/**
 * PDF: pull text from uncompressed and Flate-compressed content streams.
 *
 * This is a pragmatic extractor, not a full PDF engine. It handles the common
 * case of text-based PDFs well; it cannot read scanned documents (those are
 * images and would need OCR), and unusual encodings may come out imperfect.
 * The caller is told when little or nothing was recovered.
 */
function extractPdf(buf) {
  const chunks = [];
  const s = buf.toString('latin1');
  const streamRe = /stream\r?\n?([\s\S]*?)endstream/g;
  let m;
  while ((m = streamRe.exec(s))) {
    let data = Buffer.from(m[1], 'latin1');
    // Try inflate; if it is not compressed, use the bytes as they are.
    try { data = zlib.inflateSync(data); } catch { /* not deflate */ }
    const text = data.toString('latin1');
    if (!/(TJ|Tj)/.test(text)) continue;

    // Text-showing operators: (literal) Tj  and  [(a) -250 (b)] TJ
    const outParts = [];
    const tjRe = /\((?:\\.|[^\\()])*\)|\[((?:[^\[\]\\]|\\.)*)\]\s*TJ/g;
    let t;
    while ((t = tjRe.exec(text))) {
      const seg = t[0];
      const strRe = /\(((?:\\.|[^\\()])*)\)/g;
      let sm;
      while ((sm = strRe.exec(seg))) {
        outParts.push(sm[1]
          .replace(/\\([nrtbf])/g, (_x, c) => ({ n: '\n', r: '\r', t: '\t', b: '', f: '' }[c] || ''))
          .replace(/\\(\d{1,3})/g, (_x, o) => String.fromCharCode(parseInt(o, 8)))
          .replace(/\\(.)/g, '$1'));
      }
      outParts.push(' ');
    }
    if (outParts.length) chunks.push(outParts.join(''));
  }
  return chunks.join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Does this look like text rather than a binary blob? */
function looksTextual(buf) {
  const sample = buf.subarray(0, 4096);
  let control = 0;
  for (const b of sample) {
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) control++;
  }
  return control / Math.max(1, sample.length) < 0.1;
}

/**
 * Extract text from one file.
 * Returns { ok, name, ext, chars, truncated, text } or { ok:false, error }.
 */
async function extractText(filePath) {
  let stat;
  try { stat = fs.statSync(filePath); } catch { return { ok: false, error: 'File not found.' }; }
  if (!stat.isFile()) return { ok: false, error: 'Not a file.' };
  if (stat.size > MAX_BYTES) {
    return { ok: false, error: 'That file is larger than 25 MB.' };
  }

  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);
  let buf;
  try { buf = fs.readFileSync(filePath); } catch (e) {
    return { ok: false, error: 'Could not read that file.' };
  }

  let raw = '';
  try {
    if (ext === '.docx')      raw = extractDocx(buf);
    else if (ext === '.xlsx') raw = extractXlsx(buf);
    else if (ext === '.pptx') raw = extractPptx(buf);
    else if (ext === '.pdf')  raw = extractPdf(buf);
    else if (ext === '.html' || ext === '.htm') raw = stripMarkup(buf.toString('utf8'));
    else if (PLAIN_EXT.has(ext)) raw = buf.toString('utf8');
    else if (looksTextual(buf))  raw = buf.toString('utf8');
    else if (ocr.isImage(filePath)) {
      // Images have no text layer, so read it optically. Still text-only: the
      // recognised words go into the conversation, never the picture.
      const r = await ocr.recognise(filePath);
      if (!r.ok) return { ok: false, error: r.error };
      raw = r.text;
    }
    else {
      return {
        ok: false,
        error: 'Privoo AI reads text only, and there is no text in that file type. '
             + 'Try a document, spreadsheet, PDF, image or code file.',
      };
    }
  } catch (e) {
    return { ok: false, error: 'Could not read text from that file.' };
  }

  // A PDF with no text layer is a scan. Rasterise and OCR it rather than
  // refusing - this is the case people most often hit with receipts and
  // anything that came off a scanner or a phone camera.
  if ((!raw || !raw.trim()) && ext === '.pdf') {
    // The only await in here that was not guarded. recognisePdf shells out to
    // pdftoppm, so a missing binary or an odd PDF threw out of extractText, and
    // the caller saw a rejected promise rather than a readable reason.
    let r;
    try { r = await ocr.recognisePdf(filePath); }
    catch (err) { return { ok: false, error: 'Could not read that scanned PDF: ' + (err.message || 'unknown error') }; }
    if (r && r.ok) raw = r.text;
    else return { ok: false, error: (r && r.error) || 'Could not read that scanned PDF.' };
  }

  if (!raw || !raw.trim()) {
    return { ok: false, error: 'No readable text found in that file.' };
  }

  const { text, truncated } = clamp(raw);
  return { ok: true, name, ext, chars: text.length, truncated, text };
}

module.exports = { extractText, MAX_BYTES, MAX_CHARS };
