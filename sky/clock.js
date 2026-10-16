import { clamp, smooth, mod, rad, deg } from './math.js';

const formatters = new Map();
const capturedHostOffset = -new Date().getTimezoneOffset() * 60;
export function localParts(epoch, zone = 'America/Toronto') {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    formatters.set(zone, formatter);
  }
  const p = Object.fromEntries(formatter.formatToParts(epoch).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
  return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute, second: p.second };
}
export function zoneOffset(epoch, zone) {
  try {
    const p = localParts(epoch, zone);
    return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(epoch / 1000) * 1000) / 1000;
  } catch { return capturedHostOffset; }
}
export function resolveClock(scene, epoch, retainedHour = 12) {
  if (!Number.isFinite(epoch)) throw new TypeError('Epoch must be finite.');
  const zone = scene.timeZone;
  let real;
  try { real = localParts(epoch, zone); }
  catch { const d = new Date(epoch + capturedHostOffset * 1000); real = { year: d.getUTCFullYear(), month: d.getUTCMonth()+1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds() }; }
  let baseEpoch = epoch;
  if (scene.date) {
    const [y, m, d] = scene.date.split('-').map(Number);
    const local = Date.UTC(y, m - 1, d, real.hour, real.minute, real.second);
    baseEpoch = local - zoneOffset(epoch, zone) * 1000;
    for (let i = 0; i < 2; i++) baseEpoch = local - zoneOffset(baseEpoch, zone) * 1000;
  }
  let base;
  try { base = localParts(baseEpoch, zone); }
  catch { base = real; }
  const hour = scene.hourly ? real.hour + real.minute / 60 + real.second / 3600 : scene.hour ?? retainedHour;
  const delta = mod(hour - (base.hour + base.minute / 60) + 12, 24) - 12;
  const moonEpoch = scene.hourly ? baseEpoch : baseEpoch + delta * 3600000;
  return { hour, baseEpoch, moonEpoch, date: base, offset: zoneOffset(baseEpoch, zone) };
}
export function solarGeom(latitude, longitude, hour, date, offset) {
  const n = Math.round((Date.UTC(date.year, date.month - 1, date.day) - Date.UTC(date.year, 0, 1)) / 86400000) + 1;
  const g = 2 * Math.PI / 365 * (n - 1 + (hour - 12) / 24);
  const q = 229.18 * (.000075 + .001868*Math.cos(g) - .032077*Math.sin(g) - .014615*Math.cos(2*g) - .040849*Math.sin(2*g));
  const dec = .006918 - .399912*Math.cos(g) + .070257*Math.sin(g) - .006758*Math.cos(2*g) + .000907*Math.sin(2*g) - .002697*Math.cos(3*g) + .001480*Math.sin(3*g);
  const correction = q + 4*longitude - offset/60;
  const ha = rad(15*hour + correction/4 - 180), lat = rad(latitude);
  const sinAlt = Math.sin(lat)*Math.sin(dec) + Math.cos(lat)*Math.cos(dec)*Math.cos(ha);
  const altitude = deg(Math.asin(clamp(sinAlt, -1, 1)));
  const h0 = Math.acos(clamp((Math.sin(rad(-.833)) - Math.sin(lat)*Math.sin(dec))/(Math.cos(lat)*Math.cos(dec)), -1, 1));
  const noon = 12 - correction/60, half = 12*h0/Math.PI;
  return { altitude, sinAlt, sunrise: noon-half, sunset: noon+half, dayLength: clamp(2*half, .02, 23.98), noon, dayNumber: n };
}
export const bodyY = altitude => altitude >= 0 ? .10 + .80*altitude/90 : .10 + .030*altitude;
export function sunScreenPos(hour, geom) {
  const elapsed = mod(hour - mod(geom.sunrise, 24), 24);
  const progress = elapsed <= geom.dayLength ? elapsed/geom.dayLength : (24-elapsed < elapsed-geom.dayLength ? 0 : 1);
  return [.16 + .68*progress, bodyY(geom.altitude)];
}
export function moonIllum(epoch) {
  const jd = epoch/86400000 + 2440587.5;
  return .5*(1-Math.cos(2*Math.PI*mod((jd-2451550.1)/29.530588853, 1)));
}
export function moonAltitude(epoch, latitude, longitude) {
  const j = epoch/86400000+2440587.5-2451545;
  const eps = rad(23.4393-.0000003563*j), L = 218.316+13.176396*j;
  const M = rad(134.963+13.064993*j), F = rad(93.272+13.229350*j);
  const l = rad(L+6.289*Math.sin(M)), b = rad(5.128*Math.sin(F));
  const ra = Math.atan2(Math.sin(l)*Math.cos(eps)-Math.tan(b)*Math.sin(eps), Math.cos(l));
  const dec = Math.asin(Math.sin(b)*Math.cos(eps)+Math.cos(b)*Math.sin(eps)*Math.sin(l));
  const ha = rad(280.46061837+360.98564736629*j+longitude)-ra, lat = rad(latitude);
  return deg(Math.asin(clamp(Math.sin(lat)*Math.sin(dec)+Math.cos(lat)*Math.cos(dec)*Math.cos(ha), -1, 1)));
}
export function skyGlow(hour, geom, moonAlt, illumination) {
  const e = geom.altitude;
  if (e > -5) return { body: 'sun', altitude: e, pos: sunScreenPos(hour, geom), strength: (.26+.66*clamp(geom.sinAlt))*smooth((e+5)/6), size: 1+.5*Math.exp(-((Math.max(0,e)/18)**2)) };
  const elapsed = mod(hour-mod(geom.sunrise,24),24);
  const progress = clamp((elapsed-geom.dayLength)/Math.max(24-geom.dayLength,.02));
  return { body: 'moon', altitude: moonAlt, pos: [.20+.60*progress,bodyY(moonAlt)], strength: (.04+.26*illumination)*smooth((moonAlt+3)/8), size: 1+.35*Math.exp(-((Math.max(0,moonAlt)/18)**2)) };
}
function randomFor(key, latitude, longitude) {
  let state = (Math.imul(key,73856093)^Math.imul(Math.round(latitude*10),19349663)^Math.imul(Math.round(longitude*10),83492791))>>>0;
  return () => {
    state = (state+0x6d2b79f5)>>>0;
    let v = Math.imul(state^(state>>>15),state|1);
    v = (v+Math.imul(v^(v>>>7),v|61))^v;
    return ((v^(v>>>14))>>>0)/4294967296;
  };
}
export function daySeed(date, latitude, longitude) {
  const next = randomFor(date.year*372+(date.month-1)*31+date.day,latitude,longitude);
  return Array.from({length:4},next);
}
export function monthlyDust(date, latitude, longitude) {
  return smooth((randomFor(date.year*12+date.month-1+7,latitude,longitude)()-.25)/.55);
}
