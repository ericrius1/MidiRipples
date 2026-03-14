// src/canvas-window/audio/effects.ts
import * as Tone from 'tone'

let reverb: Tone.Reverb | null = null
let filter: Tone.Filter | null = null
let reverbGain: Tone.Gain | null = null
let dryGain: Tone.Gain | null = null
let effectsInput: Tone.Gain | null = null
let effectsOutput: Tone.Gain | null = null

// Current parameter values (0-1)
let currentReverbMix = 0.5
let currentFilterCutoff = 1.0  // 1.0 = fully open

// Target values for smooth interpolation
let targetReverbMix = 0.5
let targetFilterCutoff = 1.0

// Smoothing rate (per frame)
const SMOOTHING_RATE = 0.05

export async function initEffects(): Promise<Tone.Gain> {
  // Create nodes
  effectsInput = new Tone.Gain(1)
  effectsOutput = new Tone.Gain(1)
  dryGain = new Tone.Gain(0.5)
  reverbGain = new Tone.Gain(0.5)

  reverb = new Tone.Reverb({
    decay: 4,
    wet: 1,
    preDelay: 0.1
  })
  await reverb.generate()

  filter = new Tone.Filter({
    frequency: 20000,
    type: 'lowpass',
    Q: 1.5
  })

  // Routing: input -> filter -> (dry + reverb) -> output
  effectsInput.connect(filter)
  filter.connect(dryGain)
  filter.connect(reverb)
  reverb.connect(reverbGain)
  dryGain.connect(effectsOutput)
  reverbGain.connect(effectsOutput)

  return effectsInput
}

export function getEffectsOutput(): Tone.Gain | null {
  return effectsOutput
}

export function setReverbMix(mix: number): void {
  targetReverbMix = Math.max(0, Math.min(1, mix))
}

export function setFilterCutoff(normalized: number): void {
  targetFilterCutoff = Math.max(0, Math.min(1, normalized))
}

export function updateEffects(): void {
  if (!dryGain || !reverbGain || !filter) return

  // Smooth interpolation
  currentReverbMix += (targetReverbMix - currentReverbMix) * SMOOTHING_RATE
  currentFilterCutoff += (targetFilterCutoff - currentFilterCutoff) * SMOOTHING_RATE

  // Apply reverb mix
  dryGain.gain.value = 1 - currentReverbMix
  reverbGain.gain.value = currentReverbMix

  // Map filter cutoff: 0 = 200Hz, 1 = 20000Hz (exponential)
  const minFreq = 200
  const maxFreq = 20000
  const freq = minFreq * Math.pow(maxFreq / minFreq, currentFilterCutoff)
  filter.frequency.value = freq
}

export function disposeEffects(): void {
  reverb?.dispose()
  filter?.dispose()
  reverbGain?.dispose()
  dryGain?.dispose()
  effectsInput?.dispose()
  effectsOutput?.dispose()
}
