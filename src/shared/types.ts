// MIDI state
export interface MidiEvent {
  type: "noteOn" | "noteOff" | "cc"
  note?: number
  cc?: number
  value: number
  timestamp: number
}

export interface MidiState {
  notesOn: Map<number, { velocity: number; timestamp: number }>
  sustain: boolean
  lastEvent: MidiEvent | null
}

// Shader uniform parameters
export interface ShaderUniforms {
  speed: number
  turbulence: number
  warmth: number
  // MIDI shockwave power
  shockwaveSpeed: number
  shockwaveWidth: number
  shockwaveColor: number
  shockwaveSize: number
  // Realmscape note release
  realmscapeReleaseTime: number
  realmscapeDecayCurve: number
}

export const DEFAULT_SHADER_UNIFORMS: ShaderUniforms = {
  speed: 1.0,
  turbulence: 0.7,
  warmth: 0.0,
  shockwaveSpeed: 8.0,
  shockwaveWidth: 2.0,
  shockwaveColor: 0.6,
  shockwaveSize: 0.5,
  realmscapeReleaseTime: 1.0,
  realmscapeDecayCurve: 0.7
}

// IPC channel names
export const IPC_CHANNELS = {
  WINDOW_READY: "window-ready",
  SHADER_UNIFORMS: "shader-uniforms",
  AUDIO_PRESET: "audio-preset",
  AUDIO_GAIN: "audio-gain",
  AUDIO_MUTE_SOLO: "audio-mute-solo",
  AUDIO_LEVELS: "audio-levels",
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
