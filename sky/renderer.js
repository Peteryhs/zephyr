import {VERT,FRAG,UNIFORM_NAMES} from './shaders.js';
import {detUnit} from './engine.js';
export {VERT,FRAG,UNIFORM_NAMES};
export function drawParams(gl,locations,frame,{width,height,time=0,alpha=1,detail=detUnit(width,height)}={}) {
  const t=frame.look;
  const values={
    uRes:[width,height],uDet:detail,uTime:time,uAlpha:alpha??1,
    uC0:frame.cols[0],uC1:frame.cols[1],uC2:frame.cols[2],uC3:frame.cols[3],uGlowPos:frame.glowPos,uGlowCol:frame.glowCol,uGlow:frame.glowStr,uGlowSize:frame.glowSize,uDensity:frame.dens,
    uWarp:t.warp,uGrain:t.grain,uDrift:frame.drift,uPrecip:frame.precip,uShaft:[t.shaft.strength,t.shaft.coverage,t.shaft.reach],uFog:frame.fog,uMilk:frame.milk,
    uDeck:frame.deck,uPuff:frame.puff,uNight:frame.night,uHaze:frame.haze,uSquash:frame.squash,uTint:frame.tint,uRays:frame.rays,uRayLook:[t.rays.scale,t.rays.falloff],
    uHalo:frame.halo,uHaloLook:[t.halo.radius,t.halo.dispersion,t.halo.softness],uLutAmt:t.lutAmount,uTexV:frame.grade.textureVibrancy,
    uCirA:[t.cirrus.angle*Math.PI/180,t.cirrus.variance*Math.PI/180,t.cirrus.fiber,t.cirrus.opacity],uCirB:[t.cirrus.bias,t.cirrus.evolution,t.cirrus.breakDepth,t.cirrus.grain],
    uSun:frame.sun,uPolar:frame.polar,uAureole:frame.aureole,uWhiten:frame.whiten,uPurple:frame.purple,uCrep:[frame.crep,t.purity.scale],uLit:frame.lit,uTintHi:frame.tintHi,
    uFloorZ:frame.floorZ,uFloorH:frame.floorH,uDogs:frame.dogs,uCorona:frame.corona
  };
  for(const [name,value] of Object.entries(values)) {
    const location=locations[name]; if(location==null)continue;
    if(Array.isArray(value))gl[`uniform${value.length}fv`](location,value); else gl.uniform1f(location,value);
  }
  gl.uniform1i(locations.uLut,0);
  gl.drawArrays(gl.TRIANGLES,0,3);
}
export class SkyRenderer {
  constructor(canvas) {
    this.canvas=canvas;
    this.gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'low-power'});
    if(!this.gl)throw new Error('WebGL is unavailable. Enable hardware acceleration in your browser and reload.');
    this.initialize();
  }
  initialize() {
    const gl=this.gl;
    const compile=(type,source)=>{
      const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error(error);}
      return s;
    };
    const vs=compile(gl.VERTEX_SHADER,VERT),fs=compile(gl.FRAGMENT_SHADER,FRAG),program=gl.createProgram();
    gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    this.program=program;gl.useProgram(program);
    this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    this.locations=Object.fromEntries(UNIFORM_NAMES.map(name=>[name,gl.getUniformLocation(program,name)]));
    this.texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);
    const identity=new Uint8Array(1089*33*4);
    for(let b=0;b<33;b++)for(let g=0;g<33;g++)for(let r=0;r<33;r++) {
      const i=(g*1089+b*33+r)*4;identity.set([Math.round(r/32*255),Math.round(g/32*255),Math.round(b/32*255),255],i);
    }
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1089,33,0,gl.RGBA,gl.UNSIGNED_BYTE,identity);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);
    if('drawingBufferColorSpace' in gl)gl.drawingBufferColorSpace='srgb';
  }
  resize(width,height) {
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new RangeError('Invalid canvas dimensions.');
    width=Math.round(width);height=Math.round(height);
    if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
    this.gl.viewport(0,0,width,height);
  }
  render(frame,time=0,alpha=1) {
    const gl=this.gl;
    if(gl.isContextLost())return;
    gl.useProgram(this.program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);
    drawParams(gl,this.locations,frame,{width:this.canvas.width,height:this.canvas.height,time,alpha,detail:detUnit(this.canvas.width,this.canvas.height,frame.look.composition.referenceAspect,frame.look.composition.crop)});
    this.lastFrame=frame;this.lastTime=time;
  }
  setLUT(image) {
    if(image.width!==1089||image.height!==33)throw new RangeError('A finishing LUT must be 1089 × 33 pixels.');
    this.gl.bindTexture(this.gl.TEXTURE_2D,this.texture);
    this.gl.texImage2D(this.gl.TEXTURE_2D,0,this.gl.RGBA,this.gl.RGBA,this.gl.UNSIGNED_BYTE,image);
  }
  dispose() {const gl=this.gl;gl.deleteTexture(this.texture);gl.deleteBuffer(this.buffer);gl.deleteProgram(this.program);}
}
