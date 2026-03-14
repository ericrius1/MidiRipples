// src/canvas-window/audio/index.ts
import * as Tone from 'tone'
import type { AudioPreset, AudioState, AudioLevels } from '../../shared/audio-types'
import { DEFAULT_AUDIO_STATE } from '../../shared/audio-types'
import { initMidiSynth, setPreset, noteOn, noteOff, getSynthOutput } from './midi-synth'
import { initEffects, getEffectsOutput } from './effects'

let isInitialized = false
let masterGain: Tone.Gain | null = null
let midiGain: Tone.Gain | null = null

// Meters for VU display
let masterMeter: Tone.Meter | null = null
let midiMeter: Tone.Meter | null = null

// Peak hold values
let masterPeak = 0
let midiPeak = 0
const PEAK_DECAY = 0.95

// Current state
let audioState: AudioState = { ...DEFAULT_AUDIO_STATE }

function calculateEffectiveGain(): number {
  if (audioState.midi.muted) return 0
  return audioState.midi.gain
}

export async function initAudio(): Promise<boolean> {
  if (isInitialized) return true

  try {
    // Use low-latency audio context for responsive MIDI
    const ctx = new Tone.Context({ latencyHint: 'interactive', lookAhead: 0 })
    Tone.setContext(ctx)
    await Tone.start()

    // Create master output chain
    masterGain = new Tone.Gain(audioState.master.gain)
    masterMeter = new Tone.Meter({ smoothing: 0.8 })
    masterGain.connect(masterMeter)
    masterGain.toDestination()

    // Initialize effects chain
    const effectsInput = await initEffects()
    const effectsOutput = getEffectsOutput()!
    effectsOutput.connect(masterGain)

    // Initialize MIDI synth
    const synthOutput = initMidiSynth()
    midiGain = new Tone.Gain(audioState.midi.gain)
    midiMeter = new Tone.Meter({ smoothing: 0.8 })
    synthOutput.connect(midiGain)
    midiGain.connect(midiMeter)
    midiGain.connect(effectsInput)

    isInitialized = true
    return true
  } catch {
    return false
  }
}

export function handleNoteOn(note: number, velocity: number): void {
  if (!isInitialized) return
  noteOn(note, velocity)
}

export function handleNoteOff(note: number): void {
  if (!isInitialized) return
  noteOff(note)
}

export function setAudioPreset(preset: AudioPreset): void {
  audioState.preset = preset
  setPreset(preset)
}

export function setChannelGain(channel: 'master' | 'midi', gain: number): void {
  const clampedGain = Math.max(0, Math.min(1, gain))
  audioState[channel].gain = clampedGain

  if (channel === 'master' && masterGain) {
    masterGain.gain.rampTo(clampedGain, 0.05)
  } else {
    const effective = calculateEffectiveGain()
    if (midiGain) midiGain.gain.rampTo(effective, 0.05)
  }
}

export function setChannelMute(channel: 'midi', muted: boolean): void {
  audioState[channel].muted = muted
  const effective = calculateEffectiveGain()
  if (midiGain) midiGain.gain.rampTo(effective, 0.05)
}

export function setChannelSolo(channel: 'midi', solo: boolean): void {
  audioState[channel].solo = solo
  // With only one non-master channel, solo is effectively a no-op
  // but we store the state for UI consistency
}

export function getAudioLevels(): AudioLevels {
  if (!isInitialized) {
    return { master: 0, masterPeak: 0, midi: 0, midiPeak: 0 }
  }

  // Get current levels (convert from dB)
  const masterLevel = Math.min(1, Math.max(0, (masterMeter?.getValue() as number + 60) / 60))
  const midiLevel = Math.min(1, Math.max(0, (midiMeter?.getValue() as number + 60) / 60))

  // Decay peaks
  masterPeak *= PEAK_DECAY
  midiPeak *= PEAK_DECAY

  // Update peaks
  if (masterLevel > masterPeak) masterPeak = masterLevel
  if (midiLevel > midiPeak) midiPeak = midiLevel

  return {
    master: masterLevel,
    masterPeak,
    midi: midiLevel,
    midiPeak
  }
}

export function isAudioInitialized(): boolean {
  return isInitialized
}
