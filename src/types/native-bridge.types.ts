/**
 * Type definitions for Native Bridge
 */

export interface CallLogEntry {
  phoneNumber: string
  callType: 'incoming' | 'outgoing' | 'missed' | 'rejected' | 'blocked'
  duration: number
  date: string
  timestamp: number
  name?: string | null
}

export interface CallStatus {
  isInCall: boolean
  duration?: number
  leadId?: string
  phoneNumber?: string
  lastCall?: CallLogEntry
  error?: string
}

export interface LocationData {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: number
  address?: string | null
  error?: string
}

export interface RecordingStatus {
  isRecording: boolean
  leadId?: string
  phoneNumber?: string
  error?: string
}

export type NativeEventType =
  | 'CALL_RINGING'
  | 'CALL_CONNECTED'
  | 'CALL_ENDED'
  | 'CALL_ERROR'
  | 'RECORDING_STARTED'
  | 'RECORDING_STOPPED'
  | 'RECORDING_ERROR'
  | 'LOCATION_UPDATE'
  | 'LOCATION_ERROR'

export interface NativeEvent {
  type: NativeEventType
  data: Record<string, any>
}


