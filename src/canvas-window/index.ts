import { initWebGPU, type WebGPUContext } from "./webgpu/context"
import { RenderGraph } from "./webgpu/render-graph"
import { initMidi, getMidiState, simulateNoteOn, simulateNoteOff } from "./midi"
import type { ShaderUniforms } from "../shared/types"
import { DEFAULT_SHADER_UNIFORMS } from "../shared/types"
import {
  initAudio,
  handleNoteOn,
  handleNoteOff,
  setAudioPreset,
  setChannelGain,
  setChannelMute,
  setChannelSolo,
  isAudioInitialized,
  getAudioLevels
} from "./audio"

let gpuContext: WebGPUContext | null = null
let renderGraph: RenderGraph | null = null
let lastFrameTime = performance.now()
let startTime = performance.now()

// Shader uniforms (with defaults)
let shaderUniforms: ShaderUniforms = { ...DEFAULT_SHADER_UNIFORMS }

// Audio level broadcast throttling
let levelBroadcastCounter = 0

// Keyboard MIDI emulation — piano-style layout
const KEY_TO_NOTE: Record<string, number> = {
  // Bottom row: white keys C3–E4
  z: 48, x: 50, c: 52, v: 53, b: 55, n: 57, m: 59,
  ",": 60, ".": 62, "/": 64,
  // Top row: black keys (sharps)
  s: 49, d: 51, g: 54, h: 56, j: 58,
  l: 61, ";": 63
}
const heldKeys = new Set<string>()

async function init(): Promise<void> {
  const canvas = document.getElementById("gpu-canvas") as HTMLCanvasElement

  // Ensure we have valid dimensions (can be 0 during page load/refresh)
  const setCanvasSize = () => {
    canvas.width =
      window.innerWidth || document.documentElement.clientWidth || 800
    canvas.height =
      window.innerHeight || document.documentElement.clientHeight || 600
  }
  setCanvasSize()

  try {
    gpuContext = await initWebGPU(canvas)

    // Initialize render graph
    renderGraph = new RenderGraph(gpuContext)
    await renderGraph.init()

    // Initialize MIDI
    await initMidi({
      onNoteOn: async (note, velocity) => {
        if (!isAudioInitialized()) await initAudio()
        handleNoteOn(note, velocity)
      },
      onNoteOff: async (note) => {
        handleNoteOff(note)
      }
    })

    // Mouse-based MIDI triggering — bottom 8% of screen acts as a keyboard
    // Moving mouse across it triggers notes in the 48-84 range
    {
      const STRIP_HEIGHT = 0.08
      const NOTE_MIN = 48
      const NOTE_MAX = 84
      const NOTE_RANGE = NOTE_MAX - NOTE_MIN
      let mouseActiveNote: number | null = null
      let mouseDown = false

      const getNoteFromMouse = (e: MouseEvent): number | null => {
        const rect = canvas.getBoundingClientRect()
        const y = (e.clientY - rect.top) / rect.height
        if (y < 1.0 - STRIP_HEIGHT) return null
        const x = (e.clientX - rect.left) / rect.width
        return NOTE_MIN + Math.floor(x * NOTE_RANGE)
      }

      const updateMouseNote = async (e: MouseEvent) => {
        const note = getNoteFromMouse(e)
        if (note === mouseActiveNote) return
        if (mouseActiveNote !== null) {
          simulateNoteOff(mouseActiveNote)
        }
        mouseActiveNote = note
        if (note !== null) {
          if (!isAudioInitialized()) await initAudio()
          simulateNoteOn(note, 100)
        }
      }

      canvas.addEventListener("mousedown", (e) => {
        mouseDown = true
        updateMouseNote(e)
      })

      canvas.addEventListener("mousemove", (e) => {
        if (!mouseDown) return
        updateMouseNote(e)
      })

      const releaseMouseNote = () => {
        if (mouseActiveNote !== null) {
          simulateNoteOff(mouseActiveNote)
          mouseActiveNote = null
        }
        mouseDown = false
      }

      canvas.addEventListener("mouseup", releaseMouseNote)
      canvas.addEventListener("mouseleave", releaseMouseNote)
    }

    // Keyboard MIDI emulation
    window.addEventListener("keydown", async (e) => {
      const key = e.key.toLowerCase()
      if (key in KEY_TO_NOTE && !heldKeys.has(key)) {
        heldKeys.add(key)
        if (!isAudioInitialized()) await initAudio()
        simulateNoteOn(KEY_TO_NOTE[key], 100)
      }
    })

    window.addEventListener("keyup", (e) => {
      const key = e.key.toLowerCase()
      if (key in KEY_TO_NOTE && heldKeys.has(key)) {
        heldKeys.delete(key)
        simulateNoteOff(KEY_TO_NOTE[key])
      }
    })

    // First-click audio init
    document.addEventListener(
      "click",
      async () => {
        if (!isAudioInitialized()) {
          await initAudio()
        }
      },
      { once: true }
    )

    // Listen for shader uniform changes
    window.electronAPI.onShaderUniforms((uniforms: ShaderUniforms) => {
      shaderUniforms = uniforms
    })

    // Audio IPC listeners
    window.electronAPI.onAudioPreset?.(async (preset: string) => {
      if (!isAudioInitialized()) await initAudio()
      setAudioPreset(preset as any)
    })

    window.electronAPI.onAudioGain?.(
      async (data: { channel: string; gain: number }) => {
        if (!isAudioInitialized()) await initAudio()
        setChannelGain(data.channel as any, data.gain)
      }
    )

    window.electronAPI.onAudioMuteSolo?.(
      async (data: { channel: string; muted?: boolean; solo?: boolean }) => {
        if (!isAudioInitialized()) await initAudio()
        if (data.muted !== undefined)
          setChannelMute(data.channel as any, data.muted)
        if (data.solo !== undefined)
          setChannelSolo(data.channel as any, data.solo)
      }
    )

    // Signal ready
    window.electronAPI.onReady()

    // Start render loop
    requestAnimationFrame(render)
  } catch (err) {
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.fillStyle = "#ff0000"
      ctx.font = "24px sans-serif"
      ctx.fillText("Initialization failed", 50, 50)
      ctx.fillText(String(err), 50, 80)
    }
  }
}

function render(now: number): void {
  if (!gpuContext || !renderGraph) return

  const deltaTime = now - lastFrameTime
  lastFrameTime = now
  const time = (now - startTime) / 1000

  const midiState = getMidiState()

  // Broadcast audio levels to UI (throttled to ~20fps)
  levelBroadcastCounter++
  if (levelBroadcastCounter >= 3) {
    levelBroadcastCounter = 0
    if (isAudioInitialized()) {
      const levels = getAudioLevels()
      window.electronAPI.sendAudioLevels?.(levels)
    }
  }

  // Render
  renderGraph.render(time, deltaTime, midiState, shaderUniforms)

  requestAnimationFrame(render)
}

// Handle window resize
window.addEventListener("resize", () => {
  const canvas = document.getElementById("gpu-canvas") as HTMLCanvasElement
  const width = window.innerWidth || document.documentElement.clientWidth
  const height = window.innerHeight || document.documentElement.clientHeight
  if (width > 0 && height > 0) {
    canvas.width = width
    canvas.height = height
  }

  if (gpuContext) {
    gpuContext.context.configure({
      device: gpuContext.device,
      format: gpuContext.format,
      alphaMode: "premultiplied"
    })
  }
})

// Wait for DOM ready before initializing
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init)
} else {
  init()
}
