const fs=require('fs'),path=require('path');
const launch=require('./perf-browser.cjs');
const root=path.resolve(__dirname,'..'),file=process.argv[2]||'plugin.js',label=process.argv[3]||'current';
const src=fs.readFileSync(path.resolve(root,file),'utf8').replace(/\r\n/g,'\n');
const a=src.indexOf('    let syncAuroraStars ='),b=src.indexOf('    // ── Tabs:',a);
const block=src.slice(a,b)+'\nreturn {sync:()=>syncAuroraStars()}';
(async()=>{
 const browser=await launch();
 try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:2});await page.setContent('<html><body></body></html>');
 const cdp=await page.context().newCDPSession(page);
 const startup=await page.evaluate(code=>{
  Object.defineProperty(document,'hasFocus',{value:()=>true,configurable:true});
  const run=new Function('ctx','stored','STORE_KEYS','AURORA_THEME','SKY_THEME',code),results=[];
  for(const aurora of [false,true])for(let i=0;i<10;i++){
   document.documentElement.dataset.hermesTheme=aurora?'zephyr-aurora':'zephyr-sky';const clean=[];
   const start=performance.now();const p=run({onDispose:fn=>clean.push(fn)},()=>undefined,{sky:'sky'},'zephyr-aurora','zephyr-sky');
   results.push({aurora,ms:performance.now()-start});clean.forEach(fn=>fn());
  }
  document.documentElement.dataset.hermesTheme='zephyr-aurora';
  run({onDispose:()=>{}},()=>undefined,{sky:'sky'},'zephyr-aurora','zephyr-sky');
  return results;
 },block);
 await page.waitForTimeout(300);
 await cdp.send('Tracing.start',{categories:'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,cc,benchmark,viz,gpu',transferMode:'ReturnAsStream'});
 await page.waitForTimeout(2500);
 const done=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const {stream}=await done;
 let trace='';for(;;){const p=await cdp.send('IO.read',{handle:stream});trace+=p.data;if(p.eof)break}await cdp.send('IO.close',{handle:stream});
 const events=JSON.parse(trace).traceEvents;
 const summarize=name=>{const e=events.filter(e=>e.name===name&&e.ph==='X');return {count:e.length,totalMs:e.reduce((s,e)=>s+(e.dur||0),0)/1000}};
 const stats={label,startup,traceSeconds:2.5,paint:summarize('Paint'),raster:summarize('RasterTask'),layout:summarize('Layout'),style:summarize('UpdateLayoutTree'),drawFrameEvents:events.filter(e=>e.name==='DrawFrame').length};
 const out=path.join(root,'artifacts/aurora-perf');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,label+'-stars.json'),JSON.stringify(stats,null,2));console.log(JSON.stringify(stats));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
