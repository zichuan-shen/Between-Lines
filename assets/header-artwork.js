/* A separate local database stores the chosen image, never task records. */
(() => {
  'use strict';
  const artwork = document.getElementById('headerArtwork');
  const choose = document.getElementById('artworkChoose');
  const reset = document.getElementById('artworkReset');
  const fileInput = document.getElementById('artworkFile');
  const status = document.getElementById('artworkStatus');
  const allowed = new Set(['image/png','image/jpeg','image/webp','image/gif','image/avif']);
  const root = document.documentElement;
  const theme = () => root.dataset.theme === 'light' ? 'light' : 'dark';
  const label = value => value === 'light' ? '亮色' : '暗色';
  const key = value => 'headerImage.' + value;
  let dbPromise, objectURL, revision = 0, pickerTheme;
  function openDB() {
    if (!dbPromise) dbPromise = new Promise((resolve,reject) => {
      const request = indexedDB.open('questLogAppearance', 2);
      request.onupgradeneeded = event => {
        const store = event.oldVersion === 0 ? request.result.createObjectStore('settings') : request.transaction.objectStore('settings');
        // Upgrade both theme slots atomically, retaining the previous shared image.
        const legacy = store.get('headerImage');
        legacy.onsuccess = () => {
          if (legacy.result instanceof Blob && allowed.has(legacy.result.type)) {
            store.put(legacy.result, key('light'));
            store.put(legacy.result, key('dark'));
            store.delete('headerImage');
          }
        };
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); dbPromise = null; };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('storage blocked'));
    }).catch(error => { dbPromise = null; throw error; });
    return dbPromise;
  }
  async function access(mode, operation) {
    const db = await openDB();
    return new Promise((resolve,reject) => {
      const transaction = db.transaction('settings', mode);
      const request = operation(transaction.objectStore('settings'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('storage failed'));
    });
  }
  function show(value) {
    const preset = globalThis.BannerCatalog?.[theme()]?.find(item => item.id === value?.preset);
    const blob = value instanceof Blob ? value : value?.blob instanceof Blob ? value.blob : null;
    const old = objectURL;
    objectURL = blob ? URL.createObjectURL(blob) : null;
    if (objectURL) artwork.style.backgroundImage = `url("${objectURL}")`;
    else if (preset) artwork.style.backgroundImage = `url("${preset.src}")`;
    else artwork.style.removeProperty('background-image');
    if (preset || value?.blob) artwork.style.backgroundPosition = preset?.position || value.position || 'center';
    else artwork.style.removeProperty('background-position');
    artwork.classList.toggle('custom-artwork', !!blob || !!preset);
    reset.hidden = !blob && !preset;
    if (old) URL.revokeObjectURL(old);
  }
  function busy(value) { choose.disabled = reset.disabled = value; }
  async function validate(file) {
    if (!allowed.has(file.type)) throw new Error('请选择 PNG、JPG、WebP、GIF 或 AVIF 图片。');
    if (file.size > 12 * 1024 * 1024) throw new Error('图片过大，请选择 12 MB 以内的图片。');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise((resolve,reject) => { image.onload = resolve; image.onerror = () => reject(new Error('无法读取这张图片，请换一张重试。')); image.src = url; });
      if (image.naturalWidth * image.naturalHeight > 40000000) throw new Error('图片分辨率过高，请选择总像素不超过 4000 万的图片。');
    } finally { URL.revokeObjectURL(url); }
  }
  function upload(target) { pickerTheme = target || theme(); fileInput.value = ''; fileInput.click(); }
  choose.addEventListener('click', () => {
    if (globalThis.BannerPicker) globalThis.BannerPicker.open(theme());
    else upload(theme());
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const target = pickerTheme || theme();
    pickerTheme = null;
    busy(true);
    status.textContent = '正在保存' + label(target) + '图片…';
    try {
      await validate(file);
      await access('readwrite', store => store.put(file, key(target)));
      if (theme() === target) {
        ++revision;
        show(file);
        status.textContent = label(target) + '图片已保存在本浏览器';
      }
    } catch (error) {
      if (theme() === target) status.textContent = /请选择|图片|读取/.test(error.message) ? error.message : '未能保存图片，请检查浏览器存储空间后重试。';
    } finally { busy(false); }
  });
  reset.addEventListener('click', async () => {
    const target = theme();
    busy(true);
    try {
      await access('readwrite', store => store.delete(key(target)));
      if (theme() === target) {
        ++revision;
        show(null);
        status.textContent = label(target) + '主题已恢复默认图片';
      }
    } catch (_) { if (theme() === target) status.textContent = '未能恢复默认，请稍后重试。'; }
    finally { busy(false); }
  });
  async function refresh() {
    const current = ++revision, target = theme();
    choose.setAttribute('aria-label', '更换' + label(target) + '主题标题图片');
    reset.setAttribute('aria-label', '恢复' + label(target) + '主题默认标题图片');
    choose.title = '选择' + label(target) + ' Banner；从素材目录选择或上传图片';
    reset.title = '仅恢复' + label(target) + '主题的默认图片';
    status.textContent = '';
    show(null);
    try {
      const blob = await access('readonly', store => store.get(key(target)));
      if (current === revision && ((blob instanceof Blob && allowed.has(blob.type)) || (blob?.blob instanceof Blob && allowed.has(blob.blob.type)) || globalThis.BannerCatalog?.[target]?.some(item => item.id === blob?.preset))) show(blob);
    } catch (_) {
      if (current === revision) status.textContent = '图片设置暂时无法读取，当前显示默认图片。';
    }
  }
  globalThis.HeaderArtwork = {
    access, upload,
    async select(value, target, position) {
      if (value instanceof Blob) await validate(value);
      else if (!globalThis.BannerCatalog?.[target]?.some(item => item.id === value?.preset)) throw new Error('图片不存在，请重新选择。');
      if (value instanceof Blob && position) value = {blob:value, position};
      await access('readwrite', store => store.put(value, key(target)));
      if (theme() === target) { ++revision; show(value); status.textContent = label(target) + '图片已保存'; }
    }
  };
  new MutationObserver(refresh).observe(root, {attributes:true, attributeFilter:['data-theme']});
  refresh();
})();
