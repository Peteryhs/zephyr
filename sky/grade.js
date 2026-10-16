import { clamp, smooth, mix, blend, linearY, gaussian, rad } from './math.js';
export const GRADE_BASE = Object.freeze({ exposure: .777664168999131, adaptation: .24676937284934922, gradientContrast: 1.2, shoulder: .85, saturation: 1.38, vibrance: .46, scotopic: .6, twilightHue: 0, twilightChroma: 0, purple: .59, duskStretch: .7, moonBoost: .0105, horizonBloom: .35, textureVibrancy: 1, blueHue: -12, sunsetPink: .8 });
export const LIFT_BASE = Object.freeze({exposure:1.2,saturation:1.6,vibrance:1.33});
export function liftedGrade(lift, grade = GRADE_BASE) {
  const result = {...grade};
  for (const k of ['exposure','saturation','vibrance']) result[k] = GRADE_BASE[k]*(typeof lift?.[k] === 'number' && lift[k]>0 ? lift[k] : 1);
  return result;
}
export function projectGamut(rgb) {
  if (rgb.every(v=>v>=0&&v<=1)) return rgb;
  const n = clamp(linearY(rgb),1e-7,1);
  let f = 0;
  for (const v of rgb) if (v<0) f=Math.max(f,v/(v-n)); else if(v>1) f=Math.max(f,(v-1)/(v-n));
  return blend(rgb,[n,n,n],Math.min(1,f+.0001));
}
export function toOklab([r,g,b]) {
  const l=Math.cbrt(Math.max(0,.4122214708*r+.5363325363*g+.0514459929*b));
  const m=Math.cbrt(Math.max(0,.2119034982*r+.6806995451*g+.1073969566*b));
  const s=Math.cbrt(Math.max(0,.0883024619*r+.2817188376*g+.6299787005*b));
  return [.2104542553*l+.7936177850*m-.0040720468*s,1.9779984951*l-2.4285922050*m+.4505937099*s,.0259040371*l+.7827717662*m-.8086757660*s];
}
export function fromOklab([L,a,b]) {
  L = Math.max(0,L);
  const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.2914855480*b)**3;
  return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.7076147010*s];
}
const floors = [[.001129,.001882,.004337],[.001793,.002852,.006832],[.002495,.003879,.009470],[.003475,.005312,.013156]];
const framing = [65,30,10,3];
const encode = v => v<=.0031308 ? 12.92*v : 1.055*v**(1/2.4)-.055;
const rotate = (a,b,theta) => [a*Math.cos(theta)-b*Math.sin(theta),a*Math.sin(theta)+b*Math.cos(theta)];
export function gradePalette(linear, e, grade = GRADE_BASE) {
  const effective = e>=0 ? e : e/(1+1.2*grade.duskStretch);
  const R = Math.max(1e-12,linear.reduce((v,c)=>v+linearY(c),0)/4);
  const cols = linear.map((rgb,i)=>{
    const Y=linearY(rgb);
    const tone=grade.exposure*(R/4000)**grade.adaptation*(Math.max(1e-9,Y)/R)**grade.gradientContrast;
    const target=mix(tone,tone/(1+tone),grade.shoulder);
    let [L,a,b]=toOklab(projectGamut(Y>1e-7 ? rgb.map(v=>v*target/Y) : [0,0,0]));
    const sc=grade.scotopic*clamp((-.301029995663981-Math.log10(Math.max(1e-9,Y)))/2.5);
    a*=1-.35*sc; b=b*(1-.35*sc)-.25*sc*L;
    const tw=gaussian(effective,-3,5);
    [a,b]=rotate(a,b,rad(grade.twilightHue*tw)); a*=1+grade.twilightChroma*tw; b*=1+grade.twilightChroma*tw;
    const p=gaussian(effective,-4,4.5)*gaussian(framing[i],22,16)*grade.purple*Math.min(1,3*L);
    a+=.045*p; b-=.055*p;
    const vibrance=1+grade.vibrance*Math.max(0,1-Math.hypot(a,b)/.13);
    a*=vibrance*grade.saturation; b*=vibrance*grade.saturation;
    [a,b]=rotate(a,b,rad(grade.blueHue*clamp((-b-.015)/.05)));
    [a,b]=rotate(a,b,rad(-38*grade.sunsetPink*gaussian(effective,-.5,1.8)*clamp((b-.008)/.05)));
    const mud=Math.max(1-smooth((L-.16)/.26),smooth((-e-5)/6));
    a*=1-.75*mud; if(b>0)b*=1-.92*mud;
    const mapped=fromOklab([L,a,b]).map((v,j)=>floors[i][j]+clamp(v)*(1-floors[i][j]));
    return projectGamut(mapped).map(encode);
  });
  const old2=[...cols[2]];
  cols[2]=blend(cols[2],cols[3],.45*grade.horizonBloom);
  cols[1]=blend(cols[1],old2,.28*grade.horizonBloom);
  return cols;
}
