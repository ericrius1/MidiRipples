export interface WebGPUContext {
  device: GPUDevice
  context: GPUCanvasContext
  format: GPUTextureFormat
  canvas: HTMLCanvasElement
  canTimestamp: boolean
}

export async function initWebGPU(
  canvas: HTMLCanvasElement
): Promise<WebGPUContext> {
  // Check WebGPU support
  if (!navigator.gpu) {
    throw new Error("WebGPU is not supported in this browser")
  }

  // Request adapter with high-performance preference
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance"
  })

  if (!adapter) {
    throw new Error("Failed to get WebGPU adapter")
  }

  const canTimestamp = adapter.features.has("timestamp-query")

  // Request device with timestamp-query if available
  const device = await adapter.requestDevice({
    label: "MidiRipples Device",
    requiredFeatures: canTimestamp ? ["timestamp-query"] : []
  })

  // Handle device loss
  device.lost.then((info) => {
    if (info.reason !== "destroyed") {
      // Attempt to reinitialize
      initWebGPU(canvas)
    }
  })

  // Get canvas context
  const context = canvas.getContext("webgpu")
  if (!context) {
    throw new Error("Failed to get WebGPU canvas context")
  }

  // Get preferred format
  const format = navigator.gpu.getPreferredCanvasFormat()

  // Configure context
  context.configure({
    device,
    format,
    alphaMode: "premultiplied"
  })

  return {
    device,
    context,
    format,
    canvas,
    canTimestamp
  }
}
