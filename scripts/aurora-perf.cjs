// Real Chromium/WebGL rendering, fixed clock and weather. No Hermes data is loaded.
const fs = require('fs'), path = require('path');
const launch = require('./perf-browser.cjs');
const root = path.resolve(__dirname, '..');
const sourceFile = process.argv[2] || 'plugin.js', label = process.argv[3] || 'current';
const out = path.join(root, 'artifacts', 'aurora-perf'); fs.mkdirSync(out, {recursive:true});
const original = fs.readFileSync(path.resolve(root,sourceFile),'utf8').replace(/\r\n/g,'\n');
const source = original.replace("from '@hermes/plugin-sdk'", "from '/sdk.js'").replace("from 'react/jsx-runtime'", "from '/react.js'")
  .replace('  /* FIELD CACHE.', '  window.__lastGL = gl;\n  /* FIELD CACHE.') + '\nexport {createSky,QUALITY,WEATHER_PRESETS};';
(async()=>{
 const browser = await launch();
 try {
 const page = await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 await page.route('http://zephyr.test/**', async r=>{
  const url=new URL(r.request().url()); let body='',contentType='text/javascript';
  if(url.pathname==='/plugin.js')body=source;
  else if(url.pathname==='/sdk.js')body=fs.readFileSync(path.join(root,'tests/node_modules/@hermes/plugin-sdk/index.js'),'utf8');
  else if(url.pathname==='/react.js')body=fs.readFileSync(path.join(root,'tests/node_modules/react/jsx-runtime.js'),'utf8');
  else {body='<html><body style="margin:0;background:#000"></body></html>';contentType='text/html'}
  await r.fulfill({body,contentType});
 });
 await page.goto('http://zephyr.test/');
 const results=await page.evaluate(async()=>{
  const {createSky,WEATHER_PRESETS}=await import('/plugin.js');
  const realNow=performance.now.bind(performance), realTimeout=window.setTimeout;
  let time=0, seq=0, jobs=new Map();
  Object.defineProperty(performance,'now',{value:()=>time,configurable:true});
  Object.defineProperty(document,'hasFocus',{value:()=>true,configurable:true});
  window.setTimeout=(fn,delay)=>{const id=++seq;jobs.set(id,{fn,delay});return id};
  window.clearTimeout=id=>jobs.delete(id);
  const rows=[];
  for(const quality of ['low','balanced','high'])for(const aurora of [false,true]){
   for(let repeat=0;repeat<3;repeat++){
    time=0;jobs.clear();const started=realNow();
    const sky=createSky({quality,lat:43.65,lng:-79.38});if(!sky)throw Error('WebGL unavailable');
    const startupMs=realNow()-started, gl=window.__lastGL;
    const dbg=gl.getExtension('WEBGL_debug_renderer_info');
    const renderer=dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    sky.setHold(new Date(2026,10,2,23,0,0));sky.setWeather(WEATHER_PRESETS.clear,0,true);sky.setAurora(aurora);sky.setBlur(5);sky.start();
    let draws=0;const draw=gl.drawArrays.bind(gl);gl.drawArrays=(...a)=>{draws++;return draw(...a)};
    const step=()=>{const job=[...jobs.entries()][0];if(!job)throw Error('No scheduled frame');jobs.delete(job[0]);time+=Math.max(1,job[1].delay)+5;job[1].fn();};
    const pixel=new Uint8Array(4);
    const drain=()=>{gl.finish();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel)};
    for(let i=0;i<30;i++)step();drain();
    const samples=[];draws=0;const t0=time;
    for(let i=0;i<90;i++){const s=realNow();step();drain();samples.push(realNow()-s)}
    samples.sort((a,b)=>a-b);
    const canvas=sky.canvas.querySelector('canvas');
    rows.push({quality,aurora,repeat,renderer,startupMs,width:canvas.width,height:canvas.height,fps:90000/(time-t0),medianMs:samples[45],p95Ms:samples[85],meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,draws,gpuTimers:!!gl.getExtension('EXT_disjoint_timer_query'),png:repeat===0&&aurora?canvas.toDataURL():undefined});
    sky.dispose();
   }
  }
  window.setTimeout=realTimeout;
  return rows;
 });
 for(const r of results)if(r.png){fs.writeFileSync(path.join(out,label+'-'+r.quality+'.png'),Buffer.from(r.png.split(',')[1],'base64'));delete r.png;}
 fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify({label,viewport:[1920,1080],samplesPerRun:90,repeats:3,results},null,2));
 console.log(JSON.stringify(results.map(r=>({quality:r.quality,aurora:r.aurora,repeat:r.repeat,medianMs:r.medianMs,p95Ms:r.p95Ms,meanMs:r.meanMs,gpuTimers:r.gpuTimers})),null,2));
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
