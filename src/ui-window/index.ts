import type { ShaderUniforms } from '../shared/types'
import { DEFAULT_SHADER_UNIFORMS } from '../shared/types'
import type { AudioPreset } from '../shared/audio-types'

const uniforms: ShaderUniforms = { ...DEFAULT_SHADER_UNIFORMS }
const controlsContainer = document.getElementById('controls') as HTMLElement

interface SliderDef {
  param: string
  label: string
  key: keyof ShaderUniforms
  min: number
  max: number
}

const sliders: SliderDef[] = [
  { param: 'speed', label: 'Speed', key: 'shockwaveSpeed', min: 2.0, max: 20.0 },
  { param: 'width', label: 'Width', key: 'shockwaveWidth', min: 0.5, max: 5.0 },
  { param: 'color', label: 'Color', key: 'shockwaveColor', min: 0.0, max: 1.0 },
  { param: 'size', label: 'Size', key: 'shockwaveSize', min: 0.0, max: 1.0 },
]

function createSlider(def: SliderDef): void {
  const value = uniforms[def.key]
  const ratio = (value - def.min) / (def.max - def.min)

  const row = document.createElement('div')
  row.className = 'slider-row'
  row.dataset.param = def.param

  const label = document.createElement('div')
  label.className = 'slider-label'
  label.innerHTML = `<span>${def.label}</span><span class="slider-value">${value.toFixed(2)}</span>`

  const track = document.createElement('div')
  track.className = 'slider-track'

  const fill = document.createElement('div')
  fill.className = 'slider-fill'
  fill.style.width = `${ratio * 100}%`

  const thumb = document.createElement('div')
  thumb.className = 'slider-thumb'
  thumb.style.left = `${ratio * 100}%`

  track.appendChild(fill)
  track.appendChild(thumb)
  row.appendChild(label)
  row.appendChild(track)
  controlsContainer.appendChild(row)

  // Drag handling
  let dragging = false

  const update = (e: PointerEvent) => {
    const rect = track.getBoundingClientRect()
    const r = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const v = def.min + r * (def.max - def.min)
    uniforms[def.key] = v as any
    fill.style.width = `${r * 100}%`
    thumb.style.left = `${r * 100}%`
    label.querySelector('.slider-value')!.textContent = v.toFixed(2)
    window.electronAPI.setShaderUniforms(uniforms)
  }

  track.addEventListener('pointerdown', (e) => {
    dragging = true
    track.setPointerCapture(e.pointerId)
    update(e)
  })
  track.addEventListener('pointermove', (e) => { if (dragging) update(e) })
  track.addEventListener('pointerup', (e) => {
    dragging = false
    track.releasePointerCapture(e.pointerId)
  })
  track.addEventListener('pointercancel', (e) => {
    dragging = false
    track.releasePointerCapture(e.pointerId)
  })
}

// Build sliders
sliders.forEach(createSlider)

// Preset buttons
const presetBtns = document.querySelectorAll('.preset-btn')
presetBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    presetBtns.forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    window.electronAPI.setAudioPreset(btn.getAttribute('data-preset')!)
  })
})

// Volume slider
const volumeSlider = document.getElementById('volume') as HTMLInputElement
volumeSlider.addEventListener('input', () => {
  window.electronAPI.setAudioGain('master', parseInt(volumeSlider.value) / 100)
})

// Send initial uniforms
window.electronAPI.setShaderUniforms(uniforms)
window.electronAPI.onReady()
