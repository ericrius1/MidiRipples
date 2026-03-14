import type { WebGPUContext } from './context'
import { RealmscapeRenderer, type RealmscapeUniforms, type RealmscapeNote, type RealmscapePulse } from './realmscape-renderer'
import { MidiPowerSystem } from '../midi-powers'
import type { MidiState, ShaderUniforms } from '../../shared/types'
import { MIDI_NOTE_RANGE } from '../../shared/constants'

export class RenderGraph {
  private realmscapeRenderer: RealmscapeRenderer
  private width = 0
  private height = 0

  // Realmscape MIDI tracking — tracks individual notes with timing
  private realmscapeNoteTimings: Map<number, { startTime: number; velocity: number; releaseTime: number | null }> = new Map()
  private realmscapePulses: { triggerTime: number; intensity: number; pitch: number }[] = []

  // MIDI power system (shockwave etc.)
  private midiPowers = new MidiPowerSystem()

  // Empty freq bands (FFT removed)
  private emptyFreqBands = new Float32Array(8)

  constructor(private ctx: WebGPUContext) {
    this.realmscapeRenderer = new RealmscapeRenderer(ctx)

    // Register MIDI powers
    this.midiPowers.register('shockwave', { note: 48, maxConcurrent: 4, lifetime: 4.0 })
  }

  async init(): Promise<void> {
    await this.realmscapeRenderer.init(this.ctx.format)
    this.resize(this.ctx.canvas.width, this.ctx.canvas.height)
  }

  resize(width: number, height: number): void {
    if (width === 0 || height === 0) return
    if (width === this.width && height === this.height) return
    this.width = width
    this.height = height
  }

  render(time: number, deltaTime: number, midiState: MidiState, shaderUniforms: ShaderUniforms): void {
    const { width, height } = this
    this.resize(this.ctx.canvas.width, this.ctx.canvas.height)

    // Update MIDI power system
    this.midiPowers.update(time, midiState.notesOn)

    const encoder = this.ctx.device.createCommandEncoder()

    // Update realmscape MIDI note tracking
    const NOTE_MIN = MIDI_NOTE_RANGE.MIN
    const NOTE_MAX = MIDI_NOTE_RANGE.MAX
    const NOTE_RANGE = NOTE_MAX - NOTE_MIN
    const releaseTime = shaderUniforms.realmscapeReleaseTime
    const decayCurve = shaderUniforms.realmscapeDecayCurve

    // Track note-on timings
    for (const [note, info] of midiState.notesOn) {
      if (note < NOTE_MIN || note > NOTE_MAX) continue
      const existing = this.realmscapeNoteTimings.get(note)
      if (!existing) {
        this.realmscapeNoteTimings.set(note, { startTime: time, velocity: info.velocity / 127, releaseTime: null })
        const normalizedPitch = (note - NOTE_MIN) / NOTE_RANGE
        this.realmscapePulses.push({ triggerTime: time, intensity: info.velocity / 127, pitch: normalizedPitch })
      } else if (existing.releaseTime !== null) {
        // Re-triggered: reset the note (new attack)
        existing.startTime = time
        existing.velocity = info.velocity / 127
        existing.releaseTime = null
      }
    }

    // Mark released notes
    for (const [note, timing] of this.realmscapeNoteTimings) {
      if (!midiState.notesOn.has(note) && timing.releaseTime === null) {
        timing.releaseTime = time
      }
    }

    // Prune notes that have fully faded out
    for (const [note, timing] of this.realmscapeNoteTimings) {
      if (timing.releaseTime !== null && (time - timing.releaseTime) > releaseTime) {
        this.realmscapeNoteTimings.delete(note)
      }
    }

    // Prune expired pulses, keep max 4
    this.realmscapePulses = this.realmscapePulses.filter(p => time - p.triggerTime < 3.0)
    while (this.realmscapePulses.length > 4) this.realmscapePulses.shift()

    // Build active notes array (up to 10) — includes releasing notes
    const notes: RealmscapeNote[] = []
    const releaseAges: number[] = []
    let totalVelocity = 0
    let pitchSum = 0
    let pitchSqSum = 0
    let lowestPitch = 1.0
    let highestPitch = 0.0

    for (const [note, timing] of this.realmscapeNoteTimings) {
      const normalizedPitch = (note - NOTE_MIN) / NOTE_RANGE
      const octave = Math.floor((note - NOTE_MIN) / 12)
      const releaseAge = timing.releaseTime !== null ? time - timing.releaseTime : 0

      // Weight summary stats by release envelope so mandala fades gracefully
      const releaseProgress = timing.releaseTime !== null ? Math.min(releaseAge / releaseTime, 1.0) : 0
      const linear = 1.0 - releaseProgress
      const exponential = Math.exp(-releaseProgress * 5.0)
      const envelope = linear + decayCurve * (exponential - linear)

      totalVelocity += timing.velocity * envelope
      pitchSum += normalizedPitch
      pitchSqSum += normalizedPitch * normalizedPitch
      lowestPitch = Math.min(lowestPitch, normalizedPitch)
      highestPitch = Math.max(highestPitch, normalizedPitch)

      if (notes.length < 10) {
        notes.push({
          normalizedPitch,
          velocity: timing.velocity,
          age: time - timing.startTime,
          octave
        })
        releaseAges.push(releaseAge)
      }
    }

    const noteCount = this.realmscapeNoteTimings.size
    const avgPitch = noteCount > 0 ? pitchSum / noteCount : 0.5
    const pitchVariance = noteCount > 0 ? (pitchSqSum / noteCount) - avgPitch * avgPitch : 0
    const pitchSpread = Math.sqrt(Math.max(0, pitchVariance))
    const totalEnergy = Math.min(totalVelocity / 3.0, 1.0)
    const chordWidth = noteCount > 1 ? highestPitch - lowestPitch : 0

    // Build pulses
    const realmPulses: RealmscapePulse[] = this.realmscapePulses.map(p => ({
      age: time - p.triggerTime,
      intensity: p.intensity,
      pitch: p.pitch
    }))

    const realmscapeUniforms: RealmscapeUniforms = {
      time,
      speed: shaderUniforms.speed,
      headPos: [0.5, 0.5],
      headPresence: 0,
      headVelocity: 0,
      wrist0Pos: [0.5, 0.5],
      wrist1Pos: [0.5, 0.5],
      wrist0Presence: 0,
      wrist1Presence: 0,
      noteCount,
      avgPitch,
      pitchSpread,
      totalEnergy,
      lowestNote: noteCount > 0 ? lowestPitch : 0,
      highestNote: noteCount > 0 ? highestPitch : 0,
      chordWidth,
      sustainPedal: midiState.sustain ? 1.0 : 0.0,
      notes,
      releaseAges,
      releaseTime,
      decayCurve,
      pulses: realmPulses,
      freqBands: this.emptyFreqBands
    }

    // Render directly to the screen texture
    const screenTexture = this.ctx.context.getCurrentTexture()
    const screenView = screenTexture.createView()

    this.realmscapeRenderer.render(encoder, screenView, width, height, realmscapeUniforms)

    this.ctx.device.queue.submit([encoder.finish()])
  }
}
