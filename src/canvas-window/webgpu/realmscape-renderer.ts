import type { WebGPUContext } from './context'
import realmscapeShaderSource from './realmscape-shader.wgsl?raw'

export interface RealmscapeNote {
  normalizedPitch: number  // 0-1 across full range
  velocity: number         // 0-1
  age: number             // seconds since note-on
  octave: number          // 0, 1, or 2
}

export interface RealmscapePulse {
  age: number        // seconds since note-on
  intensity: number  // 0-1 from velocity
  pitch: number      // 0-1 normalized pitch
}

export interface RealmscapeUniforms {
  time: number
  speed: number
  headPos: [number, number]
  headPresence: number
  headVelocity: number
  wrist0Pos: [number, number]
  wrist1Pos: [number, number]
  wrist0Presence: number
  wrist1Presence: number
  // MIDI summary
  noteCount: number
  avgPitch: number
  pitchSpread: number
  totalEnergy: number
  lowestNote: number
  highestNote: number
  chordWidth: number
  sustainPedal: number
  // Active notes (up to 10)
  notes: RealmscapeNote[]
  // Per-note release age (0 = held, >0 = seconds since release)
  releaseAges: number[]
  // Release envelope params
  releaseTime: number   // total fade duration in seconds
  decayCurve: number    // 0=linear, 1=exponential
  // Recent note-on pulses (up to 4)
  pulses: RealmscapePulse[]
  // FFT bands
  freqBands: Float32Array
}

export class RealmscapeRenderer {
  private device: GPUDevice
  private pipeline: GPURenderPipeline | null = null
  private uniformBuffer: GPUBuffer | null = null
  private bindGroup: GPUBindGroup | null = null

  constructor(private ctx: WebGPUContext) {
    this.device = ctx.device
  }

  async init(targetFormat: GPUTextureFormat): Promise<void> {
    const shaderModule = this.device.createShaderModule({
      label: 'Realmscape Shader',
      code: realmscapeShaderSource
    })

    // 400 bytes = 100 floats
    // Layout:
    //   0-3:   time, width, height, speed
    //   4-7:   headX, headY, headPresence, headVelocity
    //   8-11:  wrist0X, wrist0Y, wrist1X, wrist1Y
    //   12-15: wrist0Presence, wrist1Presence, pad, pad
    //   16-19: noteCount, avgPitch, pitchSpread, totalEnergy
    //   20-23: lowestNote, highestNote, chordWidth, sustainPedal
    //   24-63: 10 notes × vec4f (pitch, velocity, age, octave)
    //   64-67: releaseAge[0-3]
    //   68-71: releaseAge[4-7]
    //   72-75: releaseAge[8-9], releaseTime, decayCurve
    //   76-91: 4 pulses × vec4f (age, intensity, pitch, 0)
    //   92-99: FFT bands (2 × vec4f)
    this.uniformBuffer = this.device.createBuffer({
      label: 'Realmscape Uniforms',
      size: 400,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })

    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' }
      }]
    })

    this.bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{
        binding: 0,
        resource: { buffer: this.uniformBuffer }
      }]
    })

    this.pipeline = this.device.createRenderPipeline({
      label: 'Realmscape Pipeline',
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout]
      }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain'
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [{ format: targetFormat }]
      },
      primitive: { topology: 'triangle-list' }
    })
  }

  render(
    encoder: GPUCommandEncoder,
    targetView: GPUTextureView,
    width: number,
    height: number,
    uniforms: RealmscapeUniforms,
    timestampWrites?: GPURenderPassTimestampWrites
  ): void {
    if (!this.pipeline || !this.uniformBuffer || !this.bindGroup) return

    const n = uniforms.notes ?? []
    const ra = uniforms.releaseAges ?? []
    const p = uniforms.pulses ?? []
    const fb = uniforms.freqBands ?? new Float32Array(8)

    const uniformData = new Float32Array([
      // Base (4)
      uniforms.time,
      width,
      height,
      uniforms.speed,
      // Head (4)
      uniforms.headPos[0],
      uniforms.headPos[1],
      uniforms.headPresence,
      uniforms.headVelocity,
      // Wrists (8)
      uniforms.wrist0Pos[0],
      uniforms.wrist0Pos[1],
      uniforms.wrist1Pos[0],
      uniforms.wrist1Pos[1],
      uniforms.wrist0Presence,
      uniforms.wrist1Presence,
      0, 0, // padding
      // MIDI Summary (8)
      uniforms.noteCount,
      uniforms.avgPitch,
      uniforms.pitchSpread,
      uniforms.totalEnergy,
      uniforms.lowestNote,
      uniforms.highestNote,
      uniforms.chordWidth,
      uniforms.sustainPedal,
      // 10 notes × vec4f (40)
      n[0]?.normalizedPitch ?? 0, n[0]?.velocity ?? 0, n[0]?.age ?? 0, n[0]?.octave ?? 0,
      n[1]?.normalizedPitch ?? 0, n[1]?.velocity ?? 0, n[1]?.age ?? 0, n[1]?.octave ?? 0,
      n[2]?.normalizedPitch ?? 0, n[2]?.velocity ?? 0, n[2]?.age ?? 0, n[2]?.octave ?? 0,
      n[3]?.normalizedPitch ?? 0, n[3]?.velocity ?? 0, n[3]?.age ?? 0, n[3]?.octave ?? 0,
      n[4]?.normalizedPitch ?? 0, n[4]?.velocity ?? 0, n[4]?.age ?? 0, n[4]?.octave ?? 0,
      n[5]?.normalizedPitch ?? 0, n[5]?.velocity ?? 0, n[5]?.age ?? 0, n[5]?.octave ?? 0,
      n[6]?.normalizedPitch ?? 0, n[6]?.velocity ?? 0, n[6]?.age ?? 0, n[6]?.octave ?? 0,
      n[7]?.normalizedPitch ?? 0, n[7]?.velocity ?? 0, n[7]?.age ?? 0, n[7]?.octave ?? 0,
      n[8]?.normalizedPitch ?? 0, n[8]?.velocity ?? 0, n[8]?.age ?? 0, n[8]?.octave ?? 0,
      n[9]?.normalizedPitch ?? 0, n[9]?.velocity ?? 0, n[9]?.age ?? 0, n[9]?.octave ?? 0,
      // Release data: 3 × vec4f (12)
      ra[0] ?? 0, ra[1] ?? 0, ra[2] ?? 0, ra[3] ?? 0,
      ra[4] ?? 0, ra[5] ?? 0, ra[6] ?? 0, ra[7] ?? 0,
      ra[8] ?? 0, ra[9] ?? 0, uniforms.releaseTime, uniforms.decayCurve,
      // 4 pulses × vec4f (16)
      p[0]?.age ?? 0, p[0]?.intensity ?? 0, p[0]?.pitch ?? 0, 0,
      p[1]?.age ?? 0, p[1]?.intensity ?? 0, p[1]?.pitch ?? 0, 0,
      p[2]?.age ?? 0, p[2]?.intensity ?? 0, p[2]?.pitch ?? 0, 0,
      p[3]?.age ?? 0, p[3]?.intensity ?? 0, p[3]?.pitch ?? 0, 0,
      // FFT bands (8)
      fb[0], fb[1], fb[2], fb[3],
      fb[4], fb[5], fb[6], fb[7],
    ])

    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData)

    const renderPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: targetView,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 }
      }],
      timestampWrites
    })

    renderPass.setPipeline(this.pipeline)
    renderPass.setBindGroup(0, this.bindGroup)
    renderPass.draw(3)

    renderPass.end()
  }
}
