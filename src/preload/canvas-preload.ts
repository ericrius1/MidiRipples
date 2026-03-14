import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type ShaderUniforms } from '../shared/types'

export interface CanvasWindowApi {
  onShaderUniforms: (callback: (uniforms: ShaderUniforms) => void) => void
  onReady: () => void
  onAudioPreset: (callback: (preset: string) => void) => void
  onAudioGain: (callback: (data: { channel: string; gain: number }) => void) => void
  onAudioMuteSolo: (callback: (data: { channel: string; muted?: boolean; solo?: boolean }) => void) => void
  sendAudioLevels: (levels: any) => void
}

const api: CanvasWindowApi = {
  onShaderUniforms: (callback: (uniforms: ShaderUniforms) => void) => {
    ipcRenderer.on(IPC_CHANNELS.SHADER_UNIFORMS, (_event, uniforms) => callback(uniforms))
  },
  onReady: () => {
    ipcRenderer.send(IPC_CHANNELS.WINDOW_READY, 'canvas')
  },
  onAudioPreset: (callback: (preset: string) => void) => {
    ipcRenderer.on(IPC_CHANNELS.AUDIO_PRESET, (_event, preset) => callback(preset))
  },
  onAudioGain: (callback: (data: { channel: string; gain: number }) => void) => {
    ipcRenderer.on(IPC_CHANNELS.AUDIO_GAIN, (_event, data) => callback(data))
  },
  onAudioMuteSolo: (callback: (data: { channel: string; muted?: boolean; solo?: boolean }) => void) => {
    ipcRenderer.on(IPC_CHANNELS.AUDIO_MUTE_SOLO, (_event, data) => callback(data))
  },
  sendAudioLevels: (levels: any) => {
    ipcRenderer.send(IPC_CHANNELS.AUDIO_LEVELS, levels)
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)

// Type declaration is in ui-preload.ts to avoid conflicts
// Canvas window uses window.electronAPI with optional chaining
