// src/canvas-window/audio/midi-synth.ts
import * as Tone from 'tone'
import type { AudioPreset } from '../../shared/audio-types'

type SynthVoice = Tone.PolySynth | null

let currentPreset: AudioPreset = 'crystal'
let synth: SynthVoice = null
let output: Tone.Gain | null = null

function createCrystalChimes(): Tone.PolySynth {
  return new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 8,
    modulationIndex: 20,
    oscillator: { type: 'sine' },
    modulation: { type: 'sine' },
    envelope: {
      attack: 0.005,
      decay: 2.5,
      sustain: 0,
      release: 2
    },
    modulationEnvelope: {
      attack: 0.005,
      decay: 1,
      sustain: 0.2,
      release: 1.5
    }
  })
}

function createSilkyPad(): Tone.PolySynth {
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sawtooth' },
    envelope: {
      attack: 0.15,
      decay: 0.3,
      sustain: 0.8,
      release: 1.5
    }
  })
}

function createAngelsChorus(): Tone.PolySynth {
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: {
      attack: 0.3,
      decay: 0.5,
      sustain: 0.9,
      release: 2
    }
  })
}

export function initMidiSynth(): Tone.Gain {
  output = new Tone.Gain(0.7)
  setPreset('crystal')
  return output
}

export function setPreset(preset: AudioPreset): void {
  // Dispose old synth
  if (synth) {
    synth.releaseAll()
    synth.dispose()
  }

  currentPreset = preset

  // Create new synth based on preset
  switch (preset) {
    case 'crystal':
      synth = createCrystalChimes()
      break
    case 'silky':
      synth = createSilkyPad()
      break
    case 'angels':
      synth = createAngelsChorus()
      break
  }

  if (synth && output) {
    synth.connect(output)
  }
}

export function noteOn(note: number, velocity: number): void {
  if (!synth) return
  const freq = Tone.Frequency(note, 'midi').toFrequency()
  const vel = velocity / 127
  synth.triggerAttack(freq, Tone.now(), vel)
}

export function noteOff(note: number): void {
  if (!synth) return
  const freq = Tone.Frequency(note, 'midi').toFrequency()
  synth.triggerRelease(freq, Tone.now())
}

export function getSynthOutput(): Tone.Gain | null {
  return output
}

export function getCurrentPreset(): AudioPreset {
  return currentPreset
}

export function disposeMidiSynth(): void {
  synth?.dispose()
  output?.dispose()
}
