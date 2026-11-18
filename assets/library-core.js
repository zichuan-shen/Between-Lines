(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LibraryCore=api;})(globalThis,()=>{
 'use strict';
 const MAX_FILE=25*1024*1024,MAX_BACKUP=256*1024*1024,encoder=new TextEncoder(),decoder=new TextDecoder();
 const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
 function safeUrl(value){if(!value)return '';try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol))throw Error();return u.href;}catch(_){throw Error('来源链接需要是 http 或 https 地址。');}}
 function tags(value){return [...new Set((Array.isArray(value)?value:String(value||'').split(/[,，、\n]/)).map(x=>String(x).trim().slice(0,30)).filter(Boolean))].slice(0,12);}
 function card(raw){
  if(!raw||!validId(raw.id)||typeof raw.title!=='string'||!raw.title.trim()||raw.title.length>120||typeof raw.note!=='string'||raw.note.length>20000||!['inbox','featured','archived'].includes(raw.state)||!Number.isFinite(raw.createdAt)||!Number.isFinite(raw.updatedAt)||!Array.isArray(raw.assets)||raw.assets.length>100)throw Error('素材卡片格式不完整。');
  const assets=raw.assets.map(a=>{if(!a||!validId(a.id)||typeof a.name!=='string'||a.name.length>250||!Number.isInteger(a.size)||a.size<0||a.size>MAX_FILE||typeof a.type!=='string'||a.type.length>120)throw Error('附件信息无效。');return {id:a.id,name:a.name,type:a.type,size:a.size};});
  return {originNoteId:validId(raw.originNoteId)?raw.originNoteId:'',id:raw.id,title:raw.title.trim(),note:raw.note,source:safeUrl(raw.source),tags:tags(raw.tags),category:['玩法想法','竞品参考','表现参考','问题与观察','随手记'].includes(raw.category)?raw.category:'随手记',state:raw.state,createdAt:raw.createdAt,updatedAt:raw.updatedAt,assets};
 }
 function manifest(raw){if(!raw||raw.app!=='quest-inspiration'||raw.version!==1||!Array.isArray(raw.cards)||raw.cards.length>20000)throw Error('这不是灵感馆第一版支持的备份。');const cards=raw.cards.map(card),ids=new Set();for(const c of cards){if(ids.has(c.id))throw Error('备份内存在重复卡片编号。');ids.add(c.id);}return {app:'quest-inspiration',version:1,exportedAt:Number(raw.exportedAt)||Date.now(),cards};}
 function merge(existing,incoming){const map=new Map(existing.map(c=>[c.id,c]));for(const c of incoming){const old=map.get(c.id);if(!old||c.updatedAt>old.updatedAt)map.set(c.id,c);}return [...map.values()];}
 const table=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 function crc(bytes){let c=0xffffffff;for(const n of bytes)c=table[(c^n)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
 function header(size){const bytes=new Uint8Array(size);return {bytes,v:new DataView(bytes.buffer)};}
 async function zip(entries){
  let offset=0,total=0;const locals=[],central=[];
  for(const [name,blob] of entries){
   if(!/^manifest\.json$|^assets\/[a-zA-Z0-9_-]{1,100}$/.test(name))throw Error('备份文件名无效。');
   const data=new Uint8Array(await blob.arrayBuffer()),n=encoder.encode(name),checksum=crc(data);total+=data.length;if(total>MAX_BACKUP)throw Error('完整备份超过 256 MB，请绑定目录保存，或分别导出单张卡片。');
   const h=header(30+n.length);h.v.setUint32(0,0x04034b50,true);h.v.setUint16(4,20,true);h.v.setUint16(6,0x800,true);h.v.setUint16(12,33,true);h.v.setUint32(14,checksum,true);h.v.setUint32(18,data.length,true);h.v.setUint32(22,data.length,true);h.v.setUint16(26,n.length,true);h.bytes.set(n,30);locals.push(h.bytes,data);
   const c=header(46+n.length);c.v.setUint32(0,0x02014b50,true);c.v.setUint16(4,20,true);c.v.setUint16(6,20,true);c.v.setUint16(8,0x800,true);c.v.setUint16(14,33,true);c.v.setUint32(16,checksum,true);c.v.setUint32(20,data.length,true);c.v.setUint32(24,data.length,true);c.v.setUint16(28,n.length,true);c.v.setUint32(42,offset,true);c.bytes.set(n,46);central.push(c.bytes);offset+=h.bytes.length+data.length;
  }
  if(entries.length>20001)throw Error('备份文件数量过多。');
  const e=header(22),centralSize=central.reduce((sum,x)=>sum+x.length,0);e.v.setUint32(0,0x06054b50,true);e.v.setUint16(8,entries.length,true);e.v.setUint16(10,entries.length,true);e.v.setUint32(12,centralSize,true);e.v.setUint32(16,offset,true);
  return new Blob([...locals,...central,e.bytes],{type:'application/zip'});
 }
 async function unzip(blob){
  if(blob.size>MAX_BACKUP+8*1024*1024)throw Error('备份大于 256 MB，无法一次恢复。');
  const bytes=new Uint8Array(await blob.arrayBuffer()),v=new DataView(bytes.buffer),files=new Map();
  if(bytes.length<22)throw Error('备份文件损坏。');let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(v.getUint32(i,true)===0x06054b50){end=i;break;}}
  if(end<0||v.getUint16(end+4,true)||v.getUint16(end+6,true))throw Error('备份 ZIP 格式不支持。');
  const count=v.getUint16(end+10,true);let pos=v.getUint32(end+16,true),total=0;
  if(count>20001||pos+v.getUint32(end+12,true)>end)throw Error('备份目录损坏或过大。');
  for(let i=0;i<count;i++){
   if(pos+46>end||v.getUint32(pos,true)!==0x02014b50)throw Error('备份目录损坏。');
   const size=v.getUint32(pos+24,true),compressed=v.getUint32(pos+20,true),nameLen=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true),local=v.getUint32(pos+42,true);
   if(v.getUint16(pos+10,true)!==0||v.getUint16(pos+8,true)&1||compressed!==size)throw Error('请导入由灵感馆直接导出的完整 ZIP 备份，不要重新压缩。');
   if(pos+46+nameLen+extra+comment>end||local+30>bytes.length)throw Error('备份目录越界。');
   const name=decoder.decode(bytes.slice(pos+46,pos+46+nameLen));if(!/^manifest\.json$|^assets\/[a-zA-Z0-9_-]{1,100}$/.test(name)||files.has(name))throw Error('备份内文件名无效或重复。');
   if(v.getUint32(local,true)!==0x04034b50)throw Error('备份文件头损坏。');
   const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);total+=size;
   if(start+size>v.getUint32(end+16,true)||total>MAX_BACKUP)throw Error('备份附件越界或过大。');
   const data=bytes.slice(start,start+size);if(crc(data)!==v.getUint32(pos+16,true))throw Error('备份校验失败，文件可能不完整。');files.set(name,data);pos+=46+nameLen+extra+comment;
  }
  if(!files.has('manifest.json'))throw Error('备份缺少卡片目录。');return files;
 }
 return {MAX_FILE,MAX_BACKUP,validId,safeUrl,tags,card,manifest,merge,zip,unzip};
});
