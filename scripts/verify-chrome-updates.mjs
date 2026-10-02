// Isolated extension contexts only. Synthetic update signals are not CWS delivery.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { buildChromeRelease } from './build-chrome.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const mode = process.argv.find(x => x.startsWith('--mode='))?.split('=')[1] || 'all';
assert(['capabilities','safety','ui','all'].includes(mode));
const output = process.env.UPDATE_QA_OUTPUT ? resolve(process.env.UPDATE_QA_OUTPUT)
  : await mkdtemp(join(tmpdir(), 'minimal-tab-updates-'));
await mkdir(output, {recursive:true});
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const extension = join(output, 'chrome');
await buildChromeRelease({sourceRoot:root, outputDir:extension, archivePath:join(output,'chrome-update-qa.zip')});
// Instrument only the disposable copy. Release sources expose no signal hook.
const bootstrapPath=join(extension,'chrome-bootstrap.mjs');
const bootstrap=await readFile(bootstrapPath,'utf8');
await writeFile(bootstrapPath, `
window.__reloads=0;
const nativeAdd=chrome.runtime.onUpdateAvailable.addListener.bind(chrome.runtime.onUpdateAvailable);
chrome.runtime.onUpdateAvailable.addListener=fn=>{window.__updateSignal=fn;nativeAdd(fn);};
const nativeReload=chrome.runtime.reload.bind(chrome.runtime);
chrome.runtime.reload=()=>{window.__reloads++;if(window.__realReload)nativeReload();};
`+bootstrap+`\nwindow.__updateTestService=service;window.__safety=updateSafety;`);
const report = { mode, output, checks:[], consoleErrors:[], limitations:[
  'Isolated unpacked Chromium, no personal profile or signed CWS update.',
  'Listener registration is native; any emitted update signal in this runner is synthetic.',
] };
report.sourceHashes=Object.fromEntries(await Promise.all([
  'chrome-bootstrap.mjs','chrome-update-service.mjs','chrome-update.css','newtab.js',
  'folder-gestures.mjs','storage-service.mjs','manifest.json','scripts/build-chrome.mjs',
].map(async name=>[name,createHash('sha256').update(await readFile(join(root,name))).digest('hex')])));
let context;
async function verifyUI(page,url,seed) {
  const many={...seed,selectedFolderId:'all',background:{...seed.background,value:'images/default-background.png'},links:Array.from({length:48},(_,i)=>({
    id:'site-'+i,title:'Site '+(i+1),url:'https://example.com/'+i,folderId:i%2?'work':'root',emoji:'🧭'
  }))};
  await page.evaluate(async state=>{const{createStorageService}=await import('./storage-service.mjs');
    assertSaved(await createStorageService().save(state));function assertSaved(result){if(!result.ok)throw Error('fixture save');}
  },many);
  await page.reload();await page.waitForFunction(()=>window.__safety?.getBlockReason()===null);
  const second=await context.newPage();await second.goto(url);
  await second.waitForFunction(()=>window.__safety?.getBlockReason()===null);
  await page.evaluate(()=>window.__updateTestService.snooze());
  await check('banner does not steal focus or move header, and hides under dialogs',async()=>{
    await page.locator('#settingsButton').focus();
    const header=await page.locator('.topbar').boundingBox();
    await page.evaluate(()=>window.__updateSignal({version:'1.8'}));
    await page.locator('#updateNotice').waitFor({state:'visible'});
    assert.equal(await page.locator('#updateNotice [role="status"]').textContent(),'Update ready');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'settingsButton');
    assert.deepEqual(await page.locator('.topbar').boundingBox(),header);
    await page.locator('#settingsButton').click();
    assert.equal(await page.locator('#updateNotice').isVisible(),false);
    await page.evaluate(()=>document.querySelector('dialog[open]').close());
    await page.locator('#updateNotice').waitFor({state:'visible'});
  });
  await check('keyboard Later hides all living pages and restores only its own focus',async()=>{
    await second.locator('#updateNotice').waitFor({state:'visible'});
    await page.locator('#applyUpdateButton').focus();await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'deferUpdateButton');
    await page.keyboard.press('Enter');
    await page.locator('#updateNotice').waitFor({state:'hidden'});
    await second.locator('#updateNotice').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>document.activeElement.id),'settingsButton');
    const data=await page.evaluate(async()=> (await chrome.storage.local.get('minimalTab.update.snooze.v1'))['minimalTab.update.snooze.v1']);
    assert(data.snoozedUntil>Date.now()+86_390_000&&data.snoozedUntil<=Date.now()+86_400_000);
    await page.evaluate(()=>window.__updateSignal({version:'1.8'}));
    assert.equal(await page.locator('#updateNotice').isVisible(),false);
    await page.evaluate(()=>window.__updateSignal({version:'1.9'}));
    await page.locator('#updateNotice').waitFor({state:'visible'});
  });
  await check('desktop and narrow layout reserve space above the last card',async()=>{
    for(const size of [{width:1280,height:800},{width:480,height:720}]) {
      await page.setViewportSize(size);
      await page.waitForFunction(()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--update-notice-space'))>0);
      await page.locator('.content').evaluate(e=>{e.scrollTop=e.scrollHeight;});
      const card=await page.locator('.link-card').last().boundingBox();
      const banner=await page.locator('#updateNotice').boundingBox();
      if(size.width===1280)assert(banner.height<=64,'compact ready banner should stay on one line');
      assert(card.y+card.height<banner.y,'last card covered');
      assert(banner.x>=0&&banner.x+banner.width<=size.width&&banner.y+banner.height<=size.height);
      await page.screenshot({path:join(output,`update-en-${size.width}.png`)});
    }
  });
  await check('busy form in another window refuses reload without losing its contents',async()=>{
    await second.locator('#addLinkButton').click();await second.locator('#linkUrl').fill('unfinished.example');
    await page.locator('#applyUpdateButton').click();
    assert.match(await page.locator('#updateNotice [role="status"]').textContent(),/Finish editing/);
    assert.equal(await second.locator('#linkUrl').inputValue(),'unfinished.example');
    assert.equal(await page.evaluate(()=>window.__reloads),0);
    await second.evaluate(()=>document.querySelector('dialog[open]').close());
  });
  await check('RU labels fit the same narrow layout',async()=>{
    const ru=await context.newPage();
    const messages=JSON.parse(await readFile(join(root,'_locales/ru/messages.json'),'utf8'));
    await ru.addInitScript(messages=>{if(globalThis.chrome?.i18n)chrome.i18n.getMessage=id=>id==='@@ui_locale'?'ru':messages[id]?.message||'';},messages);
    await ru.setViewportSize({width:480,height:720});await ru.goto(url);
    await ru.waitForFunction(()=>Boolean(window.__updateTestService));
    await ru.locator('#updateNotice').waitFor({state:'visible'});
    assert.equal(await ru.locator('#updateNotice [role="status"]').textContent(),'Обновление готово');
    assert.equal(await ru.locator('#applyUpdateButton').textContent(),'Обновить');
    await ru.screenshot({path:join(output,'update-ru-480.png')});await ru.close();
  });
  await check('two actual contexts dispatch once; uncertain outcome stays locked with recovery',async()=>{
    await page.locator('#applyUpdateButton').click();
    const duplicate=await second.evaluate(()=>window.__updateTestService.apply());assert.equal(duplicate.ok,false);
    assert.equal(await page.evaluate(()=>window.__reloads),1);assert.equal(await second.evaluate(()=>window.__reloads),0);
    await page.waitForFunction(()=>window.__updateTestService.snapshot().status==='recovery');
    assert.match(await page.locator('#updateNotice [role="status"]').textContent(),/Close all Minimal Tab tabs/);
    assert.equal(await page.locator('.shell').evaluate(e=>e.inert),true);
    const extra=await context.newPage();await extra.goto(url);await extra.waitForFunction(()=>Boolean(window.__updateTestService));
    assert.equal(await extra.locator('.shell').evaluate(e=>e.inert),true);
    const uncertain=await context.newPage();
    await uncertain.addInitScript(()=>{if(chrome.extension){const original=chrome.extension.getViews.bind(chrome.extension);
      chrome.extension.getViews=()=>{chrome.extension.getViews=original;throw Error('QA transient enumeration failure');};}});
    await uncertain.goto(url);await uncertain.waitForFunction(()=>Boolean(window.__updateTestService));
    assert.equal(await uncertain.locator('.shell').evaluate(e=>e.inert),true,'registration failure must not permit new edits');
    assert.equal(await uncertain.evaluate(()=>window.__minimalTabUpdatePageV1.inspect().reason),'unknown-context');
    assert.match(await uncertain.locator('#updateNotice [role="status"]').textContent(),/Close all Minimal Tab tabs/);
    await uncertain.evaluate(()=>document.querySelector('#addLinkButton').click());
    assert.equal(await uncertain.locator('dialog[open]').count(),0);
    await page.screenshot({path:join(output,'update-recovery.png')});
    for(const current of context.pages())await current.close();
    const reopened=await context.newPage();await reopened.goto(url);
    await reopened.waitForFunction(()=>window.__safety?.getBlockReason()===null);
    assert.equal(await reopened.locator('.shell').evaluate(e=>e.inert),false);
    assert.equal(await reopened.evaluate(()=>window.__reloads),0);
  });
  await check('ordinary preview without extension APIs stays silent and usable',async()=>{
    const server=createServer(async(req,res)=>{
      try {
        const name=new URL(req.url,'http://localhost').pathname.slice(1)||'newtab.html';
        if(name.includes('..'))throw Error('path');
        const data=name==='chrome-bootstrap.mjs'?bootstrap:await readFile(join(extension,name));
        res.setHeader('Content-Type',name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':/\.(mjs|js)$/.test(name)?'application/javascript':'application/octet-stream');
        res.end(data);
      }catch{res.statusCode=404;res.end();}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${server.address().port}`;
    const preview=await context.newPage();
    try {
      await preview.route(origin+'/**',route=>route.continue());await preview.goto(origin);
      await preview.locator('#settingsButton').click();await preview.locator('dialog[open]').waitFor();
      assert.equal(await preview.locator('#updateNotice').isVisible(),false);
    }finally{await preview.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  });
}
async function check(name, action) {
  try { await action(); report.checks.push({name,ok:true});console.log('PASS '+name); }
  catch(error){ report.checks.push({name,ok:false,error:error.stack});console.log('FAIL '+name+': '+error.message); }
}
try {
  context = await chromium.launchPersistentContext(join(output,'profile'), {
    channel:'chromium',headless:true,viewport:{width:1280,height:800},
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
  });
  await context.route(/^https?:/,route=>route.abort());
  context.setDefaultTimeout(7000);
  context.on('page',page=>page.on('pageerror',error=>report.consoleErrors.push(error.message)));
  // Reloading an unpacked extension requires developer mode even when the
  // initial --load-extension launch succeeds. Configure this QA profile only.
  const config = await context.newPage();
  await config.goto('chrome://extensions/');
  await config.evaluate(()=>chrome.developerPrivate.updateProfileConfiguration({inDeveloperMode:true}));
  await config.close();
  const page=context.pages()[0] || await context.newPage();
  await page.goto('chrome://newtab/');
  await page.locator('[data-folder][aria-pressed="true"]').waitFor();
  const url=await page.evaluate(()=>chrome.runtime.getURL('newtab.html'));
  const second=await context.newPage();await second.goto(url);
  const cdp=await context.newCDPSession(page);
  await cdp.send('Target.createTarget',{url,newWindow:true});
  await page.waitForFunction(()=>chrome.extension.getViews().filter(v=>v.document.readyState==='complete').length>=3);
  await check('native getViews exposes three extension pages in two browser windows',async()=>{
    const windows=new Set();
    for(const p of context.pages()){
      if(p.url()!=='chrome://newtab/' && !p.url().startsWith('chrome-extension://'))continue;
      const session=await context.newCDPSession(p);const info=await session.send('Browser.getWindowForTarget');windows.add(info.windowId);await session.detach();
    }
    assert(windows.size>=2);
    assert((await page.evaluate(()=>chrome.extension.getViews().length))>=3);
  });
  await check('native event listener registration works without a background component',async()=>{
    assert.equal(await page.evaluate(()=>{
      const listener=()=>{};chrome.runtime.onUpdateAvailable.addListener(listener);
      const exists=chrome.runtime.onUpdateAvailable.hasListener(listener);
      chrome.runtime.onUpdateAvailable.removeListener(listener);return exists;
    }),true);
  });
  await check('synchronous peer readiness is visible across actual new-tab contexts',async()=>{
    const pages=context.pages().filter(p=>p.url()===url || p.url()==='chrome://newtab/');
    for(const p of pages)await p.evaluate(()=>{window.__updateCapability={inspect:()=>({reason:null})};});
    assert.equal(await page.evaluate(()=>chrome.extension.getViews().every(v=>v.__updateCapability?.inspect().reason===null)),true);
    await second.evaluate(()=>{window.__updateCapability.inspect=()=>({reason:'initializing'});});
    assert.equal(await page.evaluate(()=>chrome.extension.getViews().some(v=>v.__updateCapability?.inspect().reason==='initializing')),true);
    await second.evaluate(()=>{delete window.__updateCapability;});
    assert.equal(await page.evaluate(()=>chrome.extension.getViews().some(v=>!v.__updateCapability)),true);
  });
  if(mode!=='capabilities') {
    const seed = {selectedFolderId:'all',shortcutsEnabled:true,
      folders:[{id:'root',name:'Favorites'},{id:'work',name:'Work'}],
      links:[{id:'a',title:'Example',url:'https://example.com/',folderId:'root',emoji:'🧭'},
        {id:'b',title:'Work',url:'https://github.com/',folderId:'work'}],
      background:{type:'image',value:'data:image/png;base64,'+(await readFile(join(root,'icons/icon-128.png'))).toString('base64'),overlay:.3,overlayColor:'#17122b'}};
    await page.evaluate(async seed=>{
      const {createStorageService}=await import(chrome.runtime.getURL('storage-service.mjs'));
      if(!(await createStorageService().save(seed)).ok)throw Error('QA seed failed');
    },seed);
    const pages=context.pages().filter(p=>p.url()===url||p.url()==='chrome://newtab/');
    for(const p of pages) {
      await p.reload();await p.locator('[data-folder="work"]').waitFor();
      await p.waitForFunction(()=>Boolean(window.__updateTestService));
      await p.evaluate(()=>window.__updateSignal({version:'1.7'}));
    }
    const apply=()=>page.evaluate(()=>window.__updateTestService.apply());
    const ready=()=>Promise.all(pages.map(p=>p.waitForFunction(()=>window.__safety.getBlockReason()===null)));
    await ready();
    await check('real application dialogs and rename drafts in another window block reload',async()=>{
      for(const id of ['addLinkButton','addFolderButton','settingsButton']){
        await second.locator('#'+id).click();assert.equal((await apply()).ok,false);
        assert.equal(await second.locator('dialog[open]').count(),1);
        await second.evaluate(()=>document.querySelector('dialog[open]').close());
        assert.equal(await page.evaluate(()=>window.__reloads),0);
      }
      await second.locator('#addFolderButton').click();
      await second.locator('[data-rename-folder="work"]').click();
      await second.locator('[data-folder-rename-input="work"]').fill('Unsaved draft');
      assert.equal((await apply()).ok,false);
      assert.equal(await second.locator('[data-folder-rename-input="work"]').inputValue(),'Unsaved draft');
      await second.evaluate(()=>document.querySelector('dialog[open]').close());
    });
    await check('file reading remains busy after its dialog closes',async()=>{
      await second.evaluate(()=>{window.__fileText=File.prototype.text;
        File.prototype.text=function(){return new Promise(resolve=>{window.__finishFile=()=>resolve('{}');});};});
      await second.locator('#settingsButton').click();
      await second.locator('#backupSettingsTab').click();
      await second.locator('#importBackupInput').setInputFiles({name:'slow.json',mimeType:'application/json',buffer:Buffer.from('{}')});
      await second.waitForFunction(()=>Boolean(window.__finishFile));
      await second.evaluate(()=>document.querySelector('dialog[open]').close());
      assert.equal(await second.evaluate(()=>window.__safety.getBlockReason()),'saving');
      assert.equal((await apply()).ok,false);
      await second.evaluate(()=>{File.prototype.text=window.__fileText;window.__finishFile();});
      await ready();
    });
    await check('fulfilled failed folder save still leaves a blocking pending selection',async()=>{
      await second.evaluate(()=>{window.__originalSet=chrome.storage.sync.set;chrome.storage.sync.set=async()=>{throw Error('QA save failure');};});
      await second.locator('[data-folder="work"]').click();
      await second.locator('#appStatus:not([hidden])').waitFor();
      assert.equal(await second.evaluate(()=>window.__safety.getBlockReason()),'selection');
      assert.equal((await apply()).ok,false);assert.equal(await page.evaluate(()=>window.__reloads),0);
      await second.evaluate(()=>{chrome.storage.sync.set=window.__originalSet;});
      await second.locator('[data-folder="all"]').click();await ready();
    });
    await check('background decode and slow selection save remain protected until settled',async()=>{
      await second.evaluate(()=>{window.__Image=Image;window.Image=class extends window.__Image {
        set src(value){window.__finishImage=()=>{super.src=value;};}
      };});
      await second.locator('#settingsButton').click();
      await second.locator('#backgroundImage').setInputFiles(join(root,'icons/icon-128.png'));
      await second.waitForFunction(()=>Boolean(window.__finishImage));
      await second.evaluate(()=>document.querySelector('dialog[open]').close());
      assert.equal(await second.evaluate(()=>window.__safety.getBlockReason()),'saving');
      assert.equal((await apply()).ok,false);
      await second.evaluate(()=>{window.Image=window.__Image;window.__finishImage();});await ready();
      await second.evaluate(()=>{const original=chrome.storage.sync.set;
        chrome.storage.sync.set=values=>new Promise((resolve,reject)=>{
          window.__finishSave=()=>{chrome.storage.sync.set=original;original.call(chrome.storage.sync,values).then(resolve,reject);};
        });});
      await second.locator('[data-folder="work"]').click();
      await second.waitForFunction(()=>Boolean(window.__finishSave));
      assert.equal((await apply()).ok,false);
      await second.evaluate(()=>window.__finishSave());await ready();
    });
    await check('active pointer drag in another page blocks applying',async()=>{
      const handle=second.locator('.drag-link').first();const box=await handle.boundingBox();
      await second.mouse.move(box.x+box.width/2,box.y+box.height/2);
      await second.mouse.down();await second.mouse.move(box.x+50,box.y+40,{steps:6});
      assert.equal(await second.evaluate(()=>window.__safety.getBlockReason()),'drag');
      assert.equal((await apply()).ok,false);
      await second.mouse.up();await ready();
    });
    await check('unknown new page refuses apply and closing it allows recovery',async()=>{
      const extra=await context.newPage();await extra.goto(url);
      await extra.waitForFunction(()=>Boolean(window.__updateTestService));
      await extra.evaluate(()=>{delete window.__minimalTabUpdatePageV1;});
      assert.equal((await apply()).ok,false);assert.equal(await page.evaluate(()=>window.__reloads),0);
      assert.equal(await page.locator('.shell').evaluate(e=>e.inert),false);await extra.close();
    });
    await check('real runtime reload is dispatched once and preserves application storage',async()=>{
      const before=await page.evaluate(async()=>({sync:await chrome.storage.sync.get(null),local:await chrome.storage.local.get(null)}));
      await page.evaluate(()=>{window.__realReload=true;});
      try { assert.equal((await apply()).ok,true); } catch(error) {
        if(!/Execution context was destroyed|Target.*closed/.test(error.message))throw error;
      }
      const monitor=await context.newPage();await monitor.goto('chrome://extensions/');
      await monitor.waitForFunction(async()=>{
        const entries=await chrome.developerPrivate.getExtensionsInfo({includeDisabled:true});
        return entries.some(e=>e.state==='ENABLED'&&!e.disableReasons.reloading);
      });
      const restored=await context.newPage();await restored.goto('chrome://newtab/');
      await restored.locator('[data-folder="work"]').waitFor();
      const after=await restored.evaluate(async()=>({sync:await chrome.storage.sync.get(null),local:await chrome.storage.local.get(null)}));
      assert.deepEqual(after,before);assert.equal(await restored.locator('[data-folder="work"][aria-pressed="true"]').count(),1);
      const restoredState=await restored.evaluate(async defaults=>{
        const {createStorageService}=await import(chrome.runtime.getURL('storage-service.mjs'));
        return (await createStorageService().load(defaults)).state;
      },seed);
      assert.equal(restoredState.links.find(x=>x.id==='a').emoji,'🧭');
      assert.equal(restoredState.background.value,seed.background.value);
      for(const other of context.pages())if(other!==restored)await other.close();
    });
    if(mode==='ui'||mode==='all')await verifyUI(context.pages()[0],url,seed);
  }
} catch(error){report.checks.push({name:'runner',ok:false,error:error.stack});console.log(error.stack);}
finally { await context?.close();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)); }
console.log('Report '+join(output,'report.json'));
if(report.checks.some(x=>!x.ok)||report.consoleErrors.length)process.exitCode=1;
