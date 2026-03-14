import type { MidiState, MidiEvent } from "../shared/types"
import { MIDI_NOTE_RANGE } from "../shared/constants"

export interface MidiCallbacks {
  onNoteOn?: (note: number, velocity: number) => void
  onNoteOff?: (note: number) => void
  onStateChange?: (state: MidiState) => void
}

let midiAccess: MIDIAccess | null = null
let callbacks: MidiCallbacks = {}

// Current MIDI state
const state: MidiState = {
  notesOn: new Map(),
  sustain: false,
  lastEvent: null
}

export function getMidiState(): MidiState {
  return state
}

function handleMidiMessage(event: MIDIMessageEvent): void {
  const [status, data1, data2] = event.data!
  const command = status & 0xf0
  const channel = status & 0x0f

  const timestamp = performance.now()

  if (command === 0x90 && data2 > 0) {
    // Note On
    const note = data1
    const velocity = data2

    // Only track notes in our 3-octave range
    if (note >= MIDI_NOTE_RANGE.MIN && note <= MIDI_NOTE_RANGE.MAX) {
      state.notesOn.set(note, { velocity, timestamp })
      state.lastEvent = { type: "noteOn", note, value: velocity, timestamp }
      console.log('MIDI note on', note)
      callbacks.onNoteOn?.(note, velocity)
      callbacks.onStateChange?.(state)
    }
  } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
    // Note Off
    const note = data1

    if (note >= MIDI_NOTE_RANGE.MIN && note <= MIDI_NOTE_RANGE.MAX) {
      state.notesOn.delete(note)
      state.lastEvent = { type: "noteOff", note, value: 0, timestamp }

      callbacks.onNoteOff?.(note)
      callbacks.onStateChange?.(state)
    }
  } else if (command === 0xb0) {
    // Control Change
    const cc = data1
    const value = data2

    // Sustain pedal (CC 64)
    if (cc === 64) {
      state.sustain = value >= 64
      state.lastEvent = { type: "cc", cc, value, timestamp }
      callbacks.onStateChange?.(state)
    }
  }
}

/** Simulate a MIDI note-on from mouse/keyboard — goes through same path as real MIDI */
export function simulateNoteOn(note: number, velocity: number): void {
  if (note < MIDI_NOTE_RANGE.MIN || note > MIDI_NOTE_RANGE.MAX) return
  const timestamp = performance.now()
  state.notesOn.set(note, { velocity, timestamp })
  state.lastEvent = { type: "noteOn", note, value: velocity, timestamp }
  callbacks.onNoteOn?.(note, velocity)
  callbacks.onStateChange?.(state)
}

/** Simulate a MIDI note-off from mouse/keyboard */
export function simulateNoteOff(note: number): void {
  if (note < MIDI_NOTE_RANGE.MIN || note > MIDI_NOTE_RANGE.MAX) return
  state.notesOn.delete(note)
  const timestamp = performance.now()
  state.lastEvent = { type: "noteOff", note, value: 0, timestamp }
  callbacks.onNoteOff?.(note)
  callbacks.onStateChange?.(state)
}

export async function initMidi(cbs: MidiCallbacks = {}): Promise<boolean> {
  callbacks = cbs

  if (!navigator.requestMIDIAccess) {
    return false
  }

  try {
    midiAccess = await navigator.requestMIDIAccess()

    // Connect to all available inputs
    midiAccess.inputs.forEach((input) => {
      input.onmidimessage = handleMidiMessage
    })

    // Handle hot-plugging
    midiAccess.onstatechange = (event) => {
      const port = event.port as MIDIInput
      if (port.type === "input") {
        if (port.state === "connected") {
          port.onmidimessage = handleMidiMessage
        }
      }
    }

    return true
  } catch {
    return false
  }
}
