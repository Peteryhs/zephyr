// Independently written from the rebuild specification. Display RGB pipeline.
export const VERT=`
attribute vec2 aPosition;
void main(){gl_Position=vec4(aPosition,0.0,1.0);}
`;
export const UNIFORM_NAMES=['uRes','uDet','uTime','uAlpha','uC0','uC1','uC2','uC3','uGlowPos','uGlowCol','uGlow','uGlowSize','uDensity','uWarp','uGrain','uDrift','uPrecip','uShaft','uFog','uMilk','uDeck','uPuff','uNight','uHaze','uSquash','uTint','uRays','uRayLook','uHalo','uHaloLook','uLut','uLutAmt','uTexV','uCirA','uCirB','uSun','uPolar','uAureole','uWhiten','uPurple','uCrep','uLit','uTintHi','uFloorZ','uFloorH','uDogs','uCorona'];
export const FRAG=`
precision highp float;
uniform vec2 uRes;
uniform float uDet,uTime,uAlpha;
uniform vec3 uC0,uC1,uC2,uC3;
uniform vec2 uGlowPos;
uniform vec3 uGlowCol;
uniform float uGlow,uGlowSize,uDensity,uWarp,uGrain;
uniform vec2 uDrift;
uniform vec3 uPrecip,uShaft;
uniform float uFog;
uniform vec3 uMilk;
uniform float uDeck,uPuff,uNight,uHaze,uSquash;
uniform vec3 uTint;
uniform float uRays;
uniform vec2 uRayLook;
uniform float uHalo;
uniform vec3 uHaloLook;
uniform sampler2D uLut;
uniform float uLutAmt,uTexV;
uniform vec4 uCirA,uCirB;
uniform vec3 uSun;
uniform float uPolar;
uniform vec2 uAureole;
uniform float uWhiten;
uniform vec3 uPurple;
uniform vec2 uCrep;
uniform vec3 uLit,uTintHi,uFloorZ,uFloorH,uDogs,uCorona;
const float PI=3.141592653589793;
float sat(float v){return clamp(v,0.0,1.0);}
float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec3 screenRGB(vec3 c,vec3 contribution){return c+contribution*(1.0-c);}
float hash(vec2 p){vec3 v=fract(vec3(p.x,p.y,p.x)*.1031);v+=dot(v,v.yzx+33.33);return fract((v.x+v.y)*v.z);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p),q=f*f*f*(f*(f*6.0-15.0)+10.0);
  return mix(mix(hash(i),hash(i+vec2(1,0)),q.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),q.x),q.y);
}
mat2 turn(float angle){float c=cos(angle),s=sin(angle);return mat2(c,s,-s,c);}
float field(vec2 p){
  float total=0.0,amplitude=.52;
  for(int i=0;i<4;i++){total+=amplitude*noise(p);p=mat2(.8,.6,-.6,.8)*p*1.9;amplitude*=.5;}
  return total;
}
vec3 spectral(float x){
  x=sat(x);
  if(x<.25)return mix(vec3(1,.35,.22),vec3(1,.62,.25),x*4.0);
  if(x<.5)return mix(vec3(1,.62,.25),vec3(1,.92,.55),(x-.25)*4.0);
  if(x<.75)return mix(vec3(1,.92,.55),vec3(1,1,.98),(x-.5)*4.0);
  return mix(vec3(1,1,.98),vec3(.82,.90,1),(x-.75)*4.0);
}
vec3 dogLobe(vec2 p,float side,float separation,float angularUnit,float tail){
  float x=side*p.x-separation,inner=1.6*angularUnit,outer=max(tail,1.5*angularUnit);
  float sx=x<0.0?inner:outer,sy=2.4*angularUnit;
  float envelope=exp(-.5*x*x/(sx*sx)-.5*p.y*p.y/(sy*sy));
  return envelope*spectral((x+inner)/(inner+1.6*outer));
}
void main(){
  vec2 pixel=gl_FragCoord.xy,uv=pixel/uRes,P=(pixel-.5*uRes)/uDet,K=uRes/uDet;
  float t=uTime;
  vec2 A=P-.018*t*uDrift;
  vec2 q=vec2(field(A+t*vec2(.010,.006)),field(A+vec2(5.2,1.3)-t*vec2(.007,.009)));
  vec2 r=vec2(field(1.4*A+1.1*uWarp*q+vec2(1.7,9.2)+t*vec2(.0035,-.0025)),field(1.4*A+1.1*uWarp*q+vec2(8.3,2.8)-t*vec2(.0025,.0035)));
  float f=mix(field(1.1*A+.8*uWarp*r),.5,.35);
  float g=sat(uv.y+(f-.5)*(.18+.6*uDensity)*(.88+.3*uv.y));
  float gm=pow(g,uSquash);
  vec3 c=mix(uC3,uC2,smoothstep(0.0,.45,gm));
  c=mix(c,uC1,smoothstep(.32,.78,gm));
  c=mix(c,uC0,smoothstep(.62,1.0,gm));

  float sky=1.0-smoothstep(.47,.78,f);
  float a1=radians(uSun.z+(112.5*(uv.y-.10)-uSun.z)*K.y),a2=radians(uSun.z);
  float az=radians((uv.x-uSun.x)*K.x*112.5);
  float cosine=clamp(sin(a1)*sin(a2)+cos(a1)*cos(a2)*cos(az),-1.0,1.0);
  float theta=acos(cosine),angle=degrees(theta);
  float purity=(1.0-cosine*cosine)/(1.0+cosine*cosine),pol=purity*uPolar*sky;
  c=max(vec3(0),mix(c,vec3(lum(c))+(c-lum(c))*1.25,pol))*(1.0-.45*pol);
  float broad=cosine>=0.0?cosine*cosine:0.0;
  float aureole=uAureole.x*(.35*broad+.65*exp(-angle/max(1.0,uAureole.y)))*sky;
  vec3 illum=mix(vec3(1),uGlowCol,.5);
  c=mix(c,illum*lum(c),.7*aureole);
  c=screenRGB(c,.55*aureole*illum);

  vec2 G=(uv-uSun.xy)*K;
  float alt=112.5*(uv.y-.10);
  if(uPurple.x>.001||uCrep.x>.001){
    float sigma=max(uPurple.z,1.0),dx=112.5*G.x,dy=alt-uPurple.y;
    float lobe=exp(-.5*(dx*dx/(2.56*sigma*sigma)+dy*dy/(sigma*sigma)))*smoothstep(-2.0,6.0,alt);
    float dist=max(length(G),.0001);vec2 direction=G/dist;
    float n=.7*noise(direction*uCrep.y+vec2(3.1,8.7)+.004*t)+.3*noise(direction*uCrep.y*2.1+vec2(6.4,1.9)-.003*t);
    float shadow=uCrep.x*smoothstep(.58,.82,n)*exp(-1.6*dist)*sky;
    c=screenRGB(c,vec3(.64,.25,.60)*uPurple.x*lobe*sky*(1.0-shadow));
    c=mix(c,c*vec3(.80,.86,.94),.6*shadow*(1.0-smoothstep(5.0,60.0,alt)));
  }

  c*=1.0+(f-.5)*(.05+.13*min(uDensity,1.7)+.7*uDeck)*(.85+.45*uv.y)*uTexV;
  c*=mix(vec3(1),uTint,smoothstep(.47,.78,f));
  float thick=smoothstep(.58,.80,f);
  float thin=smoothstep(.47,.60,f)*(1.0-smoothstep(.60,.74,f));
  float rim=smoothstep(.56,.66,f)*(1.0-smoothstep(.66,.78,f));
  float back=1.0-smoothstep(15.0,60.0,angle),front=smoothstep(70.0,120.0,angle);
  illum=mix(vec3(1),uGlowCol,.6);
  c=mix(c,c*vec3(.90,.95,1.04)*.88,uLit.x*thin);
  c*=1.0-.28*uLit.y*back*thick;
  c=screenRGB(c,illum*uLit.y*back*(.35*rim+.45*thin));
  c=screenRGB(c,illum*.14*uLit.y*front*thick);

  if(uPuff>.001){
    vec2 Pa=P-.007*t*uDrift;
    float dv=noise(.4*Pa+vec2(19.3,4.7))-.5;
    float alpha=uCirA.x+8.0*dv*dv*dv*uCirA.y;
    vec2 R=turn(-alpha)*P-.007*t*uDrift;
    float ev=t*uCirB.y;
    float wobble=noise(vec2(2.6*R.x,4.0*R.y)+vec2(11.1,6.3))-.5;
    float strand=noise(vec2(.7*R.x,12.0*uCirA.z*R.y+1.5*wobble)+vec2(7.7,2.2+ev));
    float fine=noise(vec2(1.6*R.x,26.0*uCirA.z*R.y+3.2*wobble)+vec2(3.3,9.1-1.7*ev));
    float bank=noise(vec2(.35*R.x,1.5*R.y)+vec2(3.1,8.4)+t*vec2(.008,.005));
    float veil=smoothstep(.35,.95,.65*strand+.35*fine)*smoothstep(.25-uCirB.x,.85-uCirB.x,bank)*smoothstep(.10,.30,uv.y);
    vec2 cellP=6.0*uCirB.w*R;
    float cell=.55*noise(cellP+.9*wobble+vec2(4.2,1.9+.6*ev))+.30*noise(2.1*mat2(.8,.6,-.6,.8)*cellP+vec2(9.4,3.3-ev))+.15*noise(3.7*cellP+vec2(1.3,7.9));
    veil*=(1.0-uCirB.z)+uCirB.z*smoothstep(.32,.75,cell);
    vec3 material=min(uMilk*1.22*uTintHi,vec3(1));
    vec3 overlay=mix(2.0*c*material,1.0-2.0*(1.0-c)*(1.0-material),step(vec3(.5),c));
    c=mix(c,overlay,uPuff*veil*uCirA.w);
    c+=uMilk*veil*uPuff*uNight*.9;
  }
  c+=uMilk*clamp(f-.46,0.0,.40)*uNight*(.8+.4*uv.y);

  float z=.5*(alt+sqrt(alt*alt+4.0))+1.0;
  float airMass=1.0/(sin(radians(z))+.15*pow(z+3.885,-1.253));
  float whiteAmount=1.0-exp(-uWhiten*airMass);
  float lowSun=1.0-smoothstep(5.0,25.0,uSun.z);
  illum=mix(vec3(1),uGlowCol,.6*lowSun);
  illum=mix(illum,illum*vec3(.88,.93,1.14),uLit.z);
  c=mix(c,illum*mix(lum(c),.92,.6),whiteAmount);
  float lowBand=1.0-smoothstep(.02,.52,uv.y);
  float hazeTex=smoothstep(.30,.72,f)-.5;
  c*=1.0+.9*hazeTex*uHaze*lowBand;
  float sheet=smoothstep(.45,.95,r.y)*uDensity;
  c=mix(c,1.05*c+.015,.22*sheet);
  if(uFog>.001){
    float fogField=field(.85*A+vec2(4.1,7.7));
    float bank=smoothstep(.42,.60,.5*f+.5*fogField);
    float tatter=smoothstep(.35,.75,field(2.3*A+vec2(9.3,1.2)));
    c=mix(c,uMilk,uFog*(.10+.90*bank*(.55+.45*tatter)));
  }

  vec2 B=(uv-uGlowPos)*K;
  float d2=dot(B,B)/(uGlowSize*uGlowSize);
  c=screenRGB(c,uGlowCol*uGlow*(.60*exp(-55.0*d2)+.25*exp(-11.0*d2)));
  vec2 O=.06*(vec2(.5)-uGlowPos)*K,H=B+O;
  float hr=length(H),patch=.6+.4*noise(.9*A+vec2(12.7,3.9));
  if(uHalo>.001){
    float dy=H.y/max(hr,.0001);
    float radius=uHaloLook.x*(1.0+(.5-uGlowPos.y)*.15*dy),width=.070*uHaloLook.z;
    float envelope=smoothstep(radius-.018,radius,hr)*(1.0-smoothstep(radius,radius+1.45*width,hr));
    float x=max((hr-radius)/width,0.0);
    float phase=log(1.0+.286*.4*uHaloLook.y*x)/.286+.6*(patch-.8);
    vec3 iridescence=.5+.5*cos(6.2831*phase+vec3(0,-2.094,-4.188));
    c=screenRGB(c,iridescence*envelope*mix(vec3(1),uGlowCol,.4)*uHalo*.13*patch);
  }
  float angularUnit=uHaloLook.x/22.0;
  if(uDogs.x>.001){
    vec3 dogs=dogLobe(H,1.0,uDogs.y,angularUnit,uDogs.z)+dogLobe(H,-1.0,uDogs.y,angularUnit,uDogs.z);
    float filament=.55+.45*noise(vec2(2.2*P.x,7.0*P.y)+vec2(3.3,8.1)+t*vec2(.010,.004));
    c=screenRGB(c,dogs*patch*filament*mix(vec3(1),uGlowCol,.5)*uDogs.x*.7);
  }
  if(uCorona.x>.001){
    float distance=length(B),unit=angularUnit;
    float aureoleCore=exp(-.5*distance*distance/pow(1.4*unit,2.0));
    float width=.9*unit*mix(1.6,.8,uCorona.z);
    float mainRing=exp(-.5*pow((distance-uCorona.y)/width,2.0));
    float innerRing=exp(-.5*pow((distance-.78*uCorona.y)/width,2.0))*uCorona.z;
    vec3 ringColor=mix(vec3(.85,.72,.60),vec3(.95,.55,.35),uCorona.z);
    vec3 corona=.55*aureoleCore*vec3(.80,.86,1)+mainRing*ringColor*(.25+.35*uCorona.z)+innerRing*vec3(.55,.80,.75)*.15;
    c=screenRGB(c,corona*(.5+.5*smoothstep(.45,.70,f))*uCorona.x);
  }
  if(uRays>.001){
    float distance=max(sqrt(d2),.0001);
    vec2 direction=turn(.008*t)*B/distance;
    float n=.75*noise(direction*uRayLook.x+vec2(7.3,2.1)+.012*t)+.25*noise(direction*uRayLook.x*2.3+vec2(1.7,9.4)-.009*t);
    float beam=mix(.45,smoothstep(.30,.95,n),smoothstep(.05*uGlowSize,.22*uGlowSize,distance));
    c=screenRGB(c,uGlowCol*uRays*beam*exp(-distance*uRayLook.y));
  }
  if(uPrecip.x+uPrecip.y>.001){
    float fall=t*uPrecip.z,drop=1.0-uv.y,slant=.22*uDrift.x;
    float x=P.x-drop*slant-.010*fall*uDrift.x;
    float wobble=(noise(vec2(2.2*x,1.4*drop+.02*t))-.5)*.35;
    float envelope=noise(vec2(2.6*(x+wobble),3.7+.006*t));
    float threshold=.55-.28*uShaft.y;
    float shaft=smoothstep(threshold,threshold+.32,envelope);
    float striation=noise(vec2(13.0*x,3.0*(uv.y+.06*fall)));
    shaft*=.65+.35*smoothstep(.25,.85,striation);
    float reach=.75-.75*uShaft.z,fade=smoothstep(reach,reach+.60,uv.y);
    vec3 mid=mix(uC1,uC2,.5);float l=lum(mid),bright=smoothstep(.50,.62,l);
    vec3 mist=mix(mid,vec3(l),.5)*mix(1.10,.76,bright)+.04*(1.0-bright);
    vec3 rainTint=min(mist*vec3(.92,.96,1.03),vec3(1)),snowTint=min(mix(mist,vec3(.94,.95,.97),.55),vec3(1));
    c=mix(c,rainTint,sat(shaft*fade*.55*uPrecip.x*uShaft.x));
    c=mix(c,snowTint,sat(shaft*fade*.60*uPrecip.y*uShaft.x));
  }
  float vignette=length((uv-.5)*vec2(uRes.x/uRes.y,1));
  c*=1.0-.20*smoothstep(.6,1.3,vignette);
  if(uLutAmt>.001){
    vec3 sampleColor=clamp(c,0.0,1.0);float blue=32.0*sampleColor.b,lower=floor(blue),upper=min(lower+1.0,32.0);
    vec2 p0=vec2((33.0*lower+32.0*sampleColor.r+.5)/1089.0,(32.0*sampleColor.g+.5)/33.0);
    vec2 p1=vec2((33.0*upper+32.0*sampleColor.r+.5)/1089.0,p0.y);
    c=mix(c,mix(texture2D(uLut,p0).rgb,texture2D(uLut,p1).rgb,fract(blue)),uLutAmt);
  }
  vec3 floorColor=mix(uFloorH,uFloorZ,sat(uv.y));
  c=floorColor+c*(1.0-floorColor);
  float grain=((hash(pixel)+hash(pixel+17.13)+hash(pixel+41.77))/3.0-.5)*uGrain*1.7;
  float dither=(hash(1.7*pixel+31.0)-.5)*1.6/255.0;
  gl_FragColor=vec4(c+grain+dither,uAlpha);
}
`;
