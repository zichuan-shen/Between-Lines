/* Personal headline preferences are independent of task records. */
(() => {
  'use strict';
  const KEY = 'gpdQuestLog.headline.v1';
  const LAST = 'gpdQuestLog.headline.last';
  // Both themes share slots 1–6. The themed arrays fill slots 7–10 in the same order.
  const shared = [
    ['One tab.', 'One task.'],
    ['先存个档，', '再往下想。'],
    ['Next time is next time.', 'Now is now.'],
    ['The Poetry of Place', 'The Art of Belonging'],
    ['江流天地外，', '山色有无中。'],
    ['半壕春水一城花，', '烟雨暗千家。']
  ];
  const themed = {
    light: [
      ['天与云、与山、与水，', '上下一白。'],
      ['春水碧于天，', '画船听雨眠。'],
      ['A Thing of Beauty', 'A Joy for Ever'],
      ['Spring Light', 'Fields of Color']
    ],
    dark: [
      ['The World', 'Deserves Witnesses'],
      ['Real Life is color', 'you can’t control.'],
      ['This is the story', 'of a lifetime'],
      ['The Moth and the Star', 'The Night and the Morrow']
    ]
  };
  const root = document.documentElement;
  const title = document.getElementById('heroTitle');
  const form = document.getElementById('headlineForm');
  const edit = document.getElementById('headlineEdit');
  const first = document.getElementById('headlineFirst');
  const second = document.getElementById('headlineSecond');
  const status = document.getElementById('headlineStatus');
  const clean = value => Array.from(String(value || '').trim()).slice(0, 16).join('');
  let custom = null;
  let current;
  let headlineNumber;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(saved) && saved.length === 2 && saved.every(v => typeof v === 'string')) {
      const lines = saved.map(clean);
      if (lines.some(Boolean)) custom = lines.filter(Boolean);
    }
  } catch (_) { /* Missing or invalid preferences use a random headline. */ }

  function pickHeadlineNumber() {
    let previous = -1;
    try { previous = Number(localStorage.getItem(LAST) ?? -1); } catch (_) {}
    const count = shared.length + themed.dark.length;
    const options = Array.from({length: count}, (_, index) => index + 1).filter(number => number !== previous);
    headlineNumber = options[Math.floor(Math.random() * options.length)];
    try { localStorage.setItem(LAST, String(headlineNumber)); } catch (_) {}
  }
  function paintBuiltIn() {
    const theme = root.dataset.theme === 'light' ? 'light' : 'dark';
    const index = headlineNumber - 1;
    const lines = shared[index] || themed[theme][index - shared.length];
    if (current !== lines) paint(lines);
    else fitTitle();
  }
  function paint(lines) {
    current = lines;
    title.replaceChildren(document.createTextNode(lines[0]));
    if (lines[1]) {
      const em = document.createElement('em');
      em.textContent = lines[1];
      title.append(document.createElement('br'), em);
    }
    title.classList.toggle('hero-title-long', lines.some(line => Array.from(line).length > 9));
    edit.textContent = custom ? '编辑标题 ↗' : '自定义标题 ↗';
    fitTitle();
  }
  function fitTitle() {
    if (title.hidden || !title.clientWidth) return;
    title.style.removeProperty('--headline-fit');
    if (title.scrollHeight <= title.clientHeight + 1) return;
    let lower = 13, upper = Math.floor(parseFloat(getComputedStyle(title).fontSize));
    while (lower < upper) {
      const size = Math.ceil((lower + upper) / 2);
      title.style.setProperty('--headline-fit', size + 'px');
      if (title.scrollHeight <= title.clientHeight + 1) lower = size;
      else upper = size - 1;
    }
    title.style.setProperty('--headline-fit', lower + 'px');
  }
  function closeEditor() {
    form.hidden = true;
    title.hidden = false;
    fitTitle();
    edit.setAttribute('aria-expanded', 'false');
    edit.focus();
  }
  function persist(lines) {
    try {
      if (lines) localStorage.setItem(KEY, JSON.stringify([lines[0], lines[1] || '']));
      else localStorage.removeItem(KEY);
    } catch (_) {
      status.textContent = '浏览器未能保存设置，请检查存储权限后重试。';
      return;
    }
    custom = lines;
    if (custom) paint(custom);
    else {
      pickHeadlineNumber();
      paintBuiltIn();
    }
    closeEditor();
    status.textContent = custom ? '自定义标题已保存' : '已恢复随机标题，每次打开页面会换一句';
  }
  edit.addEventListener('click', () => {
    if (!form.hidden) { closeEditor(); return; }
    first.value = current[0];
    second.value = current[1] || '';
    title.hidden = true;
    form.hidden = false;
    status.textContent = '';
    edit.setAttribute('aria-expanded', 'true');
    first.focus();
    first.select();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const lines = [clean(first.value), clean(second.value)].filter(Boolean);
    persist(lines.length ? lines : null);
  });
  form.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeEditor(); }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  document.getElementById('headlineCancel').addEventListener('click', closeEditor);
  document.getElementById('headlineReset').addEventListener('click', () => persist(null));
  if (custom) paint(custom);
  else {
    pickHeadlineNumber();
    paintBuiltIn();
  }
  if (globalThis.ResizeObserver) {
    let lastWidth;
    new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === lastWidth) return;
      lastWidth = entry.contentRect.width;
      fitTitle();
    }).observe(title.parentElement);
  }
  if (globalThis.MutationObserver) {
    new MutationObserver(() => {
      if (custom) fitTitle();
      else paintBuiltIn();
    }).observe(root, {attributes:true, attributeFilter:['data-theme']});
  }
  document.fonts?.ready.then(fitTitle);
})();
