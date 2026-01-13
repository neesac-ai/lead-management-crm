/**
 * Global Native Event Listener
 * Handles native events globally across the app, persisting across component mounts/unmounts
 */

import type { NativeEvent } from './native-bridge'

type EventHandler = (event: NativeEvent) => void

class GlobalNativeEventListener {
  private handlers: Set<EventHandler> = new Set()
  private isSetup = false

  setup() {
    if (this.isSetup || typeof window === 'undefined') {
      return
    }

    // Set up global event handler that persists
    // Use Object.defineProperty to ensure it's not overwritten
    Object.defineProperty(window, 'onNativeEvent', {
      value: (event: NativeEvent) => {
        console.log('[GLOBAL_NATIVE_EVENT] Received event:', event.type, event.data)
        // Notify all registered handlers
        this.handlers.forEach(handler => {
          try {
            handler(event)
          } catch (error) {
            console.error('[GLOBAL_NATIVE_EVENT] Error in handler:', error)
          }
        })
      },
      writable: true, // Allow Android to set it if needed
      configurable: true
    })

    // Also set up custom event listener as fallback
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('nativeappevent', ((e: CustomEvent<NativeEvent>) => {
        console.log('[GLOBAL_NATIVE_EVENT] Received via custom event:', e.detail.type, e.detail.data)
        this.handlers.forEach(handler => {
          try {
            handler(e.detail)
          } catch (error) {
            console.error('[GLOBAL_NATIVE_EVENT] Error in handler:', error)
          }
        })
      }) as EventListener)
    }

    this.isSetup = true
    console.log('[GLOBAL_NATIVE_EVENT] Global listener setup complete')
  }

  addHandler(handler: EventHandler): () => void {
    this.setup() // Ensure setup is called
    this.handlers.add(handler)
    console.log('[GLOBAL_NATIVE_EVENT] Handler added, total handlers:', this.handlers.size)

    return () => {
      this.handlers.delete(handler)
      console.log('[GLOBAL_NATIVE_EVENT] Handler removed, total handlers:', this.handlers.size)
    }
  }

  removeAllHandlers() {
    this.handlers.clear()
  }
}

// Singleton instance
export const globalNativeEventListener = new GlobalNativeEventListener()

// Auto-setup when module loads (in browser)
if (typeof window !== 'undefined') {
  globalNativeEventListener.setup()
}

