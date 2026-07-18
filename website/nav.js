// Mobile sidebar toggle. The sidebar is plain markup and works without this;
// on narrow screens CSS hides it and this button reveals it.
document.getElementById('menu-btn')?.addEventListener('click', () => {
  document.getElementById('sidebar')?.classList.toggle('open');
});

// Dark/light switch. The theme itself is applied by the inline script in each
// page's <head>, which runs before first paint so there is no flash of the
// wrong theme. This only handles the button and persistence.
(function () {
  const KEY = 'privoo-theme';
  const btn = document.getElementById('theme-btn');
  if (!btn) return;

  const paint = (theme) => {
    const dark = theme === 'dark';
    // Offer the action, not the current state: the label says what a click does.
    btn.textContent = dark ? '☀ Light' : '☾ Dark';
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.setAttribute('aria-pressed', String(dark));
  };

  const current = () =>
    document.documentElement.dataset.theme ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  paint(current());

  btn.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch (e) { /* private mode */ }
    paint(next);
  });

  // Follow the OS while the user has not made an explicit choice.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (err) { /* ignore */ }
    if (saved) return;
    const next = e.matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    paint(next);
  });
})();
