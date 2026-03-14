// Realmscape — MIDI-driven fluid realm
// 2D wave equation simulation: each note is a wave source.
// Ripples propagate outward, interfere, and light up the surface.
// At rest: gentle ambient flow. Playing: waves crash and shimmer.

const PI: f32 = 3.14159265;
const TAU: f32 = 6.28318530;

struct Uniforms {
  time: f32,
  resolutionX: f32,
  resolutionY: f32,
  speed: f32,

  headPosX: f32,
  headPosY: f32,
  headPresence: f32,
  headVelocity: f32,

  wrist0PosX: f32,
  wrist0PosY: f32,
  wrist1PosX: f32,
  wrist1PosY: f32,
  wrist0Presence: f32,
  wrist1Presence: f32,
  _pad0: f32,
  _pad1: f32,

  noteCount: f32,
  avgPitch: f32,
  pitchSpread: f32,
  totalEnergy: f32,
  lowestNote: f32,
  highestNote: f32,
  chordWidth: f32,
  sustainPedal: f32,

  note0: vec4f, note1: vec4f, note2: vec4f, note3: vec4f, note4: vec4f,
  note5: vec4f, note6: vec4f, note7: vec4f, note8: vec4f, note9: vec4f,

  // Per-note release ages (0 = held, >0 = seconds since release)
  release0: vec4f,  // notes 0-3
  release1: vec4f,  // notes 4-7
  release2: vec4f,  // notes 8-9, releaseTime, decayCurve

  pulse0: vec4f, pulse1: vec4f, pulse2: vec4f, pulse3: vec4f,

  freqBandsLow: vec4f,
  freqBandsHigh: vec4f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var output: VertexOutput;
  var pos: array<vec2f, 3> = array<vec2f, 3>(
    vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0)
  );
  let p = pos[vertexIndex];
  output.position = vec4f(p, 0.0, 1.0);
  output.uv = vec2f(p.x + 1.0, 1.0 - p.y) * 0.5;
  return output;
}

// ── Utilities ──

fn rot2(a: f32) -> mat2x2f {
  let c = cos(a); let s = sin(a);
  return mat2x2f(vec2f(c, s), vec2f(-s, c));
}

fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, vec3f(p3.y + 33.33, p3.z + 33.33, p3.x + 33.33));
  return fract((p3.x + p3.y) * p3.z);
}

fn hash22(p: vec2f) -> vec2f {
  let k = vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)));
  return fract(sin(k) * 43758.5453) * 2.0 - 1.0;
}

fn gnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(dot(hash22(i), f), dot(hash22(i + vec2f(1.0, 0.0)), f - vec2f(1.0, 0.0)), u.x),
    mix(dot(hash22(i + vec2f(0.0, 1.0)), f - vec2f(0.0, 1.0)),
        dot(hash22(i + vec2f(1.0, 1.0)), f - vec2f(1.0, 1.0)), u.x),
    u.y
  );
}

fn noise2(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), u.x),
    mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), u.x),
    u.y
  );
}

// ── Note/pulse access ──

fn getNote(i: u32) -> vec4f {
  switch(i) {
    case 0u: { return uniforms.note0; } case 1u: { return uniforms.note1; }
    case 2u: { return uniforms.note2; } case 3u: { return uniforms.note3; }
    case 4u: { return uniforms.note4; } case 5u: { return uniforms.note5; }
    case 6u: { return uniforms.note6; } case 7u: { return uniforms.note7; }
    case 8u: { return uniforms.note8; } case 9u: { return uniforms.note9; }
    default: { return vec4f(0.0); }
  }
}

fn getPulse(i: u32) -> vec4f {
  switch(i) {
    case 0u: { return uniforms.pulse0; } case 1u: { return uniforms.pulse1; }
    case 2u: { return uniforms.pulse2; } case 3u: { return uniforms.pulse3; }
    default: { return vec4f(0.0); }
  }
}

fn pitchToColor(pitch: f32) -> vec3f {
  let h = fract(pitch) * TAU;
  return vec3f(0.55 + 0.45 * cos(h), 0.55 + 0.45 * cos(h - 2.09), 0.55 + 0.45 * cos(h + 2.09));
}

