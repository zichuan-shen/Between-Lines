/* Personal headline preferences are independent of task records. */
(() => {
  'use strict';
  const KEY = 'gpdQuestLog.headline.v1';
  const LAST = 'gpdQuestLog.headline.last';
  const phrases = [
    ['来都来了，', '先做一件。'],
    ['别急，', '脑子还在加载。'],
    ['问题不大，', '先看一眼需求。'],
    ['先把事情列出来，', '看看从哪开始。'],
    ['先存个档，', '再往下想。'],
    ['从从容容，', '先开一个文档。'],
    ['先做个初版，', '文件名以后再改。'],
    ['Where was I?', '刚才做到哪了？'],
    ['One thing first.', '其他的，待会儿。'],
    ['One tab.', 'One task.']
  ];
  const title = document.getElementById('heroTitle');
  const form = document.getElementById('headlineForm');
  const edit = document.getElementById('headlineEdit');
  const first = document.getElementById('headlineFirst');
  const second = document.getElementById('headlineSecond');
  const status = document.getElementById('headlineStatus');
  const clean = value => Array.from(String(value || '').trim()).slice(0, 16).join('');
  let custom = null;
  let current;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(saved) && saved.length === 2 && saved.every(v => typeof v === 'string')) {
      const lines = saved.map(clean);
      if (lines.some(Boolean)) custom = lines.filter(Boolean);
    }
  } catch (_) { /* Missing or invalid preferences use a random headline. */ }

  function randomPhrase() {
    let previous = -1;
    try { previous = Number(localStorage.getItem(LAST) ?? -1); } catch (_) {}
    const options = phrases.map((_, i) => i).filter(i => i !== previous);
    const index = options[Math.floor(Math.random() * options.length)];
    try { localStorage.setItem(LAST, String(index)); } catch (_) {}
    return phrases[index].slice();
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
    paint(custom || randomPhrase());
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
  paint(custom || randomPhrase());
  if (globalThis.ResizeObserver) {
    let lastWidth;
    new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === lastWidth) return;
      lastWidth = entry.contentRect.width;
      fitTitle();
    }).observe(title.parentElement);
  }
  if (globalThis.MutationObserver) {
    new MutationObserver(fitTitle).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
  }
  document.fonts?.ready.then(fitTitle);
})();
