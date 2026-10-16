/* The plugin's own vocabulary on top of the independent engine.
   The plugin (and its §7 paint loop) talks in lat/lon/tz/cloudLow…, a lift
   dial, and skyState.speed. Nothing above cares: this tail translates, so
   none of the plugin's own code changes when the engine does. */

const engineApplyScene = applyScene      // the engine's own adapter
const engineApplyLift = applyLift
const engineFrameAt = frameAt
const engineDetUnit = detUnit

const SKY_SPEED = 2.5          // sky-time units per real second (shipped motion)

/* The zone follows the machine: the solar geometry reads it for the
   DST-correct hour angle, so a stale zone puts the sun in the wrong place. */
const detectTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto'
  } catch (err) {
    return 'America/Toronto'
  }
}

const zScene = {
  lat: 43.6532, lon: -79.3832, place: 'Toronto', tz: detectTz(),
  cloud: 45, code: 2, wind: 9, windDir: 250, aqi: 35, temp: 12,
  /* cover by layer (0-100): the engine reads these to tell a THIN high veil
     from a low lid (cloudThinness -> the deck's character) */
  cloudLow: null, cloudMid: null, cloudHigh: null,
  aod: null, humidity: null,        // null = derived from AQI / the dials
  lift: Object.assign({}, LIFT_BASE),
  hourly: true,          // follow the wall clock
  hour: null,            // 0..24 override when hourly is false
  date: null,            // 'YYYY-MM-DD' override, null = today
}

const zCloneScene = () => Object.assign({}, zScene, { lift: Object.assign({}, zScene.lift) })

/* the engine's vocabulary, from the plugin's */
const engineSceneFrom = () => ({
  latitude: zScene.lat, longitude: zScene.lon, place: zScene.place, timeZone: zScene.tz,
  code: zScene.code, cloud: zScene.cloud, wind: zScene.wind, windDirection: zScene.windDir,
  aqi: zScene.aqi, temperature: zScene.temp,
  low: zScene.cloudLow, mid: zScene.cloudMid, high: zScene.cloudHigh,
  aod: zScene.aod, humidity: zScene.humidity,
  hourly: zScene.hourly, hour: zScene.hour, date: zScene.date, lift: zScene.lift,
})

const zApplyLift = lift => engineApplyLift(lift || zScene.lift || LIFT_BASE)

/* Apply a partial scene and push it into the engine. The engine's builder
   reads its own active scene, so this is the only coupling point. */
function zApplyScene(patch) {
  Object.assign(zScene, patch || {})
  /* a patch that carries no usable lift falls back to the shipped dial, so no
     caller can accidentally flatten the sky back to the ungraded base */
  if (!zScene.lift) zScene.lift = Object.assign({}, LIFT_BASE)
  engineApplyLift(zScene.lift)
  engineApplyScene(engineSceneFrom())
  return zCloneScene()
}

/* One frame for the current scene. */
const zFrameAt = () => engineFrameAt()