// Get per-note release age (0 = held, >0 = seconds since release)
fn getNoteRelease(i: u32) -> f32 {
  switch(i) {
    case 0u: { return uniforms.release0.x; }
    case 1u: { return uniforms.release0.y; }
    case 2u: { return uniforms.release0.z; }
    case 3u: { return uniforms.release0.w; }
    case 4u: { return uniforms.release1.x; }
    case 5u: { return uniforms.release1.y; }
    case 6u: { return uniforms.release1.z; }
    case 7u: { return uniforms.release1.w; }
    case 8u: { return uniforms.release2.x; }
    case 9u: { return uniforms.release2.y; }
    default: { return 0.0; }
  }
}

// Compute release envelope: 1.0 when held, fades to 0.0 after release
fn releaseEnvelope(releaseAge: f32) -> f32 {
  if (releaseAge < 0.001) { return 1.0; } // still held
  let relTime = uniforms.release2.z;  // release duration
  let curve = uniforms.release2.w;     // 0=linear, 1=exponential
  let progress = clamp(releaseAge / max(relTime, 0.01), 0.0, 1.0);
  let lin = 1.0 - progress;
  let expo = exp(-progress * 5.0);
  return mix(lin, expo, curve);
}

// Get note position on the arrangement circle
fn notePosition(pitch: f32, octave: f32) -> vec2f {
  let angle = pitch * TAU;
  let radius = 0.32 * (0.7 + octave * 0.2);
  return vec2f(cos(angle), sin(angle)) * radius;
}

// ══════════════════════════════════════════════════════════════
// WAVE EQUATION SIMULATION
// Each MIDI source creates analytical circular waves that
// propagate, spread (1/sqrt(r)), decay, and interfere.
// ══════════════════════════════════════════════════════════════

// Wave speed: how fast ripples travel across the surface
const WAVE_SPEED: f32 = 0.45;

// Compute wave height at point p from a single impulse source
// source: wave origin, age: seconds since impulse, intensity: 0-1
fn impulseWave(p: vec2f, source: vec2f, age: f32, intensity: f32) -> f32 {
  let dist = length(p - source);

  // Wavefront position: expanding ring
  let wavefront = dist - WAVE_SPEED * age;

  // Wave packet: gaussian envelope around the wavefront
  // Width grows slightly with age (dispersion)
  let packetWidth = 0.03 + age * 0.02;
  let envelope = exp(-wavefront * wavefront / (packetWidth * packetWidth));

  // Oscillation within the packet (multiple ripples)
  let k = 35.0; // wavenumber — controls ripple density
  let ripple = sin(wavefront * k);

  // 2D circular spreading: amplitude falls as 1/sqrt(r)
  let spread = 1.0 / max(sqrt(dist * 3.0), 0.3);

  // Temporal decay
  let decay = exp(-age * 0.8);

  return ripple * envelope * spread * decay * intensity;
}

// Compute wave from a continuously held note (oscillating source)
fn sustainedWave(p: vec2f, source: vec2f, age: f32, velocity: f32, pitch: f32) -> f32 {
  let dist = length(p - source);

  // Continuous circular waves radiating from the source
  // Frequency scales with pitch for musical correspondence
  let freq = 0.5 + pitch * 0.77; // Hz
  let k = 25.0; // wavenumber
  let omega = freq * TAU;

  // Outgoing wave: sin(k*r - omega*t)
  let wave = sin(k * dist - omega * age);

  // 2D spreading
  let spread = 1.0 / max(sqrt(dist * 4.0), 0.25);

  // Amplitude builds up over first 0.5s, proportional to velocity
  let attack = smoothstep(0.0, 0.5, age);

  // Slight distance decay (viscous damping)
  let damping = exp(-dist * 0.5);

  return wave * spread * damping * velocity * attack * 0.5;
}

