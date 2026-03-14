import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type ShaderUniforms } from '../shared/types'

export interface UiWindowApi {
  setShaderUniforms: (uniforms: ShaderUniforms) => void
  onReady: () => void
  setAudioPreset: (preset: string) => void
  setAudioGain: (channel: string, gain: number) => void
  setAudioMuteSolo: (channel: string, muted?: boolean, solo?: boolean) => void
  onAudioLevels: (callback: (levels: any) => void) => void
}

const api: UiWindowApi = {
  setShaderUniforms: (uniforms: ShaderUniforms) => {
    ipcRenderer.send(IPC_CHANNELS.SHADER_UNIFORMS, uniforms)
  },
  onReady: () => {
    ipcRenderer.send(IPC_CHANNELS.WINDOW_READY, 'ui')
  },
  setAudioPreset: (preset: string) => {
    ipcRenderer.send(IPC_CHANNELS.AUDIO_PRESET, preset)
  },
  setAudioGain: (channel: string, gain: number) => {
    ipcRenderer.send(IPC_CHANNELS.AUDIO_GAIN, { channel, gain })
  },
  setAudioMuteSolo: (channel: string, muted?: boolean, solo?: boolean) => {
    ipcRenderer.send(IPC_CHANNELS.AUDIO_MUTE_SOLO, { channel, muted, solo })
  },
  onAudioLevels: (callback: (levels: any) => void) => {
    ipcRenderer.on(IPC_CHANNELS.AUDIO_LEVELS, (_event, levels) => callback(levels))
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)

declare global {
  interface Window {
    electronAPI: any
  }
}
