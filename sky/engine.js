import {clamp,smooth,mix,blend,scale,bounded,screen,luminance,gaussian,rad} from './math.js';
import {resolveClock,solarGeom,sunScreenPos,skyGlow,moonIllum,moonAltitude,daySeed,monthlyDust} from './clock.js';
import {GRADE_BASE,LIFT_BASE,liftedGrade} from './grade.js';
import {palette,bodyColor,ATMOSPHERE_VERSION} from './atmosphere.js';
export {solarGeom,bodyY,sunScreenPos,skyGlow,moonIllum,moonAltitude,daySeed} from './clock.js';
export {GRADE_BASE,LIFT_BASE} from './grade.js';

export const DESKTOP_SCENE={latitude:43.6532,longitude:-79.3832,place:'Toronto',timeZone:'America/Toronto',code:2,cloud:45,wind:9,windDirection:250,aqi:35,temperature:12,low:null,mid:null,high:null,aod:null,humidity:null,hourly:true,hour:null,date:null,lift:{...LIFT_BASE}};
const IMPORT_SCENE={...DESKTOP_SCENE,latitude:37.3688,longitude:-122.0363,place:'Sunnyvale',timeZone:'America/Los_Angeles',code:1,cloud:25,temperature:18,lift:null};
export const DEFAULT_STATE={manualCode:null,manualCloud:null,manualWind:null,manualAQI:null,manualAOD:null,stagedCloud:false,visibility:null,diffuse:null,transmission:null,snowDepth:null,cityLight:null};
export const DEFAULT_TUNING={
  influence:{time:1,weather:1,temperature:.8},density:.9,warp:1.7,grain:.018,
  composition:{referenceAspect:1,crop:.15},shaft:{strength:1.1,coverage:.5,reach:1},
  cirrus:{angle:15,variance:8,fiber:1.1,opacity:.53,bias:-.17,evolution:.008,breakDepth:.44,grain:2.8},
  rays:{strength:.1,scale:8,falloff:6},halo:{strength:.25,radius:.28,dispersion:1.7,softness:1,force:false},
  purity:{polar:.9,aureole:.6,width:10,whiten:.25,purple:.3,center:30,sigma:16,shadow:.4,scale:5,force:false},
  lighting:{thin:.75,back:1,highTint:.5,airlight:.8,reddening:1},afterglow:.25,nightFloor:.2,
  dogs:{strength:.9,tail:4.1,force:false},corona:{strength:.1,radius:6,purity:.6,force:false},cityStrength:.3,lutAmount:0
};
export const SIMULATOR={0:{cloud:6,wind:6,aod:.05},1:{cloud:25,wind:8,aod:.08},2:{cloud:45,wind:10,aod:.12},3:{cloud:96,wind:12,aod:.20},45:{cloud:100,wind:3,aod:.60},53:{cloud:88,wind:12,aod:.25},63:{cloud:92,wind:18,aod:.20},73:{cloud:90,wind:14,aod:.15},95:{cloud:95,wind:38,aod:.30}};
export function snapshotTuning(patch={}) {
  return Object.fromEntries(Object.entries(DEFAULT_TUNING).map(([key,value])=>[key,typeof value==='object'?{...value,...patch[key]}:patch[key]??value]));
}
export const effCode=(scene,state=DEFAULT_STATE)=>state.manualCode??scene.code;
export function effCloud(scene,state=DEFAULT_STATE) {
  return Math.max(7,state.manualCloud??(state.manualCode!=null?SIMULATOR[state.manualCode]?.cloud:undefined)??(!scene.hourly&&state.stagedCloud?42:scene.cloud));
}
export const aqiAod=q=>Math.min(.55,.05+1.15*(clamp(q-100,0,400)/300)**1.5);
export const visibilityAod=v=>v>100?clamp(3912/v,.02,1.5):null;
export function effAod(scene,state=DEFAULT_STATE,cover=effCloud(scene,state)) {
  if(state.manualAOD!=null)return state.manualAOD;
  if(state.manualCode!=null||state.manualAQI!=null)return Math.max(state.manualCode!=null?(SIMULATOR[state.manualCode]?.aod??.12):0,state.manualAQI!=null?aqiAod(state.manualAQI):0);
  let a=scene.aod??aqiAod(scene.aqi);
  if(scene.aod==null&&scene.humidity!=null)a=Math.max(a,.06+Math.max(0,scene.humidity-70)/30*.12);
  const visibility=visibilityAod(state.visibility);
  if(visibility!=null)a=Math.max(a,Math.max(0,visibility-.15)*.9*(1-.5*smooth((cover-50)/45)));
  return .05+1.15*Math.max(0,a-.12)**1.3;
}
export const displayAod=a=>.03+.17*(1-Math.exp(-Math.max(0,a-.02)/.4));
export const turbidity=(a,rh)=>clamp(Math.max(smooth((a-.05)/.35),rh==null?0:.45*smooth((rh-55)/40)));
const isSnow=c=>(c>=71&&c<=77)||c===85||c===86;
export function conditionProfile(code) {
  if(code===0)return {milk:0,density:-.14,glow:1.2};
  if(code===1)return {milk:0,density:0,glow:1.05};
  if(code===2)return {milk:0,density:.14,glow:.90};
  if(code===3)return {milk:.05,density:.34,glow:.35};
  if(code===45||code===48)return {milk:.06,density:.30,glow:.15};
  if(code>=51&&code<=57)return {milk:.03,density:.28,glow:.30};
  if(code>=61&&code<=67)return {milk:0,density:.38,glow:.20};
  if(isSnow(code))return {milk:.24,density:.30,glow:.30};
  if(code>=80&&code<=82)return {milk:0,density:.36,glow:.22};
  if(code>=95)return {milk:0,density:.52,glow:.12};
  return {milk:0,density:0,glow:1};
}
export function deckCharacter(c) {
  if(c>=95)return {white:.95,brightness:.60,tint:[.92,.95,1.05]};
  if(isSnow(c))return {white:.95,brightness:1.05,tint:[.98,1,1.04]};
  if(c>=80)return {white:.92,brightness:.82,tint:[.94,.97,1.05]};
  if(c>=61)return {white:.92,brightness:.80,tint:[.93,.97,1.06]};
  if(c>=51)return {white:.90,brightness:.90,tint:[.96,.98,1.03]};
  if(c===45||c===48)return {white:.90,brightness:.97,tint:[1,1,1]};
  return {white:.85,brightness:1,tint:[1,1,1]};
}
export function environmentalDeck(scene,state) {
  if(state.manualCode!=null)return {thin:0,presence:1,brightness:1};
  let thin=0,presence=1,brightness=1;
  if(scene.low!=null&&scene.mid!=null&&scene.high!=null) {
    const sum=scene.low+scene.mid+scene.high;
    if(sum>20)thin=clamp(scene.high/sum);
  }
  if(state.diffuse!=null){thin=Math.max(thin,.9*clamp((.95-state.diffuse)/.45));presence=.25+.75*clamp((state.diffuse-.35)/.5);}
  if(state.transmission!=null)brightness=clamp(.75+.45*Math.min(1,state.transmission),.8,1.1);
  if(state.snowDepth>.02)brightness*=1+Math.min(.15,.5*state.snowDepth);
  return {thin,presence,brightness};
}
export function cloudDeck(cols,amount,character,environment) {
  if(amount<=.001)return cols.map(c=>[...c]);
  const A=Math.min(.75,amount),H=environment.thin,B=character.brightness*environment.brightness;
  const mean=cols.reduce((n,c)=>n+luminance(c),0)/4;
  const dl=Math.min(.90,mean*(1.18+.10*H))*B,s=1+A;
  const vertical=[1+.06*s,1+.02*s,1-.03*s,1-.08*s],cool=[.975,.995,1.03],weights=[1.5,1.2,.95,.8],strengths=[.92,.96,1,1.08];
  const common=A*character.white*(1-.35*H);
  return cols.map((c,i)=>{
    const target=cool.map((v,j)=>clamp(clamp(dl*vertical[i])*(1+(v-1)*weights[i])*character.tint[j]));
    const rgb=bounded(blend(c,target,clamp(common*strengths[i])));
    const warm=clamp(Math.max(0,rgb[0]-rgb[2]-.006)*40),n=luminance(rgb);
    return blend(rgb,[n,n,n],Math.min(1,A/.6)*warm);
  });
}
export function precipitation(c) {
  if(c>=51&&c<=55)return [.35,0,.7];
  if(c===56||c===57)return [.30,.25,.7];
  if(c>=61&&c<=65)return [.60,0,1];
  if(c===66||c===67)return [.50,.30,1];
  if(c>=71&&c<=77)return [0,.70,1];
  if(c===85||c===86)return [0,.85,1.3];
  if(c>=80&&c<=82)return [.75,0,1.3];
  if(c>=95)return [.90,c>=96?.25:0,1.6];
  return [0,0,1];
}
export function detUnit(width,height,referenceAspect=1,crop=.15) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new RangeError('Render dimensions must be finite and positive.');
  return Math.max(1,Math.min(height,mix(width/Math.max(.1,referenceAspect),height,clamp(crop))));
}

