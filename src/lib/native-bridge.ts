/**
 * Native Bridge Detection and Utilities
 * Detects if running in native Android wrapper and provides bridge interface
 */

export interface NativeBridge {
  isAvailable: boolean
  platform: 'android' | 'ios' | 'web'
  version: string

  // Call tracking methods
  initiateCall?: (leadId: string, phoneNumber: string) => void
  getCallLogs?: (phoneNumber: string | null, limit: number) => string
  getLastCallStatus?: () => string
  setupCallTracking?: () => void
  getCallTrackingStatus?: () => string

  // Recording methods
  // (Call recording disabled for now)

  // Location methods
  getCurrentLocation?: () => string
  startTracking?: (intervalSeconds: number) => void
  stopTracking?: () => void
}

export interface NativeEvent {
  type: string
  data: any
}

/**
 * Detect if running in native wrapper
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false

  // Check if NativeBridge is available
  const bridge = (window as any).NativeBridge
  if (!bridge) {
    return false
  }

  // Check if isAvailable is a function or property
  if (typeof bridge.isAvailable === 'function') {
    try {
      return bridge.isAvailable() === true
    } catch (e) {
      console.warn('[NATIVE_BRIDGE] Error calling isAvailable():', e)
      return false
    }
  }

  // Fallback: if bridge exists, assume it's available
  return bridge !== undefined
}

/**
 * Get native bridge instance
 */
export function getNativeBridge(): NativeBridge | null {
  if (typeof window === 'undefined') return null

  const bridge = (window as any).NativeBridge
  if (!bridge || !bridge.isAvailable) {
    return null
  }

  return {
    isAvailable: true,
    platform: bridge.getPlatform?.() || 'android',
    version: bridge.getVersion?.() || '1.0.0',
    initiateCall: bridge.initiateCall?.bind(bridge),
    getCallLogs: bridge.getCallLogs?.bind(bridge),
    getLastCallStatus: bridge.getLastCallStatus?.bind(bridge),
    setupCallTracking: bridge.setupCallTracking?.bind(bridge),
    getCallTrackingStatus: bridge.getCallTrackingStatus?.bind(bridge),
    getCurrentLocation: bridge.getCurrentLocation?.bind(bridge),
    startTracking: bridge.startTracking?.bind(bridge),
    stopTracking: bridge.stopTracking?.bind(bridge),
  }
}

// Import global listener (will be initialized when module loads)
let globalListener: ReturnType<typeof import('./global-native-events')['globalNativeEventListener']> | null = null

if (typeof window !== 'undefined') {
  // Dynamic import to avoid SSR issues
  import('./global-native-events').then((module) => {
    globalListener = module.globalNativeEventListener
    globalListener.setup()
  })
}

/**
 * Setup native event listener
 * Uses global event listener to persist across component mounts/unmounts
 */
export function setupNativeEventListener(
  callback: (event: NativeEvent) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => { }
  }

  const handler = (event: NativeEvent) => {
    callback(event)
  }

  // Use global listener if available, otherwise fallback to direct assignment
  if (globalListener) {
    return globalListener.addHandler(handler)
  } else {
    // Fallback: set up directly (will be replaced when global listener loads)
    // Also ensure global listener is initialized
    import('./global-native-events').then((module) => {
      globalListener = module.globalNativeEventListener
      globalListener.setup()
      globalListener.addHandler(handler)
    })

    // Temporary direct assignment
    const existingHandler = (window as any).onNativeEvent
      ; (window as any).onNativeEvent = (event: NativeEvent) => {
        if (existingHandler) existingHandler(event)
        handler(event)
      }

    return () => {
      // Cleanup
      if ((window as any).onNativeEvent === handler) {
        delete (window as any).onNativeEvent
      }
    }
  }
}

/**
 * Wait for native bridge to be available
 */
export function waitForNativeBridge(timeout: number = 5000): Promise<NativeBridge | null> {
  return new Promise((resolve) => {
    if (isNativeApp()) {
      resolve(getNativeBridge())
      return
    }

    // Wait for bridge to be injected
    const startTime = Date.now()
    const checkInterval = setInterval(() => {
      if (isNativeApp()) {
        clearInterval(checkInterval)
        resolve(getNativeBridge())
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval)
        resolve(null)
      }
    }, 100)
  })
}

/**
 * Parse JSON response from native bridge
 */
export function parseNativeResponse<T>(response: string): T | null {
  try {
    return JSON.parse(response) as T
  } catch (e) {
    console.error('Error parsing native response:', e)
    return null
  }
}


