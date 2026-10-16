import data from './atmosphere-data.js';
import calibration from './atmosphere-calibration.js';
import { clamp, blend } from './math.js';
import { gradePalette, GRADE_BASE } from './grade.js';
export const ATMOSPHERE_VERSION=data.version;
function laneAt(aod) {
  const a=clamp(aod||.12,.02,2),lanes=data.lanes;
  let i=0;
  while(i<lanes.length-2&&a>lanes[i+1])i++;
  return [i,clamp((Math.log(a)-Math.log(lanes[i]))/(Math.log(lanes[i+1])-Math.log(lanes[i])))];
}
function read(table,lane,y,count,stride,stop=0) {
  const i=Math.floor(y),t=y-i;
  const index=((lane*count+i)*stride+stop)*3;
  return [0,1,2].map(c=>table[index+c]+(table[index+stride*3+c]-table[index+c])*t);
}
export function sampleSky(e,aod) {
  const [lane,t]=laneAt(aod),y=clamp(e+18,0,107.999);
  return [0,1,2,3].map(stop=>blend(read(data.sky,lane,y,109,4,stop),read(data.sky,lane+1,y,109,4,stop),t).map((v,c)=>v*calibration[stop*3+c]));
}
export function bodyColor(e,aod) {
  const [lane,t]=laneAt(aod),y=clamp((e+2)/2,0,45.999);
  return blend(read(data.body,lane,y,47,1),read(data.body,lane+1,y,47,1),t);
}
export function palette(e,aod,moonAlt=-90,illumination=0,grade=GRADE_BASE) {
  const effective=e>=0?e:e/(1+1.2*grade.duskStretch);
  let linear=sampleSky(effective,aod);
  if(moonAlt>-18&&illumination>0) {
    const moon=sampleSky(moonAlt,aod),boost=illumination*grade.moonBoost/440000;
    linear=linear.map((c,i)=>c.map((v,j)=>v+moon[i][j]*boost));
  }
  return gradePalette(linear,e,grade);
}
