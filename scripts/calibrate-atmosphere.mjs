import {writeFile} from 'node:fs/promises';
import calibration from '../sky/atmosphere-calibration.js';
import {evaluate} from '../sky/engine.js';
const target=[[.0648151342,.5392501673,.9327261996],[.1567239567,.6923873118,.9884869799],[.4823593159,.8709778653,.9785302148],[.8207493325,.9318048326,.9416971304]];
const epoch=Date.parse('2026-10-15T16:00:00Z');
function loss(){const f=evaluate({hourly:false,hour:12},epoch);return f.cols.flat().reduce((s,v,i)=>s+(v-target.flat()[i])**2,0);}
let best=loss();
for(const step of [.12,.06,.03,.015,.007,.003,.001,.0003])for(let pass=0;pass<25;pass++) {
  let moved=false;
  for(let i=0;i<12;i++){
    const old=calibration[i];let selected=old;
    for(const sign of [-1,1]){
      calibration[i]=old*Math.exp(sign*step);
      if(calibration[i]<.4||calibration[i]>2.2)continue;
      const score=loss();if(score<best){best=score;selected=calibration[i];moved=true;}
    }
    calibration[i]=selected;
  }
  if(!moved)break;
}
await writeFile(new URL('../sky/atmosphere-calibration.js',import.meta.url),`// Spectral calibration of the independent bake at the supplied noon anchor.\n// Constant per-view RGB gains; this is calibration, not reference table parity.\nexport default ${JSON.stringify(calibration.map(v=>Number(v.toFixed(9))))};\n`);
console.log(JSON.stringify({rms:Math.sqrt(best/12),gains:calibration,cols:evaluate({hourly:false,hour:12},epoch).cols},null,2));
