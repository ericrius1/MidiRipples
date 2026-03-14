import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    electron([
      {
        entry: 'src/main/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      },
      {
        entry: 'src/preload/ui-preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron/preload'
          }
        },
        onstart(args) {
          args.reload()
        }
      },
      {
        entry: 'src/preload/canvas-preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron/preload'
          }
        },
        onstart(args) {
          args.reload()
        }
      }
    ]),
    renderer()
  ],
  build: {
    rollupOptions: {
      input: {
        'ui-window': resolve(__dirname, 'src/ui-window/index.html'),
        'canvas-window': resolve(__dirname, 'src/canvas-window/index.html')
      }
    }
  }
})
