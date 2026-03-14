// MIDI Power System — maps MIDI notes to named visual "powers"
// Each power tracks active instances with trigger time + velocity intensity

export interface ActivePower {
  triggerTime: number
  intensity: number
}

interface PowerConfig {
  note: number
  maxConcurrent: number
  lifetime: number
}

interface RegisteredPower extends PowerConfig {
  active: ActivePower[]
}

export class MidiPowerSystem {
  private powers = new Map<string, RegisteredPower>()
  private noteToName = new Map<number, string>()
  private prevNotesOn = new Set<number>()

  register(name: string, config: PowerConfig): void {
    this.powers.set(name, { ...config, active: [] })
    this.noteToName.set(config.note, name)
  }

  /** Detect new note-ons for registered powers, prune expired instances */
  update(time: number, notesOn: Map<number, { velocity: number; timestamp: number }>): void {
    // Detect new note-ons
    for (const [note, info] of notesOn) {
      if (this.prevNotesOn.has(note)) continue
      const name = this.noteToName.get(note)
      if (!name) continue
      const power = this.powers.get(name)!
      power.active.push({ triggerTime: time, intensity: info.velocity / 127 })
    }
    this.prevNotesOn = new Set(notesOn.keys())

    // Prune expired + enforce max concurrent
    for (const power of this.powers.values()) {
      power.active = power.active.filter(p => time - p.triggerTime < power.lifetime)
      while (power.active.length > power.maxConcurrent) power.active.shift()
    }
  }

  /** Get active instances for a named power */
  getRaw(name: string): ActivePower[] {
    return this.powers.get(name)?.active ?? []
  }

  /** Returns true if any registered power claims this MIDI note */
  claimsNote(note: number): boolean {
    return this.noteToName.has(note)
  }
}