// Compute the full wave field height and color at a point
fn waveField(p: vec2f, t: f32) -> vec4f {
  var height = 0.0;
  var waveColor = vec3f(0.0);

  // ── Impulse waves from recent note-on events (pulses) ──
  for (var i = 0u; i < 4u; i = i + 1u) {
    let pulse = getPulse(i);
    let pAge = pulse.x;
    let pInt = pulse.y;
    let pPitch = pulse.z;
    if (pInt < 0.001) { continue; }

    let source = notePosition(pPitch, 1.0);
    let h = impulseWave(p, source, pAge, pInt);
    height += h;
    waveColor += pitchToColor(pPitch) * abs(h);
  }

  // ── Sustained waves from held notes ──
  for (var i = 0u; i < 10u; i = i + 1u) {
    let note = getNote(i);
    let pitch = note.x;
    let vel = note.y;
    let age = note.z;
    let octave = note.w;
    if (vel < 0.001) { continue; }

    let env = releaseEnvelope(getNoteRelease(i));
    let source = notePosition(pitch, octave);
    let h = sustainedWave(p, source, age, vel * env, pitch);
    height += h;
    waveColor += pitchToColor(pitch) * abs(h) * 0.7;
  }

  return vec4f(waveColor, height);
}

// ══════════════════════════════════════════════════════════════
// FLUID SURFACE RENDERING
// Use wave height field to create a lit fluid surface
// ══════════════════════════════════════════════════════════════

fn fluidSurface(p: vec2f, t: f32, energy: f32) -> vec3f {
  // Sample wave field at this point and neighbors for normals
  let eps = 0.003;
  let center = waveField(p, t);
  let wR = waveField(p + vec2f(eps, 0.0), t);
  let wU = waveField(p + vec2f(0.0, eps), t);

  let h = center.w;
  let dhdx = (wR.w - h) / eps;
  let dhdy = (wU.w - h) / eps;

  // Surface normal from height gradient
  let normal = normalize(vec3f(-dhdx * 0.5, -dhdy * 0.5, 1.0));

  // ── Base fluid color: dark water surface ──
  // Gentle ambient flow (very slow noise, the "honey" at rest)
  let ambientFlow = gnoise(p * 2.0 + vec2f(t * 0.01, t * 0.008)) * 0.5 + 0.5;
  var baseColor = vec3f(0.015, 0.01, 0.035);
  baseColor = mix(baseColor, vec3f(0.04, 0.02, 0.08), ambientFlow * 0.5);

  // ── Wave color: colored by the notes that created the waves ──
  let waveIntensity = length(center.xyz);
  var surfaceColor = baseColor + center.xyz * 0.8;

  // ── Lighting: waves catch light on their crests ──
  // Light from above-right
  let lightDir = normalize(vec3f(0.3, 0.5, 1.0));
  let diffuse = max(dot(normal, lightDir), 0.0);

  // Specular highlights on wave crests — the "wet" look
  let viewDir = vec3f(0.0, 0.0, 1.0);
  let halfDir = normalize(lightDir + viewDir);
  let spec = pow(max(dot(normal, halfDir), 0.0), 40.0);

  // Fresnel: edges of waves are brighter
  let fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);

  // ── Combine lighting ──
  // Ambient base
  var color = surfaceColor * 0.4;

  // Diffuse lighting reveals wave shapes
  color += surfaceColor * diffuse * 0.6;

  // Specular highlights: white-ish on crests
  let specColor = mix(vec3f(0.6, 0.5, 0.8), vec3f(1.0), 0.5);
  color += specColor * spec * (0.3 + energy * 0.7);

  // Fresnel rim glow on wave edges
  color += vec3f(0.1, 0.08, 0.2) * fresnel * (0.2 + waveIntensity * 2.0);

  // ── Height-based effects ──
  // Bright crests
  let crestGlow = smoothstep(0.1, 0.4, h) * 0.3;
  color += center.xyz * crestGlow;

  // Dark troughs
  let troughDarken = smoothstep(-0.1, -0.3, h) * 0.3;
  color *= 1.0 - troughDarken;

  // ── Caustics: light patterns on the "floor" beneath the waves ──
  // Refract a noise pattern through the wave normals
  let refractedUV = p + vec2f(dhdx, dhdy) * 0.15;
  let caustic1 = noise2(refractedUV * 12.0 + vec2f(t * 0.1));
  let caustic2 = noise2(refractedUV * 18.0 - vec2f(t * 0.08, t * 0.12));
  let caustics = smoothstep(0.4, 0.9, caustic1 * caustic2 + 0.3) * 0.15;
  color += vec3f(0.1, 0.15, 0.3) * caustics * (1.0 + energy * 2.0);

  // ── Subtle stars in calm regions ──
  let starNoise = noise2(p * 120.0);
  let calmness = 1.0 - clamp(waveIntensity * 3.0, 0.0, 1.0);
  let stars = smoothstep(0.97, 1.0, starNoise) * 0.4 * calmness;
  color += vec3f(stars);

  return color;
}