/* ---- uniform upload: the whole GL surface of the sky ---- */
function zDrawParams(gl, U, f, opts) {
  const o = opts || {}
  const look = f.look || skyState.tuning
  gl.uniform2f(U.uRes, o.width, o.height)
  gl.uniform1f(U.uDet, o.det)
  gl.uniform1f(U.uTime, o.time)
  gl.uniform1f(U.uAlpha, o.alpha == null ? 1 : o.alpha)
  gl.uniform3f(U.uC0, f.cols[0][0], f.cols[0][1], f.cols[0][2])
  gl.uniform3f(U.uC1, f.cols[1][0], f.cols[1][1], f.cols[1][2])
  gl.uniform3f(U.uC2, f.cols[2][0], f.cols[2][1], f.cols[2][2])
  gl.uniform3f(U.uC3, f.cols[3][0], f.cols[3][1], f.cols[3][2])
  gl.uniform2f(U.uGlowPos, f.glowPos[0], f.glowPos[1])
  gl.uniform3f(U.uGlowCol, f.glowCol[0], f.glowCol[1], f.glowCol[2])
  gl.uniform1f(U.uGlow, f.glowStr)
  gl.uniform1f(U.uGlowSize, f.glowSize)
  gl.uniform1f(U.uDensity, f.dens)
  gl.uniform1f(U.uWarp, look.warp)
  gl.uniform1f(U.uGrain, look.grain)
  gl.uniform2f(U.uDrift, f.drift[0], f.drift[1])
  /* callers that do not integrate fall back to the old drift × time */
  const off = o.driftOff || [f.drift[0] * o.time, f.drift[1] * o.time]
  if (U.uDriftOff) gl.uniform2f(U.uDriftOff, off[0], off[1])
  gl.uniform3f(U.uPrecip, f.precip[0], f.precip[1], f.precip[2])
  gl.uniform3f(U.uShaft, look.shaft.strength, look.shaft.coverage, look.shaft.reach)
  gl.uniform1f(U.uFog, f.fog)
  gl.uniform3f(U.uMilk, f.milk[0], f.milk[1], f.milk[2])
  gl.uniform1f(U.uDeck, f.deck)
  gl.uniform1f(U.uPuff, f.puff)
  gl.uniform1f(U.uNight, f.night)
  gl.uniform1f(U.uHaze, f.haze)
  gl.uniform1f(U.uSquash, f.squash)
  gl.uniform3f(U.uTint, f.tint[0], f.tint[1], f.tint[2])
  gl.uniform1f(U.uRays, f.rays)
  gl.uniform2f(U.uRayLook, look.rays.scale, look.rays.falloff)
  gl.uniform1f(U.uHalo, f.halo)
  gl.uniform3f(U.uHaloLook, look.halo.radius, look.halo.dispersion, 1.0)
  gl.uniform1f(U.uLutAmt, look.lutAmount)
  gl.uniform1f(U.uTexV, f.grade && f.grade.textureVibrancy != null ? f.grade.textureVibrancy : 1)
  const ci = look.cirrus
  gl.uniform4f(U.uCirA, ci.angle * Math.PI / 180, ci.variance * Math.PI / 180, ci.fiber, ci.opacity)
  gl.uniform4f(U.uCirB, ci.bias, ci.evolution, ci.breakDepth, ci.grain)
  gl.uniform3f(U.uSun, f.sun[0], f.sun[1], f.sun[2])
  gl.uniform1f(U.uPolar, f.polar)
  gl.uniform2f(U.uAureole, f.aureole[0], f.aureole[1])
  gl.uniform1f(U.uWhiten, f.whiten)
  gl.uniform3f(U.uPurple, f.purple[0], f.purple[1], f.purple[2])
  gl.uniform2f(U.uCrep, f.crep, look.purity.scale)
  gl.uniform3f(U.uLit, f.lit[0], f.lit[1], f.lit[2])
  gl.uniform3f(U.uTintHi, f.tintHi[0], f.tintHi[1], f.tintHi[2])
  gl.uniform3f(U.uFloorZ, f.floorZ[0], f.floorZ[1], f.floorZ[2])
  gl.uniform3f(U.uFloorH, f.floorH[0], f.floorH[1], f.floorH[2])
  gl.uniform3f(U.uDogs, f.dogs[0], f.dogs[1], f.dogs[2])
  gl.uniform3f(U.uCorona, f.corona[0], f.corona[1], f.corona[2])
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

/* The engine's vertex shader names its attribute aPosition; the vendored sky
   this replaced said aPos, and the plugin binds the slot by name. */
const ATTRIB = 'aPosition'

/* The shader declares 47 uniforms. The plugin's field-cache variant adds
   uDriftOff (the integrated drift it feeds instead of t × drift), so the
   location list carries it too. */
const SKY_UNIFORM_NAMES = UNIFORM_NAMES.concat(['uDriftOff'])

/* Detail unit in device px: the tighter of height and width/reference aspect,
   slid toward the height rule by the composition tuning. The engine rejects a
   non-positive size; the plugin's paint loop must survive a minimised window,
   so a bad size collapses to the old tolerant answer (1 device px). */
function zDetUnit(w, h) {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 1
  const c = skyState.tuning.composition
  return engineDetUnit(w, h, c.referenceAspect, c.crop)
}

/* the plugin reads only .speed off this, and it is the motion convention the
   plugin's own timer uses */
skyState.speed = SKY_SPEED

return {
  FRAG: FRAG,
  VERT: VERT,
  UNIFORM_NAMES: SKY_UNIFORM_NAMES,
  ATTRIB: ATTRIB,
  SCENE: zScene,
  LIFT_BASE: LIFT_BASE,
  cloneScene: zCloneScene,
  applyScene: zApplyScene,
  frameAt: zFrameAt,
  drawParams: zDrawParams,
  applyLift: zApplyLift,
  GRADE_BASE: GRADE_BASE,
  detUnit: zDetUnit,
  SKY2: SKY2,
  solarGeom: solarGeom,
  moonIllum: moonIllum,
  bodyY: bodyY,
  sunScreenPos: sunScreenPos,
  skyGlow: skyGlow,
  effAod: effAod,
  effCloud: effCloud,
  effCode: effCode,
  turbidity: turbidity,
  daySeed: daySeed,
  skyState: skyState
}
