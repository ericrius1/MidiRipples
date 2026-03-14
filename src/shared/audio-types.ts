export type AudioPreset = "crystal" | "silky" | "angels"

export interface AudioPresetConfig {
  name: string
  key: string
  rootNote: number
}

export const AUDIO_PRESETS: Record<AudioPreset, AudioPresetConfig> = {
  crystal: { name: "Crystal Chimes", key: "C", rootNote: 60 },
  silky: { name: "Silky Synth Pad", key: "Eb", rootNote: 63 },
  angels: { name: "Mystical Angels", key: "Am", rootNote: 57 }
}

export interface ChannelState {
  gain: number
  muted: boolean
  solo: boolean
}

export interface AudioState {
  preset: AudioPreset
  master: ChannelState
  midi: ChannelState
}

export interface AudioLevels {
  master: number
  masterPeak: number
  midi: number
  midiPeak: number
}

export const DEFAULT_AUDIO_STATE: AudioState = {
  preset: "crystal",
  master: { gain: 0.3, muted: false, solo: false },
  midi: { gain: 0.7, muted: false, solo: false },
}