// ── Crystal pillar ──

fn crystalPillar(offset: vec2f, velocity: f32, age: f32, pitch: f32) -> f32 {
  let breathe = 1.0 + 0.2 * sin(age * 3.0 + pitch * TAU);
  let dist = length(offset);
  let halo = velocity * 0.6 / (1.0 + dist * dist * 30.0);

  let beamW = 0.012 * breathe * (0.5 + velocity * 0.5);
  let beam = exp(-offset.x * offset.x / (beamW * beamW));

  let h = 0.2 + velocity * 0.5;
  let heightFade = smoothstep(h, h * 0.2, abs(offset.y));

  let facetAngle = atan2(offset.y, offset.x);
  let facets = 0.65 + 0.35 * abs(sin(facetAngle * 3.0 + age * 2.0));

  let sparklePhase = fract(offset.y * 15.0 - age * 2.0);
  let sparkle = smoothstep(0.95, 1.0, sparklePhase) * beam * 3.0;

  return (beam * heightFade * facets * velocity * 2.5) + halo + sparkle * velocity;
}

// ── Harmonic bridge ──

fn harmonicBridge(p: vec2f, posA: vec2f, posB: vec2f, intA: f32, intB: f32, pitchA: f32, pitchB: f32, t: f32) -> vec3f {
  let toP = p - posA;
  let ab = posB - posA;
  let abLen = length(ab);
  if (abLen < 0.001) { return vec3f(0.0); }

  let abDir = ab / abLen;
  let proj = dot(toP, abDir);
  let s = clamp(proj / abLen, 0.0, 1.0);

  let perpDir = vec2f(-abDir.y, abDir.x);
  let perpDist = dot(toP, perpDir);

  let arcHeight = abLen * 0.3 * sin(s * PI);
  let wave = sin(s * 20.0 - t * 4.0) * 0.003 * sin(s * PI);
  let arcDist = abs(perpDist - arcHeight * 0.5 - wave);

  let arcW = 0.004 + 0.003 * sin(s * PI);
  let glow = exp(-arcDist * arcDist / (arcW * arcW));

  let endFade = sin(s * PI);
  let intensity = min(intA, intB) * endFade;

  return mix(pitchToColor(pitchA), pitchToColor(pitchB), s) * glow * intensity * 0.8;
}

// ── Energy vortex (subtle center) ──

fn energyVortex(p: vec2f, t: f32, energy: f32) -> vec3f {
  let dist = length(p);
  let coreGlow = (0.04 + energy * 0.2) / (1.0 + dist * dist * 15.0);

  let ringR = 0.32;
  let ringDist = abs(dist - ringR);
  let ringW = 0.002 + energy * 0.004;
  let ring = exp(-ringDist * ringDist / (ringW * ringW)) * 0.12;

  let swColor = vec3f(0.3 + 0.2 * sin(t * 0.2), 0.1 + 0.15 * sin(t * 0.3 + 1.0), 0.5 + 0.2 * sin(t * 0.15 + 2.0));
  return swColor * coreGlow + vec3f(0.3, 0.25, 0.6) * ring;
}

