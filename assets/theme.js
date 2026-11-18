/* Apply the saved theme before styles paint; task data stays independent. */
(() => {
  'use strict';
  const KEY = 'gpdQuestLog.theme.v1';
  const root = document.documentElement;
  let theme = 'dark';
  try { if (localStorage.getItem(KEY) === 'light') theme = 'light'; } catch (_) {}
  root.dataset.theme = theme;
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('themeToggle');
    const icon = document.getElementById('themeIcon');
    const label = document.getElementById('themeLabel');
    function paint() {
      const light = root.dataset.theme === 'light';
      icon.textContent = light ? '☀' : '☾';
      label.textContent = light ? '亮色' : '暗色';
      button.setAttribute('aria-checked', String(light));
      button.title = light ? '当前亮色 · 点击切换暗色' : '当前暗色 · 点击切换亮色';
    }
    let requested = root.dataset.theme;
    let transition;
    function apply(theme) {
      if (theme !== requested) return;
      root.dataset.theme = theme;
      paint();
      try { localStorage.setItem(KEY, root.dataset.theme); }
      catch (_) { button.title += '（本次已切换，但浏览器未能保存偏好）'; }
    }
    button.addEventListener('click', () => {
      const next = requested === 'light' ? 'dark' : 'light';
      requested = next;
      transition?.skipTransition();
      if (!document.startViewTransition || !window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
        apply(next);
        return;
      }
      const current = document.startViewTransition(() => apply(next));
      transition = current;
      // Reversing a switch can skip its snapshot before it is ready.
      current.ready.catch(() => {});
      current.finished.then(() => { if (transition === current) transition = undefined; });
    });
    window.addEventListener('storage', event => {
      if (event.key === KEY || event.key === null) {
        transition?.skipTransition();
        requested = event.newValue === 'light' ? 'light' : 'dark';
        root.dataset.theme = requested;
        paint();
      }
    });
    paint();
  });
})();
