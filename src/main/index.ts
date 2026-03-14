import { app, BrowserWindow, screen, ipcMain, powerSaveBlocker, session } from "electron"
import { join } from "path"
import { IPC_CHANNELS, type ShaderUniforms } from "../shared/types"
import { CONFIG } from "../shared/config"

// Handle uncaught errors gracefully
process.on('uncaughtException', () => {})

let uiWindow: BrowserWindow | null = null
let canvasWindow: BrowserWindow | null = null
let powerSaveBlockerId: number | null = null

const isDev = !app.isPackaged

function createUIWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 280,
    height: 360,
    minWidth: 220,
    minHeight: 280,
    title: "MidiRipples",
    titleBarStyle: "hiddenInset",
    vibrancy: "under-window",
    webPreferences: {
      preload: join(__dirname, "../preload/ui-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  if (isDev) {
    win.loadURL("http://localhost:5173/src/ui-window/index.html")
    if (CONFIG.OPEN_DEVTOOLS) win.webContents.openDevTools({ mode: "detach" })
  } else {
    win.loadFile(join(__dirname, "../../dist/ui-window/index.html"))
  }

  return win
}

function createCanvasWindow(): BrowserWindow {
  const displays = screen.getAllDisplays()
  const primaryDisplay = screen.getPrimaryDisplay()

  // Find secondary display if available
  const secondaryDisplay = displays.find((d) => d.id !== primaryDisplay.id)
  const targetDisplay = secondaryDisplay || primaryDisplay

  const winOptions: Electron.BrowserWindowConstructorOptions = {
    title: "MidiRipples - Canvas",
    webPreferences: {
      preload: join(__dirname, "../preload/canvas-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  }

  // Fullscreen on secondary display, windowed on primary
  if (secondaryDisplay) {
    winOptions.x = targetDisplay.bounds.x
    winOptions.y = targetDisplay.bounds.y
    winOptions.fullscreen = true
  } else {
    winOptions.width = 1280
    winOptions.height = 720
  }

  const win = new BrowserWindow(winOptions)

  if (isDev) {
    win.loadURL("http://localhost:5173/src/canvas-window/index.html")
    if (CONFIG.OPEN_DEVTOOLS) win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, "../../dist/canvas-window/index.html"))
  }

  return win
}

function setupIPC(): void {
  // Route shader uniforms from UI window to canvas window
  ipcMain.on(IPC_CHANNELS.SHADER_UNIFORMS, (_event, uniforms: ShaderUniforms) => {
    if (canvasWindow && !canvasWindow.isDestroyed()) {
      canvasWindow.webContents.send(IPC_CHANNELS.SHADER_UNIFORMS, uniforms)
    }
  })

  // Window ready notifications
  ipcMain.on(IPC_CHANNELS.WINDOW_READY, () => {})

  // Route audio preset from UI window to canvas window
  ipcMain.on(IPC_CHANNELS.AUDIO_PRESET, (_event, preset: string) => {
    if (canvasWindow && !canvasWindow.isDestroyed()) {
      canvasWindow.webContents.send(IPC_CHANNELS.AUDIO_PRESET, preset)
    }
  })

  // Route audio gain from UI window to canvas window
  ipcMain.on(IPC_CHANNELS.AUDIO_GAIN, (_event, data) => {
    if (canvasWindow && !canvasWindow.isDestroyed()) {
      canvasWindow.webContents.send(IPC_CHANNELS.AUDIO_GAIN, data)
    }
  })

  // Route audio mute/solo from UI window to canvas window
  ipcMain.on(IPC_CHANNELS.AUDIO_MUTE_SOLO, (_event, data) => {
    if (canvasWindow && !canvasWindow.isDestroyed()) {
      canvasWindow.webContents.send(IPC_CHANNELS.AUDIO_MUTE_SOLO, data)
    }
  })

  // Route audio levels from canvas window to UI window
  ipcMain.on(IPC_CHANNELS.AUDIO_LEVELS, (_event, levels) => {
    if (uiWindow && !uiWindow.isDestroyed()) {
      uiWindow.webContents.send(IPC_CHANNELS.AUDIO_LEVELS, levels)
    }
  })
}

app.whenReady().then(() => {
  // Grant permission for MIDI access
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'midi') {
      callback(true)
    } else {
      callback(false)
    }
  })

  // Prevent system from throttling app when in background
  powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension')

  setupIPC()

  uiWindow = createUIWindow()
  canvasWindow = createCanvasWindow()

  uiWindow.on("closed", () => {
    uiWindow = null
    // Close canvas window when UI window closes
    if (canvasWindow && !canvasWindow.isDestroyed()) {
      canvasWindow.close()
    }
  })

  canvasWindow.on("closed", () => {
    canvasWindow = null
  })
})

app.on("window-all-closed", () => {
  // Stop power save blocker when app closes
  if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
    powerSaveBlocker.stop(powerSaveBlockerId)
  }
  app.quit()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    uiWindow = createUIWindow()
    canvasWindow = createCanvasWindow()
  }
})
