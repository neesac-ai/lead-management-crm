'use client'

import { useEffect } from 'react'
import { isNativeApp, getNativeBridge } from '@/lib/native-bridge'
import { globalNativeEventListener } from '@/lib/global-native-events'
import { toast } from 'sonner'

/**
 * Global Call Tracker Component
 * Listens for CALL_ENDED events globally and logs them to backend
 * This ensures calls are tracked even if the user navigates away from the lead page
 */
// Track recently logged calls to prevent duplicates
const recentlyLoggedCalls = new Map<string, number>()
const DEDUPE_WINDOW_MS = 10000 // 10 seconds - same call can't be logged twice within 10 seconds

function getCallKey(leadId: string, phoneNumber: string, callStartedAt: string, duration: number): string {
  // Use call start time and duration to create a stable key
  // Round to nearest 10 seconds for start time to handle timing differences
  // Round duration to nearest 5 seconds
  const startTime = new Date(callStartedAt).getTime()
  const roundedStart = Math.floor(startTime / 10000) * 10000 // 10 second window
  const roundedDuration = Math.floor(duration / 5) * 5
  return `${leadId}:${phoneNumber}:${roundedStart}:${roundedDuration}`
}

export function GlobalCallTracker() {
  useEffect(() => {
    // Check if native app with retry mechanism
    const checkNativeApp = () => {
      if (typeof window === 'undefined') return false
      const bridge = (window as any).NativeBridge

      let isNative = false
      if (bridge) {
        if (typeof bridge.isAvailable === 'function') {
          try {
            isNative = bridge.isAvailable() === true
          } catch (e) {
            console.warn('[GLOBAL_CALL_TRACKER] Error calling isAvailable():', e)
          }
        } else if (bridge.isAvailable === true) {
          isNative = true
        } else {
          // If bridge exists, assume it's available
          isNative = true
        }
      }

      console.log('[GLOBAL_CALL_TRACKER] Native check:', {
        hasBridge: bridge !== undefined,
        isAvailableType: typeof bridge?.isAvailable,
        isAvailableValue: bridge?.isAvailable,
        isNative
      })
      return isNative
    }

    // Initial check
    if (!checkNativeApp()) {
      console.log('[GLOBAL_CALL_TRACKER] Not detected as native app initially, will retry...')

      // Retry after a delay (bridge might load after page load)
      const retryTimeout = setTimeout(() => {
        if (checkNativeApp()) {
          console.log('[GLOBAL_CALL_TRACKER] Native app detected on retry, setting up tracking')
          setupTracking()
        } else {
          console.warn('[GLOBAL_CALL_TRACKER] Still not detected as native app after retry')
        }
      }, 1000)

      return () => clearTimeout(retryTimeout)
    }

    console.log('[GLOBAL_CALL_TRACKER] Setting up global call tracking')

    function setupTracking() {
      const cleanup = globalNativeEventListener.addHandler((event) => {
        if (event.type === 'CALL_ENDED') {
          const { leadId, phoneNumber, duration, talkTime, ringDuration, status, callStartedAtMs, callEndedAtMs } = event.data || {}

          console.log('[GLOBAL_CALL_TRACKER] CALL_ENDED event received:', {
            leadId,
            phoneNumber,
            duration,
            talkTime,
            ringDuration,
            status,
            fullEventData: event.data
          })

          if (leadId && phoneNumber) {
            const callEndTime = typeof callEndedAtMs === 'number' ? callEndedAtMs : Date.now()
            const startTime = typeof callStartedAtMs === 'number'
              ? callStartedAtMs
              : callEndTime - (duration || 0) * 1000
            const callStartedAtISO = new Date(startTime).toISOString()
            const callEndedAtISO = new Date(callEndTime).toISOString()

            // Deduplication: Check if this call was recently logged
            // Use start time and duration for stable key (not end time which varies)
            const callKey = getCallKey(leadId, phoneNumber, callStartedAtISO, duration || 0)
            const lastLogged = recentlyLoggedCalls.get(callKey)
            const now = Date.now()

            if (lastLogged && (now - lastLogged) < DEDUPE_WINDOW_MS) {
              console.warn('[GLOBAL_CALL_TRACKER] Duplicate call detected, skipping:', {
                callKey,
                lastLogged: new Date(lastLogged).toISOString(),
                now: new Date(now).toISOString(),
                timeSince: now - lastLogged
              })
              return // Skip duplicate call
            }

            // Mark this call as logged BEFORE making the API call
            recentlyLoggedCalls.set(callKey, now)
            // Clean up old entries (older than 1 minute)
            const oneMinuteAgo = now - 60000
            for (const [key, timestamp] of recentlyLoggedCalls.entries()) {
              if (timestamp < oneMinuteAgo) {
                recentlyLoggedCalls.delete(key)
              }
            }

            console.log('[GLOBAL_CALL_TRACKER] Logging call (deduplicated):', {
              callKey,
              leadId,
              phoneNumber,
              duration,
              talkTime,
              ringDuration,
              status
            })

            // Log call to backend
            fetch('/api/calls/log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lead_id: leadId,
                phone_number: phoneNumber,
                call_direction: 'outgoing',
                call_status: status || 'completed', // Use status from Android (completed, missed, etc.)
                call_started_at: callStartedAtISO,
                call_ended_at: callEndedAtISO,
                duration_seconds: duration || 0,
                ring_duration_seconds: ringDuration || 0, // Use ring duration from Android
                talk_time_seconds: talkTime || 0, // Use talk time from Android (0 if not answered)
              }),
            })
              .then(async (response) => {
                const responseData = await response.json()
                if (response.ok) {
                  console.log('[GLOBAL_CALL_TRACKER] Call logged successfully:', responseData)
                  toast.success('Call logged successfully')
                  // Trigger event to refresh call logs in any open dialogs
                  window.dispatchEvent(new CustomEvent('callLogged', { detail: { leadId } }))
                } else {
                  console.error('[GLOBAL_CALL_TRACKER] Failed to log call:', response.status, responseData)
                  toast.error(`Failed to log call: ${responseData.error || response.statusText}`)
                }
              })
              .catch((error) => {
                console.error('[GLOBAL_CALL_TRACKER] Error logging call:', error)
                toast.error('Failed to log call')
              })
          } else {
            console.warn('[GLOBAL_CALL_TRACKER] Missing required data:', { leadId, phoneNumber })
          }
        }
      })

      return cleanup
    }

    const cleanup = setupTracking()
    return cleanup
  }, [])

  return null // This component doesn't render anything
}

