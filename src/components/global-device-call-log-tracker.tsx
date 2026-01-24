'use client'

import { useEffect } from 'react'
import { globalNativeEventListener } from '@/lib/global-native-events'

type DeviceCallLogRow = {
  device_call_log_id?: number
  phone_number: string
  call_direction: 'incoming' | 'outgoing' | 'missed' | 'rejected' | 'blocked'
  call_status: 'completed' | 'missed' | 'rejected' | 'blocked' | 'busy' | 'failed'
  call_started_at: string
  call_ended_at?: string
  duration_seconds?: number
  contact_name?: string | null
  phone_account_id?: string | null
}

// Light client-side dedupe to reduce noisy repeat scans.
const recentlyLogged = new Map<string, number>()
const DEDUPE_WINDOW_MS = 60_000

function keyFor(row: DeviceCallLogRow): string {
  const startedAt = new Date(row.call_started_at).getTime()
  const roundedStart = Math.floor(startedAt / 10_000) * 10_000
  const roundedDuration = Math.floor((row.duration_seconds || 0) / 5) * 5
  return `${row.phone_number}:${row.call_direction}:${roundedStart}:${roundedDuration}`
}

export function GlobalDeviceCallLogTracker() {
  useEffect(() => {
    const cleanup = globalNativeEventListener.addHandler((event) => {
      if (event.type !== 'DEVICE_CALL_LOGS') return

      const rows = (event.data?.logs || []) as DeviceCallLogRow[]
      if (!Array.isArray(rows) || rows.length === 0) return

      const now = Date.now()
      // Clean up old dedupe keys
      for (const [k, ts] of recentlyLogged.entries()) {
        if (now - ts > DEDUPE_WINDOW_MS) recentlyLogged.delete(k)
      }

      const rowsToSend = rows.filter((row) => {
        if (!row?.phone_number || !row?.call_direction || !row?.call_status || !row?.call_started_at) return false
        const k = keyFor(row)
        const last = recentlyLogged.get(k)
        if (last && now - last < DEDUPE_WINDOW_MS) return false
        recentlyLogged.set(k, now)
        return true
      })

      if (rowsToSend.length === 0) return

      // Fire-and-forget logging. Backend also dedupes (user_id + phone + start-time window + duration tolerance).
      void Promise.allSettled(
        rowsToSend.map((row) =>
          fetch('/api/calls/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lead_id: null,
              phone_number: row.phone_number,
              call_direction: row.call_direction,
              call_status: row.call_status,
              call_started_at: row.call_started_at,
              call_ended_at: row.call_ended_at || null,
              duration_seconds: row.duration_seconds || 0,
              // Put device-only metadata into device_info so we can debug later without schema changes.
              device_info: {
                device_call_log_id: row.device_call_log_id,
                contact_name: row.contact_name,
                phone_account_id: row.phone_account_id,
                source: 'android_call_log',
              },
            }),
          })
        )
      )
    })

    return cleanup
  }, [])

  return null
}