export function evaluate(input,epoch=Date.now(),options={}) {
  const scene={...DESKTOP_SCENE,...input},state={...DEFAULT_STATE,...options.state};
  const look=snapshotTuning(options.tuning),grade=options.grade??liftedGrade(scene.lift);
  if(!Number.isFinite(scene.latitude)||!Number.isFinite(scene.longitude)||(!scene.hourly&&!Number.isFinite(scene.hour??12)))throw new TypeError('Coordinates and hour must be finite.');
  const clock=resolveClock(scene,epoch,options.retainedHour??12),h=clock.hour;
  const geom=solarGeom(scene.latitude,scene.longitude,h,clock.date,clock.offset),e=geom.altitude,d=-e;
  const m=moonAltitude(clock.moonEpoch,scene.latitude,scene.longitude),I=moonIllum(clock.baseEpoch);
  const body=skyGlow(h,geom,m,I),sunpos=sunScreenPos(h,geom),c=effCloud(scene,state),code=effCode(scene,state);
  const w=look.influence.weather,a=smooth(((state.manualAQI??scene.aqi)-150)/250)*w;
  const physical=effAod(scene,state,c),display=displayAod(physical),T=turbidity(physical,scene.humidity);
  const seed=daySeed(clock.date,scene.latitude,scene.longitude),dust=monthlyDust(clock.date,scene.latitude,scene.longitude);
  const profile=conditionProfile(code),env=environmentalDeck(scene,state);
  let cover=smooth((c-15)/85)**2;
  if(code>=51)cover=Math.max(cover,.85);
  cover*=w*env.presence;
  if(code<=2)cover=Math.min(cover,.30);
  const deck=Math.min(cover,.75),tex=grade.textureVibrancy;
  let puff=smooth((c-12)/30)*(code<=2?1:1-smooth((c-68)/27))*w*(1-deck)*tex;
  const displacement=Math.max(.3+.7*smooth((c-8)/55),.8*smooth((-e-12)/6));
  let night=.6*smooth((-e-10)/6)*w*tex;
  const haze=(.12+.30*smooth((c-8)/45)*(1-.55*deck)*(code<=2?.5:1))*smooth((e-2)/8)*w;
  let cols=palette(e,display,m,I,grade);
  const squashK=smooth(d/4.5)*(1-smooth((d-7)/4));
  cols[1]=blend(cols[1],cols[0],.28*squashK);
  cols[2]=blend(cols[2],cols[1],.35*squashK);
  cols=cloudDeck(cols,deck,deckCharacter(code),env);
  cols=cols.map(rgb=>bounded(blend(rgb,[.88,.90,.93],profile.milk*w)));
  const ember=gaussian(e,0,11)*smooth((e+9)/7),emberWeights=[.05,.13,.30,.55];
  cols=cols.map((rgb,i)=>bounded(screen(scale(rgb,1-.10*a),[1,.40,.14],emberWeights[i]*a*ember)));
  const guard=smooth((e-10)/12);
  cols=cols.map(rgb=>{
    const warm=clamp(Math.max(0,rgb[0]-rgb[2]-.004)*40),neutral=Math.min(1,1.04*luminance(rgb)+.02);
    return blend(rgb,[neutral,neutral,neutral],guard*warm);
  });
  const ebb=1-.25*smooth(Math.min(((h+1)%24+24)%24,12)/3.5);
  const city=(state.cityLight??.35)*look.cityStrength*smooth((-e-6)/8)*(1+.9*deck)*ebb;
  cols=cols.map((rgb,i)=>screen(rgb,[1,.80,.58],[0,.10,.38,1][i]*.55*city));
  let glowCol=bodyColor(body.altitude,display);
  if(body.body==='moon')glowCol=blend(glowCol,[.72,.78,.98],.65);
  let redF=[1,1,1];
  if(body.body==='sun') {
    const z=Math.max(body.altitude,.5),air=Math.min(8,1/(Math.sin(rad(z))+.15*(z+3.885)**-1.253));
    const excess=Math.max(0,physical-display)*look.lighting.reddening;
    redF=[.35,.50,.70].map(v=>Math.exp(-excess*air*v));
    glowCol=glowCol.map((v,i)=>v*redF[i]);
  }
  const visibility=mix(1,profile.glow,w)*(1-.65*(c/100)*w);
  const glowStr=body.strength*visibility*look.influence.time*.85*(1-.55*a);
  glowCol=blend(glowCol,[1,.45,.20],.7*a);
  let milk=bounded(scale([.88,.90,.93],.30+.80*luminance(cols[1])));
  function tintAt(weight) {
    const rgb=bodyColor(Math.max(e,-2),display).map((v,i)=>v*redF[i]),l=Math.max(.05,luminance(rgb));
    return rgb.map(v=>1+weight*(v/l-1));
  }
  const tint=tintAt(.35*smooth((8-e)/5)*(1-smooth(-e/1.8))*smooth((c-10)/30)*w);
  const tintHi=tintAt(.35*look.lighting.highTint*smooth((8-e)/5)*(1-smooth((-e-3.2)/1.8))*w);
  const dip=smooth((d+.5)/1.5)*(1-smooth((d-2)/1));
  milk=scale(blend(milk,Array(3).fill(luminance(milk)),.60*dip),1-.22*dip);
  puff*=1-.35*dip;
  const after=smooth((d-2.2)/1.3)*(1-smooth((d-5.5)/1.7))*smooth((c-5)/35)*w;
  const l2=Math.max(.05,luminance(cols[2])),rose=bounded([1,.58,.52].map((v,i)=>.6*v+.36*cols[2][i]/l2));
  milk=bounded(milk.map((v,i)=>v*(1-.45*after)+rose[i]*.50*after));
  night=Math.max(night,.38*after*tex*look.afterglow);
  const precipRaw=precipitation(code),fogRaw=code===45||code===48?.72:0,dry=fogRaw===0&&precipRaw[0]+precipRaw[1]===0?1:0;
  const up=smooth((e+2)/6),isSun=body.body==='sun';
  const haloWeather=(1-smooth((c-75)/20))*(1-smooth((deck-.30)/.30))*(1-smooth((physical-.35)/.45))*dry*w*(1-.55*a);
  const halo=isSun?look.halo.strength*up*(look.halo.force?1:haloWeather):0;
  let dogs=[0,0,look.dogs.tail*look.halo.radius/22];
  if(isSun&&e>-1) {
    const z=rad(Math.max(0,e)),u=Math.sqrt(1.7161-Math.sin(z)**2)/(2*Math.cos(z));
    if(u<1) {
      const sep=(2*Math.asin(u)*180/Math.PI-60)*look.halo.radius/22;
      const ice=scene.high!=null?.5+.5*smooth((scene.high-10)/40):.75;
      dogs=[look.dogs.strength*smooth((e+1)/3)*(1-smooth((e-15)/40))*(look.dogs.force?1:haloWeather*ice),sep,dogs[2]];
    }
  }
  const mid=scene.mid!=null?.4+.6*smooth((scene.mid-10)/40):.7;
  const coronaGate=look.corona.force?1:smooth((c-20)/30)*(1-smooth((c-78)/12))*(1-deck)*mid*dry*w;
  const corona=[look.corona.strength*smooth((body.altitude-2)/5)*(isSun?.35:.3+.7*I)*coronaGate,look.corona.radius*(.75+.5*seed[3])*look.halo.radius/22,look.corona.purity*(isSun?.4:1)];
  const daylight=smooth((e+6)/8),force=look.purity.force;
  const polar=look.purity.polar*daylight*(force?1:(1-.85*T)*(1-deck)*(1-.5*a)*w);
  const aureole=[look.purity.aureole*daylight*(force?1:(.6+.8*T)*(1-deck)*w),look.purity.width+(force?0:22*T+6*(1-smooth(e/30)))];
  const whiten=.29*look.purity.whiten*daylight*(force?1:(.2+.8*T)*(1-deck)*w);
  const twilight=smooth((d-2.5)/2)*(1-smooth((d-6)/2.5));
  const open=(1-deck)*(1-.7*smooth((c-30)/50))*w;
  const casting=.5*smooth((seed[0]-.3)/.5)+.5*smooth((c-15)/45);
  const purple=[look.purity.purple*twilight*(force?1:dust*open),look.purity.center,look.purity.sigma];
  const crep=look.purity.shadow*twilight*(force?1:dust*open*casting);
  const cloudy=.3+.7*smooth((c-10)/40),day=smooth((e+1)/4),low=1-smooth(e/12);
  const lit=[look.lighting.thin*day*cloudy*w,look.lighting.back*day*cloudy*w,look.lighting.airlight*low*smooth((e+6)/8)];
  const floorGate=smooth((-e-6)/6),f=clamp(look.nightFloor);
  const floorZ=scale(blend([.020,.028,.060],[.090,.120,.290],f),floorGate),floorH=scale(blend([.030,.042,.085],[.125,.165,.340],f),floorGate);
  const shape=up*(.55+.45*Math.exp(-((Math.max(0,e-6)/26)**2)));
  const rays=isSun?look.rays.strength*shape*visibility*look.influence.time*(1-.55*a)*(.35+.65*smooth((c-8)/30)):0;
  const heading=rad(scene.windDirection+180),direction=blend([.86,.50],[Math.sin(heading),Math.cos(heading)],w),norm=Math.hypot(...direction)||1;
  const wind=state.manualWind??(state.manualCode==null?scene.wind:SIMULATOR[state.manualCode]?.wind??scene.wind);
  const drift=scale(direction,mix(1,.55+1.25*smooth(wind/45),w)/norm);
  return {
    cols,dens:clamp(look.density*(1+w*(profile.density+.35*c/100))*(1+.35*a)*displacement,.05,1.8),
    glowPos:body.pos,glowCol,glowStr,glowSize:body.size,drift,precip:[precipRaw[0]*w,precipRaw[1]*w,precipRaw[2]],fog:fogRaw*w,milk,
    deck,puff,night,haze,squash:1-.45*squashK,tint,tintHi,rays,halo,sun:[...sunpos,e],polar,aureole,whiten,purple,crep,lit,floorZ,floorH,dogs,corona,dust,turb:T,seed,redF,
    diagnostics:{hour:h,solar:geom,moonAltitude:m,moonIllumination:I,body:body.body,physicalAod:physical,displayAod:display,cloud:c,code,grayDip:dip,afterglow:after,epoch,baseEpoch:clock.baseEpoch,moonEpoch:clock.moonEpoch,atmosphere:ATMOSPHERE_VERSION},
    look,grade:{...grade}
  };
}

