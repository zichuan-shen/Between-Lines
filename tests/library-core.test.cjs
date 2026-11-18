const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const C=require('../assets/library-core.js');
(async()=>{
 const c=C.card({id:'card-1',title:'奖励展示',note:'先展示关键奖励',source:'https://example.com/ref',tags:'赛季，奖励,奖励',category:'表现参考',state:'inbox',createdAt:1,updatedAt:2,assets:[{id:'asset-1',name:'截图.png',type:'image/png',size:4}]});
 assert.deepEqual(c.tags,['赛季','奖励']);assert.throws(()=>C.safeUrl('javascript:alert(1)'));assert.throws(()=>C.manifest({app:'other',version:1,cards:[]}));
 const manifest={app:'quest-inspiration',version:1,cards:[c],exportedAt:3};
 const zipped=await C.zip([['manifest.json',new Blob([JSON.stringify(manifest)])],['assets/asset-1',new Blob([new Uint8Array([1,2,3,4])])]]);
 const files=await C.unzip(zipped);assert.deepEqual([...files.get('assets/asset-1')],[1,2,3,4]);assert.equal(C.manifest(JSON.parse(new TextDecoder().decode(files.get('manifest.json')))).cards[0].title,'奖励展示');
 const zipPath=path.join(os.tmpdir(),'quest-library-test-'+Date.now()+'.zip');fs.writeFileSync(zipPath,Buffer.from(await zipped.arrayBuffer()));
 const script='import zipfile,sys,json\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n assert z.read("assets/asset-1")==bytes([1,2,3,4])\n assert json.loads(z.read("manifest.json"))["cards"][0]["title"]=="\\u5956\\u52b1\\u5c55\\u793a"\nprint("Standard ZIP reader verified")';
 const py=cp.spawnSync('python',['-c',script,zipPath],{encoding:'utf8'});fs.unlinkSync(zipPath);if(py.error?.code!=='ENOENT')assert.equal(py.status,0,py.stderr);
 const damaged=new Uint8Array(await zipped.arrayBuffer());damaged[48]^=1;await assert.rejects(()=>C.unzip(new Blob([damaged])),/校验/);
 await assert.rejects(()=>C.zip([['../bad',new Blob(['x'])]]),/文件名/);
 await assert.rejects(()=>C.unzip(new Blob(['broken'])),/损坏/);
 assert.equal(C.merge([c],[{...c,title:'旧稿',updatedAt:1}])[0].title,'奖励展示');assert.equal(C.merge([c],[{...c,title:'新稿',updatedAt:3}])[0].title,'新稿');
 assert.throws(()=>C.manifest({...manifest,cards:[c,c]}),/重复/);
 assert.throws(()=>C.card({...c,assets:[{...c.assets[0],id:'../bad'}]}),/附件/);
 console.log('PASS: card validation, safe URLs, tags, binary ZIP round-trip, Python ZIP interoperability, corruption rejection, unsafe paths, manifest validation and timestamp merge.');
})().catch(e=>{console.error(e);process.exitCode=1;});
