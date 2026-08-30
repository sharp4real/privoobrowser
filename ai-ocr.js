'use strict';

/**
 * OCR for Privoo AI attachments.
 *
 * Uses the OCR engine built into Windows (Windows.Media.Ocr, present since
 * Windows 10) rather than bundling Tesseract. Reasons:
 *   - tesseract.js plus its language data is ~15 MB downloaded at runtime and
 *     noticeably slow in-process;
 *   - the WinRT engine is already installed, is fast, and handles the languages
 *     the user's system is set up for;
 *   - it keeps the install size unchanged and adds no native dependency.
 *
 * It is reached through PowerShell because Node has no WinRT bindings. On
 * platforms without it, isAvailable() reports false and the caller explains
 * that rather than silently returning nothing.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/** OCR is Windows-only here. */
function isAvailable() {
  return process.platform === 'win32';
}

const IMAGE_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.bmp', '.gif', '.tif', '.tiff', '.webp',
]);

function isImage(filePath) {
  return IMAGE_EXT.has(path.extname(String(filePath || '')).toLowerCase());
}

/**
 * PowerShell that loads a bitmap and runs the OCR engine over it.
 * Written as one script so we pay a single PowerShell start-up per file.
 */
function ocrScript(imagePath) {
  const p = String(imagePath).replace(/'/g, "''");
  return [
    '$ErrorActionPreference = "Stop"',
    // WinRT projection into PowerShell: load the types, then bridge the async
    // IAsyncOperation results onto a Task we can wait on.
    '[void][Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]',
    '[void][Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]',
    '[void][Windows.Storage.StorageFile,Windows.Foundation,ContentType=WindowsRuntime]',
    'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
    // NOTE the single quotes around the generic type name. Inside PowerShell
    // DOUBLE quotes a backtick is an escape character, so "IAsyncOperation`1"
    // collapses to "IAsyncOperation1", the match fails, and $asTask ends up
    // null — which surfaces much later as a useless "could not read" error.
    '$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {',
    '  $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and',
    "  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]",
    'function Await($op, $t) {',
    '  $m = $asTask.MakeGenericMethod($t)',
    '  $task = $m.Invoke($null, @($op))',
    '  $task.Wait(-1) | Out-Null',
    '  $task.Result',
    '}',
    "$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync('" + p + "')) ([Windows.Storage.StorageFile])",
    '$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])',
    '$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])',
    '$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])',
    '$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()',
    'if ($null -eq $engine) { Write-Error "No OCR language pack is installed."; exit 2 }',
    '$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])',
    // Emit line by line so layout survives roughly intact.
    'foreach ($line in $result.Lines) { Write-Output $line.Text }',
  // Newlines, NOT '; '. The Where-Object block and the Await function each span
  // several lines, and a semicolon inserted mid-expression is a parse error.
  ].join('\n');
}

/**
 * Run OCR on an image file.
 * Resolves { ok, text } or { ok:false, error }.
 */
function recognise(imagePath) {
  return new Promise((resolve) => {
    if (!isAvailable()) {
      resolve({ ok: false, error: 'Reading text from images needs Windows 10 or later.' });
      return;
    }
    if (!fs.existsSync(imagePath)) {
      resolve({ ok: false, error: 'File not found.' });
      return;
    }
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-STA', '-Command', ocrScript(imagePath)],
      { encoding: 'utf8', windowsHide: true, timeout: 90000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const msg = String(stderr || err.message || '');
          if (/language pack/i.test(msg)) {
            resolve({ ok: false, error: 'No OCR language pack is installed. Add one in Windows Settings under Language.' });
          } else {
            resolve({ ok: false, error: 'Could not read text from that image.' });
          }
          return;
        }
        const text = String(stdout || '').replace(/\r/g, '').trim();
        if (!text) { resolve({ ok: false, error: 'No text found in that image.' }); return; }
        resolve({ ok: true, text });
      }
    );
  });
}

/**
 * Render PDF pages to images and OCR them.
 *
 * Only reached when the normal text extractor found nothing, which means the
 * PDF is a scan. Rendering needs an external tool; we look for pdftoppm
 * (poppler) and quietly decline when it is absent rather than pretending.
 */
function pdfPagesToImages(pdfPath, maxPages) {
  return new Promise((resolve) => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'privoo-ocr-'));
    const prefix = path.join(outDir, 'page');
    execFile(
      'pdftoppm',
      ['-png', '-r', '150', '-f', '1', '-l', String(maxPages || 10), pdfPath, prefix],
      { windowsHide: true, timeout: 120000 },
      (err) => {
        if (err) { resolve({ dir: outDir, files: [] }); return; }
        let files = [];
        try {
          files = fs.readdirSync(outDir)
            .filter((f) => f.toLowerCase().endsWith('.png'))
            .sort()
            .map((f) => path.join(outDir, f));
        } catch { files = []; }
        resolve({ dir: outDir, files });
      }
    );
  });
}

async function recognisePdf(pdfPath, maxPages = 10) {
  if (!isAvailable()) {
    return { ok: false, error: 'Reading text from scanned PDFs needs Windows 10 or later.' };
  }
  const { dir, files } = await pdfPagesToImages(pdfPath, maxPages);
  try {
    if (!files.length) {
      return {
        ok: false,
        error: 'That PDF is a scan. Privoo needs pdftoppm (part of Poppler) on your PATH to read scanned PDFs.',
      };
    }
    const chunks = [];
    for (let i = 0; i < files.length; i++) {
      const r = await recognise(files[i]);
      if (r.ok && r.text) chunks.push('--- Page ' + (i + 1) + ' ---\n' + r.text);
    }
    if (!chunks.length) return { ok: false, error: 'No text found in that scanned PDF.' };
    return { ok: true, text: chunks.join('\n\n'), pages: files.length };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp dir */ }
  }
}

module.exports = { isAvailable, isImage, recognise, recognisePdf };
