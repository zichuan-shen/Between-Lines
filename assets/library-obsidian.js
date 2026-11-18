((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LibraryObsidian = api;
})(globalThis, () => {
  'use strict';
  const assetRoot = '_行间附件';
  const images = new Set(['png','jpg','jpeg','webp','gif','avif','bmp']);
  const windowsSafe = (value, limit, fallback) => {
    const text = String(value).toWellFormed().normalize('NFC').replace(/[<>:"/\\|?*#[\]^%\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim();
    return Array.from(text).slice(0, limit).join('').replace(/^[ .]+|[ .]+$/g, '') || fallback;
  };
  const quoted = value => JSON.stringify(String(value));
  const markdownText = value => String(value).replace(/[\r\n]+/g, ' ').replace(/([\\`*_[\]<>])/g, '\\$1');
  const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, char => '%'+char.charCodeAt(0).toString(16));
  const date = timestamp => new Date(timestamp).toJSON();
  const tagName = value => {
    const tag = value.replace(/[^\p{L}\p{M}\p{N}_/-]+/gu, '-').replace(/^[-/]+|[-/]+$/g, '').replace(/\/{2,}/g, '/');
    return /^\p{N}+$/u.test(tag) ? '灵感-'+tag : tag;
  };
  const states = {inbox:'待整理',featured:'精选',archived:'归档'};

  function plan(card) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(card.id)) throw Error('灵感编号无效，无法导出。');
    const folderName = 'inspiration-'+card.id;
    const filename = windowsSafe(card.title, 58, '未命名灵感')+' — '+card.id.slice(0, 12)+'.md';
    const attachments = card.assets.map((asset, index) => {
      const ext = asset.name.match(/\.([a-z0-9]{1,12})$/i);
      const stem = ext ? asset.name.slice(0, -ext[0].length) : asset.name;
      const name = String(index+1).padStart(2,'0')+'-'+windowsSafe(stem, 64, '附件')+(ext?.[0] || '');
      const target = [assetRoot, folderName, name].map(encode).join('/');
      const image = ext && images.has(ext[1].toLowerCase()) && (!asset.type || asset.type.startsWith('image/'));
      return {...asset, name, link:(image?'!':'')+'['+markdownText(asset.name || '附件')+']('+target+')'};
    });
    const tags = [...new Set(card.tags.map(tagName).filter(Boolean))];
    const properties = [
      'title: '+quoted(card.title),
      'xingjian_id: '+quoted(card.id),
      'category: '+quoted(card.category),
      'status: '+quoted(states[card.state] || card.state)
    ];
    if (date(card.createdAt)) properties.push('created: '+date(card.createdAt));
    if (date(card.updatedAt)) properties.push('updated: '+date(card.updatedAt));
    if (card.source) properties.push('source: '+quoted(card.source));
    if (tags.length) properties.push('tags:', ...tags.map(tag => '  - '+quoted(tag)));
    if (card.tags.some(tag => tagName(tag)!==tag)) properties.push('original_tags:', ...card.tags.map(tag => '  - '+quoted(tag)));
    const sections = [
      ['---', ...properties, '---'].join('\n'),
      '# '+markdownText(card.title)
    ];
    if (card.note.trim()) sections.push(card.note.replace(/\r\n?/g, '\n'));
    if (card.source) sections.push('## 原始来源\n\n<'+card.source+'>');
    if (attachments.length) sections.push('## 素材附件\n\n'+attachments.map(asset => asset.link).join('\n\n'));
    return {filename, folderName, attachments, markdown:sections.join('\n\n')+'\n'};
  }

  async function existing(directory, name) {
    try { return await directory.getFileHandle(name); }
    catch (error) { if (error.name === 'NotFoundError') return null; throw error; }
  }
  async function writeNew(directory, name, value) {
    if (await existing(directory, name)) return false;
    const file = await directory.getFileHandle(name, {create:true});
    let writer;
    try {
      writer = await file.createWritable({mode:'exclusive'});
      if ((await file.getFile()).size !== 0) { await writer.abort(); return false; }
      await writer.write(value);
      await writer.close();
      return true;
    } catch (error) {
      if (writer) await writer.abort().catch(() => {});
      try {
        if ((await file.getFile()).size === 0) await directory.removeEntry(name);
      } catch (_) {}
      throw error;
    }
  }
  async function sameBlob(first, second) {
    if (first.size !== second.size) return false;
    const left = new Uint8Array(await first.arrayBuffer());
    const right = new Uint8Array(await second.arrayBuffer());
    return left.every((byte, index) => byte === right[index]);
  }
  async function send(directory, card, readAsset) {
    const result = plan(card);
    if (await existing(directory, result.filename)) return {filename:result.filename, exists:true};
    const blobs = [];
    for (const asset of result.attachments) {
      const blob = await readAsset(asset.id);
      if (!(blob instanceof Blob) || blob.size !== asset.size) throw Error('附件缺失或大小不符，未生成笔记。');
      blobs.push(blob);
    }
    if (result.attachments.length) {
      const root = await directory.getDirectoryHandle(assetRoot, {create:true});
      const folder = await root.getDirectoryHandle(result.folderName, {create:true});
      for (const [index, asset] of result.attachments.entries()) {
        if (await writeNew(folder, asset.name, blobs[index])) continue;
        const file = await existing(folder, asset.name);
        if (!file || !await sameBlob(await file.getFile(), blobs[index])) throw Error('收件箱里已有同名但内容不同的附件。未覆盖附件，也未生成笔记。');
      }
    }
    return {filename:result.filename, exists:!await writeNew(directory, result.filename, result.markdown)};
  }
  return {plan, send};
});
