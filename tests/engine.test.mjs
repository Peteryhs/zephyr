import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluate,createSimulation,DESKTOP_SCENE,effAod,effCloud,aqiAod,visibilityAod,displayAod,turbidity,detUnit,precipitation,environmentalDeck,DEFAULT_STATE,daySeed} from '../sky/engine.js';
import {bodyY,resolveClock,zoneOffset,monthlyDust,skyGlow} from '../sky/clock.js';
import {GRADE_BASE,LIFT_BASE,liftedGrade,toOklab,fromOklab,projectGamut} from '../sky/grade.js';
import {sampleSky,bodyColor,palette} from '../sky/atmosphere.js';
import {drawParams,UNIFORM_NAMES} from '../sky/renderer.js';
const epoch=Date.parse('2026-10-15T16:00:00Z');
const noon=patch=>evaluate({hourly:false,hour:12,...patch},epoch);
const near=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} ≠ ${expected}`);
const allFinite=value=>typeof value==='number'?Number.isFinite(value):Array.isArray(value)?value.every(allFinite):value&&typeof value==='object'?Object.values(value).every(allFinite):true;
export function eveningHour(altitude,date=null){let lo=13,hi=24;for(let i=0;i<55;i++){const mid=(lo+hi)/2;if(noon({hour:mid,date}).sun[2]>altitude)lo=mid;else hi=mid;}return (lo+hi)/2;}

test('frozen Toronto geometry, fields and optical anchors match specification',()=>{
  const f=noon(),d=f.diagnostics;
  near(f.sun[2],36.1883301351);near(d.solar.sunrise,7.50190033854);near(d.solar.sunset,18.6023264220);near(d.solar.dayLength,11.1004260835);
  near(d.physicalAod,.05);near(f.turb,0);near(f.deck,.0816658877288);near(f.puff,.918334112271);near(f.dens,.962400065815);
  near(f.glowPos[0],.435548681356);near(f.glowPos[1],.421674045645);near(f.glowStr,.351637270701);
  near(f.drift[0],.638990982134);near(f.drift[1],.232573697461);near(f.halo,.25);near(f.polar,.826500701044);near(f.rays,.0424633660046);
});
test('import state differs from explicitly applied desktop scene',()=>{
  const sim=createSimulation();const initial=sim.evaluateAt(epoch);
  assert.equal(sim.active.place,'Sunnyvale');near(initial.grade.exposure,GRADE_BASE.exposure);
  sim.applyScene({hourly:false,hour:12});const frame=sim.evaluateAt(epoch);
  assert.equal(sim.active.place,'Toronto');near(frame.grade.exposure,.933197002798957);
});
test('grade lift is idempotent and partial lift resets absent channels',()=>{
  const sim=createSimulation();sim.applyScene({});sim.applyLift(LIFT_BASE);sim.applyLift(LIFT_BASE);near(sim.grade.saturation,2.208);
  sim.applyLift({exposure:1.1});near(sim.grade.exposure,GRADE_BASE.exposure*1.1);near(sim.grade.saturation,1.38);near(sim.grade.vibrance,.46);
  sim.applyLift();near(sim.grade.exposure,GRADE_BASE.exposure);
  for(const invalid of [0,-1,'2',NaN])near(liftedGrade({exposure:invalid}).exposure,GRADE_BASE.exposure);
});
test('scene copies isolate lift; null hour retains the prior manual time',()=>{
  const sim=createSimulation();sim.applyScene({hourly:false,hour:7.5});sim.applyScene({hour:null});near(sim.evaluateAt(epoch).diagnostics.hour,7.5);
  const copy=sim.cloneScene();copy.lift.exposure=4;assert.equal(sim.scene.lift.exposure,1.2);
  sim.applyScene({lift:{}});near(sim.grade.exposure,GRADE_BASE.exposure);
});
test('cloud precedence preserves null versus zero and 7% minimum',()=>{
  assert.equal(effCloud(DESKTOP_SCENE,{...DEFAULT_STATE,manualCode:3,manualCloud:0}),7);
  assert.equal(effCloud(DESKTOP_SCENE,{...DEFAULT_STATE,manualCode:3}),96);
  assert.equal(effCloud({...DESKTOP_SCENE,hourly:false},{...DEFAULT_STATE,stagedCloud:true}),42);
  assert.equal(effCloud(DESKTOP_SCENE,{...DEFAULT_STATE,manualCloud:120}),120);
});
test('sunny deck cap and fully overcast regimes',()=>{
  const sunny=noon({code:2,cloud:100}),overcast=noon({code:3,cloud:100}),clear=noon({code:0,cloud:0});
  near(sunny.deck,.3);near(sunny.puff,.7);near(overcast.deck,.75);near(overcast.puff,0);near(clear.deck,0);near(clear.puff,0);assert.ok(clear.dens>0);
});
test('manual aerosol and simulator paths bypass the live compression',()=>{
  near(effAod(DESKTOP_SCENE,{...DEFAULT_STATE,manualAOD:.8}),.8);
  near(effAod({...DESKTOP_SCENE,aod:.8}),.05+1.15*(.8-.12)**1.3);
  near(effAod(DESKTOP_SCENE,{...DEFAULT_STATE,manualCode:45}),.6);
  near(effAod({...DESKTOP_SCENE,code:45}),.05);
});
test('AQI proxy, severe wash and humidity paths',()=>{
  near(aqiAod(35),.05);near(aqiAod(100),.05);near(aqiAod(450),.55);
  near(noon({aqi:150}).redF[0],Math.exp(-Math.max(0,noon({aqi:150}).diagnostics.physicalAod-noon({aqi:150}).diagnostics.displayAod)*Math.min(8,1/(Math.sin(36.1883301351*Math.PI/180)+.15*(36.1883301351+3.885)**-1.253))*.35));
  const noMeasured=effAod({...DESKTOP_SCENE,humidity:100}),measured=effAod({...DESKTOP_SCENE,humidity:100,aod:.05});assert.ok(noMeasured>measured);
  assert.ok(turbidity(.05,100)>0);near(displayAod(.05),.042283607324146016);
  assert.ok(noon({aqi:400}).glowStr<noon({aqi:35}).glowStr);
});
test('visibility ignores 100m and lower, and uses the strict >100m gate',()=>{
  assert.equal(visibilityAod(100),null);assert.equal(visibilityAod(0),null);near(visibilityAod(101),1.5);
  assert.ok(effAod(DESKTOP_SCENE,{...DEFAULT_STATE,visibility:101})>effAod(DESKTOP_SCENE));
});
test('layer threshold and environmental deck signals',()=>{
  near(environmentalDeck({...DESKTOP_SCENE,low:5,mid:5,high:10},DEFAULT_STATE).thin,0);
  near(environmentalDeck({...DESKTOP_SCENE,low:5,mid:5,high:11},DEFAULT_STATE).thin,11/21);
  const env=environmentalDeck(DESKTOP_SCENE,{...DEFAULT_STATE,diffuse:.35,transmission:1,snowDepth:.3});near(env.presence,.25);near(env.brightness,1.1*1.15);
  assert.deepEqual(environmentalDeck(DESKTOP_SCENE,{...DEFAULT_STATE,manualCode:3,diffuse:.35}),{thin:0,presence:1,brightness:1});
});
test('gray dip, afterglow and twilight compression anchors',()=>{
  const dip=noon({hour:eveningHour(-1.5)}),rose=noon({hour:eveningHour(-3.5)});
  near(dip.puff,.596917172976,1e-6);near(dip.diagnostics.grayDip,1);near(rose.night,.095);near(rose.squash,.60679012345679);
  assert.equal(noon({hour:eveningHour(0)}).squash,1);
});
test('body handoff is strict at −5°, solar anchor remains solar',()=>{
  const geom={altitude:-5,sinAlt:Math.sin(-5*Math.PI/180),sunrise:7.5,dayLength:11.1};
  assert.equal(skyGlow(19,geom,20,.5).body,'moon');geom.altitude=-4.999999;assert.equal(skyGlow(19,geom,20,.5).body,'sun');
  const f=noon({hour:eveningHour(-5.000001)});assert.equal(f.diagnostics.body,'moon');near(f.sun[0],.84);near(f.sun[1],-.05,1e-6);assert.ok(bodyY(-4)<0);
});
test('moonless early morning and final floor values',()=>{
  const f=noon({hour:4.5});near(f.glowStr,0);near(f.night,.6);assert.deepEqual(f.floorZ,[.034,.0464,.106]);assert.deepEqual(f.floorH,[.049,.0666,.136]);
  const dark=evaluate({hourly:false,hour:4.5},epoch,{tuning:{nightFloor:0}});assert.ok(dark.floorZ.every(v=>v>0));
});
test('moon phase and seeds stay on base date while manual altitude moves',()=>{
  const a=noon({hour:1}),b=noon({hour:20});near(a.diagnostics.moonIllumination,b.diagnostics.moonIllumination);assert.deepEqual(a.seed,b.seed);assert.notEqual(a.diagnostics.moonAltitude,b.diagnostics.moonAltitude);
  const c=resolveClock({...DESKTOP_SCENE,hourly:false,hour:0},epoch);assert.equal(c.moonEpoch,epoch-12*3600000);
});
test('IANA offsets and simulated-date DST quirk are explicit',()=>{
  assert.equal(zoneOffset(epoch,'America/Toronto'),-14400);assert.equal(zoneOffset(Date.parse('2026-01-15T16:00:00Z'),'America/Toronto'),-18000);
  const c=resolveClock({...DESKTOP_SCENE,date:'2026-01-15',hourly:true},epoch);near(c.hour,12);assert.equal(c.offset,-18000);assert.equal(c.date.month,1);assert.equal(c.date.hour,12);
});
test('daily seed is stable, coordinate-rounded and an exact 2^-32 multiple',()=>{
  const date={year:2026,month:10,day:15};const a=daySeed(date,43.6532,-79.3832);
  assert.deepEqual(a,daySeed(date,43.6533,-79.3833));assert.notDeepEqual(a,daySeed({...date,day:16},43.6532,-79.3832));
  assert.ok(a.every(x=>x>=0&&x<1&&Number.isInteger(x*4294967296)));
  assert.notDeepEqual(daySeed(date,-1.05,0),daySeed(date,-1.051,0));
});
test('monthly dust-zero October and active January twilight',()=>{
  near(monthlyDust({year:2026,month:10},43.6532,-79.3832),0);assert.ok(monthlyDust({year:2026,month:1},43.6532,-79.3832)>0);
  const hour=eveningHour(-5.5),normal=noon({hour});near(normal.purple[0],0);near(normal.crep,0);
  const forced=evaluate({hourly:false,hour},epoch,{tuning:{purity:{force:true}}});near(forced.purple[0],.3);near(forced.crep,.4);
});
test('wet lids suppress solar optical phenomena; force retains solar timing',()=>{
  const rainy=noon({code:63,cloud:92});near(rainy.halo,0);near(rainy.dogs[0],0);near(rainy.corona[0],0);
  const forced=evaluate({hourly:false,hour:12,code:63,cloud:92},epoch,{tuning:{halo:{force:true},dogs:{force:true},corona:{force:true}}});near(forced.halo,.25);assert.ok(forced.dogs[0]>0);assert.ok(forced.corona[0]>0);
  const night=evaluate({hourly:false,hour:4.5},epoch,{tuning:{halo:{force:true},dogs:{force:true}}});near(night.halo,0);near(night.dogs[0],0);
});
test('physical aerosol closes halo and haze changes optical clarity independently',()=>{
  const f=evaluate({hourly:false,hour:12},epoch,{state:{manualAOD:.8}});near(f.halo,0);assert.ok(f.polar<noon().polar);assert.ok(f.aureole[1]>noon().aureole[1]);
  const humid=noon({aod:.05,humidity:95});assert.ok(humid.turb>0);near(humid.diagnostics.physicalAod,.05);
});
test('precipitation mixed categories and speed survive zero weather influence',()=>{
  assert.deepEqual(precipitation(56),[.3,.25,.7]);assert.deepEqual(precipitation(96),[.9,.25,1.6]);assert.deepEqual(precipitation(86),[0,.85,1.3]);
  const f=evaluate({hourly:false,hour:12,code:96},epoch,{tuning:{influence:{weather:0}}});assert.deepEqual(f.precip,[0,0,1.6]);near(f.halo,0);
});
test('weather/time influence retain documented partial off-switch behavior',()=>{
  const hour=eveningHour(1),f=evaluate({hourly:false,hour},epoch,{tuning:{influence:{weather:0,time:0}}});near(f.glowStr,0);near(f.rays,0);assert.ok(f.lit[2]>0);assert.ok(f.cols.flat().some(v=>v>0));
});
test('calm drift retains minimum speed and strong wind saturates',()=>{
  const calm=noon({wind:0}),strong=noon({wind:100});near(Math.hypot(...calm.drift),.55);near(Math.hypot(...strong.drift),1.8);
});
test('23:00 city-light wrap is preserved',()=>{
  const before=noon({hour:22.999}),after=noon({hour:23});assert.ok(after.cols[3][0]>before.cols[3][0]);
});
test('all five aspect examples and invalid dimensions',()=>{
  for(const [w,h,out]of [[1920,1080,1080],[1080,1920,1206],[400,800,460],[800,400,400],[1000,1000,1000]])near(detUnit(w,h),out);
  for(const dims of [[0,1],[1,-1],[NaN,1],[1,Infinity]])assert.throws(()=>detUnit(...dims));
});
test('Oklab conversion round trip and gamut projection',()=>{
  for(const rgb of [[.2,.4,.7],[0,0,0],[1,1,1]])fromOklab(toOklab(rgb)).forEach((v,i)=>near(v,rgb[i],1e-6));
  assert.ok(projectGamut([-.2,1.4,.4]).every(x=>x>=0&&x<=1));
});
test('bake sampler endpoints and log-lane interpolation remain finite',()=>{
  for(const e of [-90,-18,-1,0,36.2,90,120])for(const a of [.001,.03,.08,.15,1.2,2,10]){assert.ok(sampleSky(e,a).flat().every(Number.isFinite));assert.ok(bodyColor(e,a).every(Number.isFinite));}
  const l=sampleSky(15,.03),r=sampleSky(15,.08),mid=sampleSky(15,Math.sqrt(.03*.08));mid.flat().forEach((v,i)=>near(v,(l.flat()[i]+r.flat()[i])/2));
  assert.ok(palette(-18,.05).flat().every(x=>x>0&&x<=1));
});
test('independent noon palette stays near observed calibration envelope',()=>{
  const target=[[.0648151342,.5392501673,.9327261996],[.1567239567,.6923873118,.9884869799],[.4823593159,.8709778653,.9785302148],[.8207493325,.9318048326,.9416971304]];
  noon().cols.flat().forEach((v,i)=>near(v,target.flat()[i],.025));
});
test('all 47 uniforms are supplied, one triangle drawn, alpha zero preserved',()=>{
  const calls=new Map();let draws=0;
  const gl={TRIANGLES:4,uniform1f:(k,v)=>calls.set(k,v),uniform1i:(k,v)=>calls.set(k,v),drawArrays:(mode,start,count)=>{assert.deepEqual([mode,start,count],[4,0,3]);draws++;}};
  for(let n=2;n<=4;n++)gl[`uniform${n}fv`]=(k,v)=>calls.set(k,v);
  const locations=Object.fromEntries(UNIFORM_NAMES.map(k=>[k,k]));
  drawParams(gl,locations,noon(),{width:1920,height:1080,time:40,alpha:0});
  assert.equal(UNIFORM_NAMES.length,47);assert.equal(calls.size,47);assert.equal(draws,1);assert.equal(calls.get('uAlpha'),0);
});
test('fixed snapshots repeat and all weather/hour/season frames remain finite',()=>{
  assert.deepEqual(noon(),noon());
  for(const date of ['2026-01-15','2026-06-21','2026-10-15'])for(const code of [0,1,2,3,45,53,63,73,95])for(const hour of [0,4.5,8,12,18.7,23])assert.ok(allFinite(evaluate({hourly:false,hour,date,code},epoch)),`${date} ${code} ${hour}`);
});
