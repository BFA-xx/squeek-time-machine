import * as THREE from "three";

/**
 * The burrow's built surfaces: seamless panelled walls and ribbed domes. Each is unlit, so the whole
 * building costs a few draw calls however many lights are around, and it stays sharp on a phone.
 */
export const WALL_H = 7;

/** Shared by every wall, so a run on the wheel lights up the whole burrow at once. */
export const wallClock = { uTime: { value: 0 }, uPulse: { value: 0 } };

const VERT = `
varying vec2 vP;
#include <fog_pars_vertex>
void main(){
  vP = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const WALL_FRAG = `
uniform vec3 uBase; uniform vec3 uAccent; uniform float uPanel; uniform float uReveal; uniform float uRail; uniform float uRound;
uniform float uTime; uniform float uPulse;
varying vec2 vP;
#include <fog_pars_fragment>
float h(float n){ return fract(sin(n*12.9898)*43758.5453); }
float hair(float d, float half_, float w){ return (1.-smoothstep(half_, half_+w, abs(d))) * clamp(half_*5./max(w,.0001), 0., 1.); }
void main(){
  float u = vP.x, y = vP.y;
  float wu = fwidth(u), wy = fwidth(y);
  float cell = floor(u/uPanel);
  float fromSeam = (fract(u/uPanel)-.5)*uPanel;
  float seam = hair(uPanel*.5-abs(fromSeam), .012, wu);
  vec3 c = uBase * (.93 + .14*h(cell + floor(y/3.6)*7.));
  // Light washing up and down the wall from the concealed strip.
  float wash = exp(-abs(y-uReveal)*.75);
  c += uAccent*wash*.05 + vec3(1.,.86,.68)*wash*.07;
  // Warm bounce off the floor, and the top of the wall falling away into shadow.
  c += vec3(.95,.74,.5)*exp(-y*.9)*.05;
  c *= mix(1., .62, smoothstep(uReveal, 7., y));
  // A dark recessed skirting and a shadow gap above it.
  c *= mix(.5, 1., smoothstep(.34, .36, y));
  c *= 1.-hair(y-.37, .02, wy)*.7;
  c *= 1.-seam*.6;
  // A bevel catching the light on one side of each joint.
  c += vec3(.05,.045,.04)*hair(uPanel*.5-abs(fromSeam-.02), .008, wu)*step(0., fromSeam);
  // The light strip itself, then the fine joint at the top of the wall.
  float strip = hair(y-uReveal, .014, wy);
  c = mix(c, uAccent*1.15 + .08, strip);
  c *= 1.-hair(y-6.94, .018, wy)*.7;
  // The data rail: a thin line of ticks with pulses of light running around the room.
  float inRail = smoothstep(uRail-.2, uRail-.2+wy, y)*(1.-smoothstep(uRail+.2-wy, uRail+.2, y));
  if (inRail > 0. && uRail > 0.) {
    float t = u/.16;
    float id = floor(t);
    float tick = 1.-smoothstep(.12, .12+wu/.16, abs(fract(t)-.5));
    float reach = .25 + .75*h(id*.37);
    float tall = 1.-smoothstep(reach*.2-wy, reach*.2, abs(y-uRail));
    float round_ = u/uRound;
    float head = fract(round_ - uTime*(.012+uPulse*.09));
    float pulse = pow(head, 34.) + pow(fract(head+.5), 60.)*.6;
    float fade = clamp(.07/max(wu,.001), 0., 1.);
    c += uAccent*tick*tall*(.13 + pulse*1.5 + uPulse*.35)*inRail*fade;
  }
  gl_FragColor = vec4(pow(max(c, vec3(0.)), vec3(2.2)), 1.);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

const DOME_FRAG = `
uniform vec3 uBase; uniform vec3 uAccent; uniform float uRibs;
varying vec2 vP;
#include <fog_pars_fragment>
void main(){
  float a = vP.x, t = vP.y;
  float wa = fwidth(a), wt = fwidth(t);
  float s = a*uRibs/6.28318;
  float d = abs(fract(s)-.5);
  float rib = (1.-smoothstep(.47, .47+wa*uRibs/6.28318*1.5, d)) * smoothstep(.0,.2,t) * (1.-smoothstep(.72,.8,t));
  float rn = t*6.;
  float ring = (1.-smoothstep(.04, .04+wt*6.*1.5, abs(fract(rn)-.5)-.45)) * step(rn, 5.);
  vec3 c = uBase*mix(.85, .32, t);
  c *= 1.-.45*max(rib, ring*.8);
  // The lit ring at the crown of the dome.
  float crown = 1.-smoothstep(.004, .004+wt*1.3, abs(t-.86));
  c = mix(c, uAccent*.95 + .06, crown*.85);
  c += uAccent*exp(-abs(t-.86)*16.)*.07;
  gl_FragColor = vec4(pow(max(c, vec3(0.)), vec3(2.2)), 1.);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

export function wallMaterial(opts: { base?: string; accent: string; panel: number; reveal?: number; rail?: number; round?: number }) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: WALL_FRAG,
    side: THREE.BackSide,
    fog: true,
    toneMapped: false,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uBase: { value: new THREE.Color(opts.base ?? "#1d1916").convertLinearToSRGB() },
      uAccent: { value: new THREE.Color(opts.accent).convertLinearToSRGB() },
      uPanel: { value: opts.panel },
      uReveal: { value: opts.reveal ?? 4 },
      uRail: { value: opts.rail ?? -10 },
      uRound: { value: opts.round ?? 100 },
      uTime: wallClock.uTime,
      uPulse: wallClock.uPulse,
    },
  });
}

export function domeMaterial(accent: string, ribs: number, base = "#1d1916") {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: DOME_FRAG,
    side: THREE.BackSide,
    fog: true,
    toneMapped: false,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uBase: { value: new THREE.Color(base).convertLinearToSRGB() },
      uAccent: { value: new THREE.Color(accent).convertLinearToSRGB() },
      uRibs: { value: ribs },
    },
  });
}

/** A section of curved wall. Its UVs are in metres, so the panels line up exactly around the room. */
export function arcWall(radius: number, from: number, to: number, y0: number, y1: number) {
  const segs = Math.max(4, Math.ceil(((to - from) / (Math.PI * 2)) * 128));
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = from + ((to - from) * i) / segs;
    for (const y of [y0, y1]) {
      pos.push(Math.sin(a) * radius, y, Math.cos(a) * radius);
      uv.push(a * radius, y);
    }
    if (i < segs) {
      const k = i * 2;
      idx.push(k, k + 2, k + 3, k, k + 3, k + 1);
    }
  }
  return indexed(pos, uv, idx);
}

/** A smooth dome from the top of the wall to its crown. */
export function dome(radius: number, height: number) {
  const segs = 96, rings = 18;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const r = radius * Math.cos((t * Math.PI) / 2);
    const y = WALL_H + height * Math.sin((t * Math.PI) / 2);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pos.push(Math.sin(a) * r, y, Math.cos(a) * r);
      uv.push(a, t);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const k = j * (segs + 1) + i;
      idx.push(k, k + 1, k + segs + 2, k, k + segs + 2, k + segs + 1);
    }
  }
  return indexed(pos, uv, idx);
}

/** A barrel-vaulted tunnel along local z. UVs are metres along it, and height above the floor. */
export function barrelVault(radius: number, length: number) {
  const segs = 24;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const p = (i / segs) * Math.PI;
    for (const z of [-length / 2, length / 2]) {
      pos.push(Math.cos(p) * radius, Math.sin(p) * radius, z);
      uv.push(z, Math.sin(p) * radius);
    }
    if (i < segs) {
      const k = i * 2;
      idx.push(k, k + 2, k + 3, k, k + 3, k + 1);
    }
  }
  return indexed(pos, uv, idx);
}

/** The flat face around a door: a rectangle with an arch cut out of it. */
export function doorSurround(archRadius: number, halfWidth: number, height: number) {
  const s = new THREE.Shape();
  s.moveTo(-halfWidth, 0);
  s.lineTo(halfWidth, 0);
  s.lineTo(halfWidth, height);
  s.lineTo(-halfWidth, height);
  s.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-archRadius, 0);
  hole.lineTo(-archRadius, 0.001);
  hole.absarc(0, 0, archRadius, Math.PI, 0, true);
  hole.lineTo(archRadius, 0);
  hole.closePath();
  s.holes.push(hole);
  return new THREE.ShapeGeometry(s, 32);
}

function indexed(pos: number[], uv: number[], idx: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
