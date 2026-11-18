(() => {
  'use strict';
  const api = globalThis.HeaderArtwork;
  const dialog = document.getElementById('bannerPicker');
  const grid = document.getElementById('bannerGrid');
  const message = document.getElementById('bannerMessage');
  const location = document.getElementById('bannerLocation');
  const refresh = document.getElementById('bannerRefresh');
  const bind = document.getElementById('bannerFolder');
  const fallback = document.getElementById('bannerFolderInput');
  const close = document.getElementById('bannerClose');
  const mime = {png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',avif:'image/avif'};
  let target = 'dark', generation = 0, urls = [], working = false, backdrop = false, fallbackTheme;
  const handles = {}, imported = {};
  const label = () => target === 'light' ? '亮色' : '暗色';
  const directoryKey = () => 'bannerDirectory.' + target;
  function cleanup() { urls.forEach(url => URL.revokeObjectURL(url)); urls = []; }
  function lock(value) {
    working = value;
    for (const button of dialog.querySelectorAll('button:not(#bannerClose)')) button.disabled = value || button.dataset.broken === 'true';
    grid.setAttribute('aria-busy', String(value));
  }
  function card(item) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'banner-choice';
    button.setAttribute('aria-label', '使用' + item.name);
    const image = document.createElement('img');
    image.src = item.src; image.alt = ''; image.loading = 'lazy';
    image.style.objectPosition = item.position || 'center';
    image.addEventListener('error', () => { button.dataset.broken = 'true'; button.disabled = true; button.title = '无法读取这张图片'; });
    const caption = document.createElement('span'); caption.textContent = item.name;
    button.append(image, caption);
    button.addEventListener('click', async () => {
      if (working) return;
      const token = generation, selectedTheme = target;
      lock(true); message.textContent = '正在保存图片…';
      try {
        await api.select(item.file || {preset:item.id}, selectedTheme, item.position);
        if (token === generation) dialog.close();
      } catch (error) {
        if (token === generation) message.textContent = /请选择|图片|读取/.test(error.message) ? error.message : '保存失败，原图片已保留，请重试。';
      } finally { if (token === generation) lock(false); }
    });
    return button;
  }
  function render(files) {
    cleanup(); grid.replaceChildren();
    const presets = globalThis.BannerCatalog[target];
    const items = files ? files.map(file => {
      const url = URL.createObjectURL(file); urls.push(url);
      const known = presets.find(item => item.src.endsWith('/' + file.name));
      return {file, name:file.name, src:url, position:known?.position};
    }) : presets;
    // Folder selections use the same crop as bundled versions when their names match.
    for (const item of items) grid.append(card(item));
    if (!items.length) {
      const empty = document.createElement('p'); empty.className = 'banner-empty';
      empty.textContent = '目录内还没有支持的图片。放入 PNG、JPG、WebP、GIF 或 AVIF 后点击刷新。'; grid.append(empty);
    }
  }
  function normalized(file) {
    const type = mime[file.name.split('.').pop().toLowerCase()];
    if (!type) return null;
    return file.type === type ? file : new File([file], file.name, {type, lastModified:file.lastModified});
  }
  async function scan(handle, token) {
    const files = [];
    for await (const entry of handle.values()) {
      if (token !== generation) return;
      if (entry.kind !== 'file') continue;
      const type = mime[entry.name.split('.').pop().toLowerCase()];
      if (!type) continue;
      const file = normalized(await entry.getFile());
      if (file) files.push(file);
    }
    if (token !== generation) return;
    files.sort((a,b) => a.name.localeCompare(b.name, 'zh-CN', {numeric:true}));
    render(files); location.textContent = label() + ' / ' + handle.name;
    message.textContent = files.length + ' 张图片 · 点击缩略图应用 · 新增或移除文件后点击刷新';
  }
  async function load() {
    const token = ++generation;
    working = false; lock(false); render(imported[target]);
    location.textContent = 'Banner / ' + label();
    message.textContent = '首次读取目录：点击“选择目录”，选择看板旁 Banner 文件夹内的“' + label() + '”目录。';
    try {
      const handle = handles[target] || await api.access('readonly', store => store.get(directoryKey()));
      if (token !== generation || !handle) return;
      handles[target] = handle;
      if (await handle.queryPermission({mode:'read'}) === 'granted') {
        if (token === generation) await scan(handle, token);
      } else if (token === generation) message.textContent = '点击“刷新目录”重新授权读取 ' + handle.name + '。';
    } catch (_) {
      if (token === generation) message.textContent = '暂时无法读取目录，可重新选择；内置图片仍可使用。';
    }
  }
  bind.addEventListener('click', async () => {
    if (!globalThis.showDirectoryPicker) { fallbackTheme = target; fallback.value = ''; fallback.click(); return; }
    const token = generation, selectedTheme = target;
    try {
      const handle = await globalThis.showDirectoryPicker({id:'banner-' + target, mode:'read', ...(handles[target] ? {startIn:handles[target]} : {})});
      if (token !== generation) return;
      handles[selectedTheme] = handle;
      let remembered = true;
      try { await api.access('readwrite', store => store.put(handle, 'bannerDirectory.' + selectedTheme)); } catch (_) { remembered = false; }
      if (token !== generation) return;
      lock(true); await scan(handle, token);
      if (!remembered && token === generation) message.textContent += ' · 目录未能记住，下次需重新选择';
    } catch (error) { if (error.name !== 'AbortError' && token === generation) message.textContent = '目录读取失败，请重新选择目录。'; }
    finally { if (token === generation) lock(false); }
  });
  refresh.addEventListener('click', async () => {
    const handle = handles[target];
    if (!handle) { bind.click(); return; }
    const token = generation;
    try {
      // Permission requests must stay in the direct click path.
      const permission = await handle.requestPermission({mode:'read'});
      if (token !== generation) return;
      if (permission !== 'granted') { message.textContent = '未授权读取。现有 Banner 保持不变。'; return; }
      lock(true); await scan(handle, token);
    } catch (_) { if (token === generation) message.textContent = '目录不可用，请点击“选择目录”重新选择。'; }
    finally { if (token === generation) lock(false); }
  });
  fallback.addEventListener('change', () => {
    const files = Array.from(fallback.files || []).filter(file => !file.webkitRelativePath || file.webkitRelativePath.split('/').length === 2).map(normalized).filter(Boolean);
    if (!fallback.files?.length) return;
    files.sort((a,b) => a.name.localeCompare(b.name, 'zh-CN', {numeric:true}));
    const selectedTheme = fallbackTheme || target; fallbackTheme = null;
    imported[selectedTheme] = files;
    if (selectedTheme !== target || !dialog.open) return;
    render(files);
    message.textContent = files.length + ' 张图片 · 当前浏览器需在下次打开时重新选择目录，已应用的图片会保留。';
  });
  document.getElementById('bannerUpload').addEventListener('click', () => { const selectedTheme = target; dialog.close(); api.upload(selectedTheme); });
  document.getElementById('bannerBuiltins').addEventListener('click', () => { ++generation; render(); location.textContent = 'Banner / ' + label(); message.textContent = '内置图片 · 点击缩略图应用'; });
  close.addEventListener('click', () => dialog.close());
  function outside(event) { const r = dialog.getBoundingClientRect(); return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom; }
  dialog.addEventListener('pointerdown', event => { backdrop = event.button === 0 && event.target === dialog && outside(event); });
  dialog.addEventListener('pointercancel', () => { backdrop = false; });
  dialog.addEventListener('click', event => { if (backdrop && event.target === dialog && outside(event)) dialog.close(); backdrop = false; });
  dialog.addEventListener('close', () => { ++generation; cleanup(); grid.replaceChildren(); working = false; });
  const root = document.documentElement;
  new MutationObserver(() => {
    if (dialog.open) dialog.close();
    centerBanner();
  }).observe(root, {attributes:true, attributeFilter:['data-theme']});
  globalThis.BannerPicker = {open(value) { target = value; document.getElementById('bannerTitle').textContent = label() + ' Banner'; dialog.showModal(); load(); }};

  // Decorative animation only runs while the header is on screen.
  const visual = document.querySelector('.hero-visual');
  const motion = globalThis.matchMedia?.('(prefers-reduced-motion: no-preference)');
  let visible = false;
  let pointerFrame = 0, pointerEvent;
  function centerBanner() {
    if (!motion) return;
    if (pointerFrame) cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    visual.style.removeProperty('--banner-x');
    visual.style.removeProperty('--banner-y');
  }
  const update = () => {
    const paused = !visible || document.hidden;
    visual.classList.toggle('banner-motion-paused', paused);
    if (paused) centerBanner();
  };
  if (globalThis.IntersectionObserver) new IntersectionObserver(entries => { visible = entries[0].isIntersecting; update(); }).observe(visual);
  else { visible = true; update(); }
  document.addEventListener('visibilitychange', update);
  if (motion) {
    const clamp = value => Math.max(-1, Math.min(1, value));
    visual.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse' || root.dataset.theme !== 'light' || !motion.matches || !visible || document.hidden) return;
      pointerEvent = event;
      if (pointerFrame) return;
      pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        const bounds = visual.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        visual.style.setProperty('--banner-x', (6 * clamp((pointerEvent.clientX - bounds.left) / bounds.width * 2 - 1)).toFixed(2) + 'px');
        visual.style.setProperty('--banner-y', (4 * clamp((pointerEvent.clientY - bounds.top) / bounds.height * 2 - 1)).toFixed(2) + 'px');
      });
    }, {passive:true});
    visual.addEventListener('pointerleave', centerBanner);
    visual.addEventListener('pointercancel', centerBanner);
    motion.addEventListener('change', centerBanner);
  }
})();
