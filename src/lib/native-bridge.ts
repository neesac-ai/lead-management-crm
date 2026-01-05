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

  // Recording methods
  startRecording?: (leadId: string, phoneNumber: string) => void
  stopRecording?: () => void
  getRecordingStatus?: () => string

  // Location methods
  getCurrentLocation?: () => string
  startTracking?: (intervalSeconds: number) => void
  stopTracking?: () => void
  checkIn?: (leadId: string, notes: string) => void
  addGeofence?: (leadId: string, lat: number, lng: number, radius: number) => void
  removeGeofence?: (leadId: string) => void
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
  return bridge !== undefined && bridge.isAvailable === true
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
    startRecording: bridge.startRecording?.bind(bridge),
    stopRecording: bridge.stopRecording?.bind(bridge),
    getRecordingStatus: bridge.getRecordingStatus?.bind(bridge),
    getCurrentLocation: bridge.getCurrentLocation?.bind(bridge),
    startTracking: bridge.startTracking?.bind(bridge),
    stopTracking: bridge.stopTracking?.bind(bridge),
    checkIn: bridge.checkIn?.bind(bridge),
    addGeofence: bridge.addGeofence?.bind(bridge),
    removeGeofence: bridge.removeGeofence?.bind(bridge),
  }
}

/**
 * Setup native event listener
 */
export function setupNativeEventListener(
  callback: (event: NativeEvent) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handler = (event: NativeEvent) => {
    callback(event)
  }

  // Set up the event handler
  ;(window as any).onNativeEvent = handler

  // Return cleanup function
  return () => {
    delete (window as any).onNativeEvent
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