// ── Main ──

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let aspect = uniforms.resolutionX / uniforms.resolutionY;
  let t = uniforms.time * uniforms.speed;

  var p = (input.uv - 0.5) * vec2f(aspect, 1.0);

  let headInf = uniforms.headPresence;
  let camAngle = t * 0.04 + (uniforms.headPosX - 0.5) * 0.6 * headInf;
  let camTilt = (uniforms.headPosY - 0.5) * 0.15 * headInf;
  p.y += camTilt;

  let rp = rot2(camAngle) * p;

  // ═══ LAYER 1: Fluid surface with wave simulation ═══
  var color = fluidSurface(rp, t, uniforms.totalEnergy);

  // ═══ LAYER 2: Energy vortex ═══
  color += energyVortex(p, t, uniforms.totalEnergy);

  // ═══ LAYER 3: Crystal Pillars ═══
  var notePos: array<vec2f, 10>;
  var notePitchArr: array<f32, 10>;
  var noteVel: array<f32, 10>;
  var activeN = 0u;

  for (var i = 0u; i < 10u; i = i + 1u) {
    let note = getNote(i);
    let pitch = note.x;
    let vel = note.y;
    let age = note.z;
    let octave = note.w;
    if (vel < 0.001) { continue; }

    let env = releaseEnvelope(getNoteRelease(i));
    let center = notePosition(pitch, octave);
    notePos[activeN] = center;
    notePitchArr[activeN] = pitch;
    noteVel[activeN] = vel * env;
    activeN = activeN + 1u;

    let offset = rp - center;
    let pillarGlow = crystalPillar(offset, vel * env, age, pitch);
    let noteCol = pitchToColor(pitch);
    let fadeIn = smoothstep(0.0, 0.2, age);
    color += noteCol * pillarGlow * fadeIn;

    // Vertical light ray
    let beamX = abs(rp.x - center.x);
    let aboveCenter = rp.y - center.y;
    if (aboveCenter > 0.0) {
      let ray = vel * env * 0.3 * exp(-beamX * beamX * 800.0) * exp(-aboveCenter * 2.0);
      color += noteCol * ray * fadeIn;
    }
  }

  // ═══ LAYER 4: Harmonic bridges ═══
  if (activeN >= 2u) {
    for (var i = 0u; i < activeN; i = i + 1u) {
      let jStart = i + 1u;
      for (var j = jStart; j < activeN; j = j + 1u) {
        if (j >= 10u) { break; }
        color += harmonicBridge(rp, notePos[i], notePos[j],
                                noteVel[i], noteVel[j],
                                notePitchArr[i], notePitchArr[j], t);
      }
    }
  }

  // ═══ LAYER 5: Mandala ═══
  if (uniforms.totalEnergy > 0.01) {
    let dist = length(rp);
    let angle2 = atan2(rp.y, rp.x);
    let folds = max(3.0, uniforms.noteCount);
    let foldedAngle = abs(fract(angle2 / TAU * folds) - 0.5) * 2.0;

    let mandalaR = 0.06 + uniforms.totalEnergy * 0.1;
    let mandalaDist = abs(dist - mandalaR);
    let mandalaW = 0.006 + uniforms.pitchSpread * 0.015;
    var mandala = exp(-mandalaDist * mandalaDist / (mandalaW * mandalaW));
    mandala *= 0.5 + 0.5 * sin(foldedAngle * PI + t * 2.0);

    let mandalaCol = pitchToColor(uniforms.avgPitch) * uniforms.totalEnergy;
    color += mandalaCol * mandala * 0.5;

    let innerGlow = uniforms.totalEnergy * 0.15 / (1.0 + dist * dist * 20.0);
    color += pitchToColor(uniforms.avgPitch) * innerGlow;
  }

  // ═══ LAYER 6: FFT ═══
  {
    let bassPulse = uniforms.freqBandsLow.x * 0.6 + uniforms.freqBandsLow.y * 0.4;
    let coreDist = length(p);
    color += vec3f(0.12, 0.03, 0.18) * bassPulse * 0.12 / (1.0 + coreDist * coreDist * 8.0);
    color *= 1.0 + uniforms.freqBandsLow.w * 0.05;
  }

  // ═══ Vignette + tone mapping ═══
  let vDist = length(input.uv - 0.5);
  color *= 1.0 - vDist * vDist * 0.5;

  color = color * (2.51 * color + vec3f(0.03)) / (color * (2.43 * color + vec3f(0.59)) + vec3f(0.14));
  return vec4f(clamp(color, vec3f(0.0), vec3f(1.0)), 1.0);
}
