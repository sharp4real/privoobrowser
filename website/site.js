/* privoo.app. the only script on the site.
   Three jobs: the theme switch, the mobile nav, and a hairline under the
   header once the page has scrolled. Everything else is markup. */

/* ── Theme ────────────────────────────────────────────────────────────
   The theme is applied by the inline script in each page's <head>, which
   runs before first paint so there is no flash of the wrong one. This only
   handles the button and remembering the choice. */
(function theme() {
  const KEY = 'privoo-theme';
  const btn = document.getElementById('theme-btn');
  if (!btn) return;

  const current = () =>
    document.documentElement.dataset.theme ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  const label = (t) => {
    // Describe the action, not the state: the button says what a click does.
    btn.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  };
  label(current());

  btn.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
    label(next);
  });

  // Follow the OS for as long as the visitor has not made a choice of theirs.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch { /* ignore */ }
    if (saved) return;
    const next = e.matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    label(next);
  });
})();

/* ── Mobile nav ───────────────────────────────────────────────────────── */
(function nav() {
  const btn = document.getElementById('menu-btn');
  const nav = document.getElementById('nav');
  if (!btn || !nav) return;
  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
  // Following a link should close it. several of them are same-page anchors,
  // which would otherwise leave the sheet covering the thing you jumped to.
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      nav.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
})();

/* ── The header hairline ──────────────────────────────────────────────── */
(function stuck() {
  const top = document.querySelector('.top');
  if (!top) return;
  const paint = () => top.classList.toggle('stuck', window.scrollY > 4);
  paint();
  addEventListener('scroll', paint, { passive: true });
})();


/* ── "Proudly crafted in Europe" ──────────────────────────────────────
   Once per visitor. localStorage is the only state the site keeps, and if
   it is unavailable (private window, storage blocked) the note simply shows
  . which is the right way round: a missed note is better than a note
   nobody can ever get rid of. */
(function madeNote() {
  const KEY = 'privoo-made-note';
  let seen = false;
  try { seen = localStorage.getItem(KEY) === '1'; } catch { seen = false; }
  if (seen) return;

  const el = document.createElement('div');
  el.className = 'made-note';
  el.textContent = 'Proudly crafted in Europe.';
  document.body.appendChild(el);

  // Written when it is SHOWN, not when it finishes: if the tab is closed
  // halfway through, it has still been seen.
  try { localStorage.setItem(KEY, '1'); } catch { /* nothing to remember with */ }

  // Two frames. one for the element to exist at opacity 0, one for the
  // class change to be a transition rather than a starting value.
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));

  setTimeout(() => {
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 700);
  }, 6000);
})();