export function createSimulation() {
  const scene={...DESKTOP_SCENE,lift:{...LIFT_BASE}},active={...IMPORT_SCENE},state={...DEFAULT_STATE},tuning=snapshotTuning();
  const grade={...GRADE_BASE}; let retainedHour=12;
  const cloneScene=()=>({...scene,lift:scene.lift?{...scene.lift}:scene.lift});
  const applyLift=lift=>Object.assign(grade,liftedGrade(lift,grade));
  const applyScene=patch=>{
    Object.assign(scene,patch); if(!scene.lift)scene.lift={...LIFT_BASE};
    for(const key of Object.keys(DESKTOP_SCENE)) if(key!=='lift'&&key!=='hour')active[key]=scene[key];
    active.hourly=!!active.hourly;
    if(scene.hour!=null)retainedHour=scene.hour;
    active.hour=retainedHour; applyLift(scene.lift);
    return cloneScene();
  };
  return {scene,active,state,tuning,grade,cloneScene,applyLift,applyScene,frameAt:()=>evaluate(active,Date.now(),{state,tuning,grade,retainedHour}),evaluateAt:epoch=>evaluate(active,epoch,{state,tuning,grade,retainedHour})};
}
const compatibility=createSimulation();
export const SCENE=compatibility.scene,skyState={scene:compatibility.active,environment:compatibility.state,tuning:compatibility.tuning};
export const applyScene=compatibility.applyScene,cloneScene=compatibility.cloneScene,applyLift=compatibility.applyLift,frameAt=compatibility.frameAt;
export const SKY2={palette,bodyColor,cloudDeck,environmentalDeck,visibilityAod,moonAltitude,grade:compatibility.grade};
