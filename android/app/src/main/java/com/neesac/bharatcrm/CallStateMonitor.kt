package com.neesac.bharatcrm

import android.content.Context
import android.telephony.PhoneStateListener
import android.telephony.TelephonyManager
import android.provider.CallLog
import android.util.Log
import android.webkit.WebView
import com.google.gson.Gson
import java.util.concurrent.atomic.AtomicLong

/**
 * Monitors call state changes
 * Tracks call start, connected, and disconnected events
 */
class CallStateMonitor(
    private val context: Context,
    private val webView: WebView
) {
    private val tag = "CallStateMonitor"
    private var isMonitoring = false
    val isMonitoringActive: Boolean
        get() = isMonitoring
    private var currentCallStartTime = AtomicLong(0)
    private var currentCallConnectedTime = AtomicLong(0)
    private var offhookStartTime = AtomicLong(0) // Track when OFFHOOK state started
    private var currentCallPhoneNumber: String? = null
    private var currentLeadId: String? = null
    private var callState: CallState = CallState.IDLE
    private val callLogReader = CallLogReader(context)
    private var phoneStateListener: PhoneStateListener? = null
    private val telephonyManager: TelephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    private val gson = Gson()
    private var monitoringTimeoutHandler: android.os.Handler? = null
    private var callLogReadHandler: android.os.Handler? = null
    private var callLogReadRunnable: Runnable? = null
    private val MONITORING_TIMEOUT_MS = 5 * 60 * 1000L // 5 minutes timeout

    enum class CallState {
        IDLE,
        RINGING,
        OFFHOOK, // Call in progress
        ENDED
    }

    fun startMonitoring(leadId: String, phoneNumber: String) {
        Log.d(tag, "Starting call monitoring for lead: $leadId, phone: $phoneNumber")

        if (isMonitoring) {
            Log.w(tag, "Already monitoring a call")
            return
        }

        isMonitoring = true
        currentLeadId = leadId
        currentCallPhoneNumber = phoneNumber
        currentCallStartTime.set(System.currentTimeMillis())
        currentCallConnectedTime.set(0)
        offhookStartTime.set(0)
        callState = CallState.IDLE

        // Register phone state listener
        phoneStateListener = object : PhoneStateListener() {
            override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                super.onCallStateChanged(state, phoneNumber)
                handleCallStateChange(state, phoneNumber)
            }
        }

        try {
            telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE)
            Log.d(tag, "Phone state listener registered")

            // Set timeout to auto-stop monitoring if no call activity after 5 minutes
            // This handles cases where user cancels dialer or app is backgrounded
            monitoringTimeoutHandler = android.os.Handler(android.os.Looper.getMainLooper())
            monitoringTimeoutHandler?.postDelayed({
                if (isMonitoring && callState == CallState.IDLE) {
                    Log.w(tag, "Monitoring timeout - no call activity detected, stopping monitoring")
                    stopMonitoring()
                }
            }, MONITORING_TIMEOUT_MS)
        } catch (e: SecurityException) {
            Log.e(tag, "Permission denied: READ_PHONE_STATE", e)
            sendCallEvent("CALL_ERROR", mapOf("error" to "PERMISSION_DENIED"))
            isMonitoring = false
        } catch (e: Exception) {
            Log.e(tag, "Error registering phone state listener", e)
            val errorMessage: String = e.message ?: "UNKNOWN_ERROR"
            sendCallEvent("CALL_ERROR", mapOf("error" to errorMessage))
            isMonitoring = false
        }
    }

    fun stopMonitoring() {
        Log.d(tag, "Stopping call monitoring (current state: $callState)")

        if (!isMonitoring) {
            return
        }

        // Cancel timeout handler
        monitoringTimeoutHandler?.removeCallbacksAndMessages(null)
        monitoringTimeoutHandler = null

        // Cancel delayed CallLog read handler if it exists
        callLogReadRunnable?.let { runnable ->
            callLogReadHandler?.removeCallbacks(runnable)
        }
        callLogReadHandler = null
        callLogReadRunnable = null

        // Unregister listener
        phoneStateListener?.let {
            try {
                telephonyManager.listen(it, PhoneStateListener.LISTEN_NONE)
            } catch (e: Exception) {
                Log.e(tag, "Error unregistering phone state listener", e)
            }
        }
        phoneStateListener = null

        // Don't send CALL_ENDED here - it's already sent in handleCallStateChange
        // This prevents duplicate events
        // Only send if we're manually stopping and there was an active call
        if (callState == CallState.ENDED) {
            // Already sent CALL_ENDED, just cleanup
            Log.d(tag, "Call already ended, cleaning up")
        }

        isMonitoring = false
        callState = CallState.IDLE
    }

    private fun handleCallStateChange(state: Int, phoneNumber: String?) {
        Log.d(tag, "Call state changed: $state (current state: $callState), phone: $phoneNumber")

        when (state) {
            TelephonyManager.CALL_STATE_IDLE -> {
                // Only send CALL_ENDED if we were actually in a call state (RINGING or OFFHOOK)
                // Don't trigger on initial IDLE state when monitoring starts
                if (callState == CallState.OFFHOOK || callState == CallState.RINGING) {
                    Log.d(tag, "Call ended - previous state was: $callState")
                    val endTime = System.currentTimeMillis()

                    // Defensive check: ensure start time is valid
                    if (currentCallStartTime.get() == 0L) {
                        Log.w(tag, "WARNING: currentCallStartTime is 0, using endTime as fallback")
                        currentCallStartTime.set(endTime)
                    }

                    // FIX #1: Duration is ALWAYS from call start to call end (not from connection to end)
                    val duration = (endTime - currentCallStartTime.get()) / 1000

                    // Calculate talk time - time from when call was connected to when it ended
                    // This is 0 if the call was never answered
                    val talkTime = if (currentCallConnectedTime.get() > 0) {
                        (endTime - currentCallConnectedTime.get()) / 1000
                    } else {
                        0L // Never connected
                    }

                    // Calculate ring duration (time from start to connection, or total duration if never connected)
                    val ringDuration = if (currentCallConnectedTime.get() > 0) {
                        (currentCallConnectedTime.get() - currentCallStartTime.get()) / 1000
                    } else {
                        duration // Total duration if never connected
                    }

                    // FIX #2 & #3: Simplified status determination
                    // If callState is OFFHOOK when IDLE is detected, the call was answered
                    // We only need to check if currentCallConnectedTime was set (which happens in OFFHOOK)
                    val wasAnswered = callState == CallState.OFFHOOK && currentCallConnectedTime.get() > 0

                    var callStatus = when {
                        // Call was never answered - was still in RINGING state when ended
                        !wasAnswered -> {
                            "missed" // Not picked - call was ringing but never answered
                        }
                        // Call was answered but talk time is very short (< 2 seconds)
                        // This handles cases where call was answered but disconnected immediately
                        talkTime < 2 -> {
                            "missed" // Answered but disconnected too quickly (likely accidental or wrong number)
                        }
                        // Call was connected but disconnected quickly (2-5 seconds)
                        talkTime < 5 -> {
                            "failed" // Very short call, likely disconnected immediately after answering
                        }
                        // Call was connected and had meaningful talk time (>= 5 seconds)
                        else -> {
                            "completed" // Normal completed call with meaningful talk time
                        }
                    }

                    // TRY TO GET ACTUAL STATUS FROM CALL LOG (authoritative)
                    // Android needs time to write to CallLog, so we'll read it asynchronously after a delay
                    var finalDuration = duration
                    var finalTalkTime = talkTime
                    var finalRingDuration = ringDuration

                    // Function to send CALL_ENDED event (defined here so it can capture variables)
                    fun sendCallEndedEvent() {
                        // Safety check: Don't send if monitoring was stopped
                        if (!isMonitoring) {
                            Log.w(tag, "Monitoring was stopped, skipping CALL_ENDED event")
                            return
                        }

                        Log.d(tag, "Sending CALL_ENDED event - status: $callStatus, duration: $finalDuration, talkTime: $finalTalkTime, ringDuration: $finalRingDuration")
                        sendCallEvent("CALL_ENDED", mapOf(
                            "leadId" to (currentLeadId ?: ""),
                            "phoneNumber" to (currentCallPhoneNumber ?: ""),
                            "duration" to finalDuration,
                            "talkTime" to finalTalkTime,
                            "ringDuration" to finalRingDuration,
                            "status" to callStatus,
                            // Send authoritative timestamps so JS doesn't have to reconstruct times
                            // (especially important because we delay 2s to read CallLog)
                            "callStartedAtMs" to currentCallStartTime.get(),
                            "callEndedAtMs" to endTime
                        ))
                        callState = CallState.ENDED
                        stopMonitoring()
                    }

                    // Read CallLog after a short delay (Android needs time to write it)
                    callLogReadHandler = android.os.Handler(android.os.Looper.getMainLooper())
                    callLogReadRunnable = Runnable {
                        try {
                            val phone = currentCallPhoneNumber
                            if (!phone.isNullOrBlank()) {
                                // Try to find the most recent call log entry matching our call.
                                //
                                // IMPORTANT: CallLog.Calls.DATE is the call's start time (not end time),
                                // so we must match against our tracked call start time window.
                                val normalizedPhone = normalizePhoneNumber(phone)
                                val normalizedPhoneLast10 = normalizedPhone.takeLast(10)
                                val callStartMs = currentCallStartTime.get()
                                val callEndMs = endTime
                                // Wider window to tolerate OEM dialers and user delay before pressing Call
                                val startWindowMs = callStartMs - 60000L // 60s before start
                                val endWindowMs = callEndMs + 60000L     // 60s after end
                                // Read more rows to avoid missing the target entry on busy devices
                                val logs = callLogReader.getCallLogs(null, 50) // Get last 50 calls
                                Log.d(tag, "CallLog scan: totalLogs=${logs.size}, phone=$phone normalized=$normalizedPhone, startMs=$callStartMs endMs=$callEndMs window=[${startWindowMs}..${endWindowMs}]")

                                // Find matching call log entry (best match by closest start time)
                                val candidates = logs.mapNotNull { log ->
                                    val logNormalized = normalizePhoneNumber(log.phoneNumber)
                                    val logTime = log.date
                                    val logLast10 = logNormalized.takeLast(10)

                                    val phoneMatches =
                                        logNormalized == normalizedPhone ||
                                        logLast10 == normalizedPhoneLast10 ||
                                        logNormalized.endsWith(normalizedPhoneLast10) ||
                                        normalizedPhone.endsWith(logLast10)

                                    // Match the CallLog row whose start time falls within our start/end window.
                                    // This avoids accidentally matching a different recent call.
                                    val timeMatches = logTime in startWindowMs..endWindowMs

                                    if (phoneMatches && timeMatches) {
                                        val score = kotlin.math.abs(logTime - callStartMs) // closest to start wins
                                        Triple(log, score, logNormalized)
                                    } else {
                                        null
                                    }
                                }.sortedBy { it.second }

                                if (candidates.isNotEmpty()) {
                                    Log.d(
                                        tag,
                                        "CallLog candidates (phone=$phone normalized=$normalizedPhone, window=[${startWindowMs}..${endWindowMs}]): " +
                                            candidates.joinToString { (log, score, logNorm) ->
                                                "type=${log.callType} dur=${log.duration}s logTime=${log.date} score=${score} logNum=${log.phoneNumber} norm=${logNorm}"
                                            }
                                    )
                                } else {
                                    Log.w(
                                        tag,
                                        "No CallLog candidates matched (phone=$phone normalized=$normalizedPhone, window=[${startWindowMs}..${endWindowMs}]); will use fallback status"
                                    )
                                }

                                val matchingLog = candidates.firstOrNull()?.first

                                if (matchingLog != null) {
                                    val logType = matchingLog.callType
                                    val logDuration = matchingLog.duration

                                    // Map Android CallLog types to our call_status values.
                                    //
                                    // IMPORTANT: CallLog duration for OUTGOING_TYPE is talk time (seconds).
                                    // If duration is very short, treat it as a "failed" call (answered but cut quickly),
                                    // not "completed".
                                    val mappedStatus = when (logType) {
                                        CallLog.Calls.OUTGOING_TYPE -> {
                                            when {
                                                logDuration <= 0L -> "missed" // Not picked
                                                logDuration < 5L -> "failed"  // Picked but cut quickly
                                                else -> "completed"           // Meaningful talk time
                                            }
                                        }
                                        CallLog.Calls.MISSED_TYPE -> "missed"
                                        CallLog.Calls.REJECTED_TYPE -> "rejected"
                                        CallLog.Calls.BLOCKED_TYPE -> "blocked"
                                        CallLog.Calls.INCOMING_TYPE -> {
                                            when {
                                                logDuration <= 0L -> "missed"
                                                logDuration < 5L -> "failed"
                                                else -> "completed"
                                            }
                                        }
                                        else -> null
                                    }

                                    if (mappedStatus != null) {
                                        // Update status and use CallLog duration values
                                        callStatus = mappedStatus

                                        // For outgoing calls:
                                        // - logDuration = talk time (time from answer to end)
                                        // - duration = total duration (time from start to end, tracked by us)
                                        // - ringDuration = duration - logDuration (time from start to answer)
                                        if (logType == CallLog.Calls.OUTGOING_TYPE) {
                                            if (logDuration > 0) {
                                                // Call was answered - use CallLog talk time
                                                finalTalkTime = logDuration
                                                // Total duration is from our tracking (start to end)
                                                finalDuration = duration
                                                // Ring duration = total - talk time
                                                if (duration > logDuration) {
                                                    finalRingDuration = duration - logDuration
                                                } else {
                                                    // Fallback: use tracked ring duration if available
                                                    finalRingDuration = ringDuration
                                                }
                                            } else {
                                                // Call was not answered (duration = 0 in CallLog)
                                                finalDuration = duration // Use our tracked duration
                                                finalTalkTime = 0
                                                finalRingDuration = duration // All time was ringing
                                            }
                                        } else {
                                            // For missed/rejected/blocked calls:
                                            // - CallLog duration is typically 0 (Android doesn't track it well)
                                            // - Use our tracked duration instead (more accurate)
                                            // - talkTime = 0 (never answered)
                                            finalDuration = duration // Use our tracked duration (more accurate)
                                            finalTalkTime = 0
                                            finalRingDuration = duration // All time was ringing
                                        }

                                        Log.d(tag, "CallLog override applied: type=$logType, duration=$logDuration, status=$callStatus, talkTime=$finalTalkTime, ringDuration=$finalRingDuration")

                                        // Send event with CallLog values
                                        sendCallEndedEvent()
                                        return@Runnable
                                    } else {
                                        Log.w(tag, "CallLog returned unknown type ($logType); keeping computed status=$callStatus")
                                    }
                                }
                            } else {
                                Log.w(tag, "No phone number available to read CallLog; using computed status=$callStatus")
                            }

                            // If we reach here, CallLog read failed or didn't match.
                            //
                            // IMPORTANT: For outgoing calls, Telephony OFFHOOK does NOT reliably indicate "answered"
                            // (it includes dialing/ringing), so computed status can be wrong (e.g. "completed" for not picked).
                            // Use conservative fallback: "missed".
                            callStatus = "missed"
                            finalDuration = duration
                            finalTalkTime = 0
                            finalRingDuration = duration
                            Log.w(tag, "CallLog match failed; forcing status=missed (fallback). duration=$finalDuration ring=$finalRingDuration talk=$finalTalkTime")
                            sendCallEndedEvent()
                        } catch (e: SecurityException) {
                            Log.e(tag, "READ_CALL_LOG permission denied; using computed status=$callStatus", e)
                            callStatus = "missed"
                            finalDuration = duration
                            finalTalkTime = 0
                            finalRingDuration = duration
                            Log.w(tag, "READ_CALL_LOG denied; forcing status=missed (fallback). duration=$finalDuration ring=$finalRingDuration talk=$finalTalkTime")
                            sendCallEndedEvent()
                        } catch (e: Exception) {
                            Log.e(tag, "Error reading CallLog; using computed status=$callStatus", e)
                            callStatus = "missed"
                            finalDuration = duration
                            finalTalkTime = 0
                            finalRingDuration = duration
                            Log.w(tag, "CallLog error; forcing status=missed (fallback). duration=$finalDuration ring=$finalRingDuration talk=$finalTalkTime")
                            sendCallEndedEvent()
                        }
                    }
                    // Schedule CallLog read after delay
                    callLogReadRunnable?.let { runnable ->
                        callLogReadHandler?.postDelayed(runnable, 2000) // Wait 2 seconds for Android to write to CallLog
                    } ?: run {
                        Log.e(tag, "ERROR: callLogReadRunnable is null, cannot schedule CallLog read")
                        // Fallback: send event immediately with computed values
                        sendCallEndedEvent()
                    }

                    Log.d(tag, "Call status determination: callState=$callState, connectedTime=${currentCallConnectedTime.get()}, talkTime=${talkTime}s, ringDuration=${ringDuration}s, duration=${duration}s, wasAnswered=$wasAnswered, status=$callStatus")
                    Log.d(tag, "Waiting 2 seconds to read CallLog before sending CALL_ENDED event...")
                } else if (callState == CallState.IDLE) {
                    // Just idle state, not a call end - ignore
                    Log.d(tag, "IDLE state but no active call - ignoring")
                }
            }
            TelephonyManager.CALL_STATE_RINGING -> {
                // Update call start time when ringing actually starts (not when dialer opens)
                if (callState == CallState.IDLE) {
                    currentCallStartTime.set(System.currentTimeMillis())
                    Log.d(tag, "Call ringing started - updating start time")
                }

                // CRITICAL FIX: Only reset connected time if we're transitioning FROM OFFHOOK to RINGING
                // This should never happen in normal flow, but if it does, it means call was disconnected
                // However, we should NOT reset if we're already in RINGING (just a duplicate RINGING event)
                if (callState == CallState.OFFHOOK && currentCallConnectedTime.get() > 0) {
                    Log.w(tag, "RINGING state after OFFHOOK - call was disconnected, resetting connected time")
                    currentCallConnectedTime.set(0)
                    offhookStartTime.set(0)
                }

                callState = CallState.RINGING
                sendCallEvent("CALL_RINGING", mapOf(
                    "leadId" to (currentLeadId ?: ""),
                    "phoneNumber" to (currentCallPhoneNumber ?: "")
                ))
            }
            TelephonyManager.CALL_STATE_OFFHOOK -> {
                val now = System.currentTimeMillis()
                val previousState = callState // Track previous state for logging

                // IMPORTANT for outgoing calls:
                // We start monitoring when the dialer opens (ACTION_DIAL), but the user may wait before pressing "Call".
                // The first OFFHOOK is the best approximation of when dialing actually began.
                // Snap the call start time to OFFHOOK if we were still at the initial "monitoring start" time.
                if (callState == CallState.IDLE) {
                    val oldStart = currentCallStartTime.get()
                    currentCallStartTime.set(now)
                    Log.d(tag, "OFFHOOK from IDLE: updating callStartTime from $oldStart to $now (user likely pressed Call)")
                }

                // NOTE: OFFHOOK is NOT a definitive "answered" signal for outgoing calls; it includes dialing/ringing too.
                // We treat it as "call in progress" and rely on CallLog to determine answered vs not answered.

                // Always update callState to OFFHOOK first (before checking connectedTime)
                // This ensures callState is correct when IDLE is detected
                callState = CallState.OFFHOOK

                // Only set connected time if it hasn't been set yet (first time entering OFFHOOK)
                // This prevents overwriting the connection time if OFFHOOK is received multiple times
                if (currentCallConnectedTime.get() == 0L) {
                    currentCallConnectedTime.set(now)
                    offhookStartTime.set(now)
                    Log.d(tag, "Call connected - setting connected time (from previous state: $previousState)")

                    sendCallEvent("CALL_CONNECTED", mapOf(
                        "leadId" to (currentLeadId ?: ""),
                        "phoneNumber" to (currentCallPhoneNumber ?: ""),
                        "connectedAt" to currentCallConnectedTime.get()
                    ))
                } else {
                    Log.d(tag, "OFFHOOK state but connectedTime already set (${currentCallConnectedTime.get()}) - call already connected")
                }
            }
        }
    }

    fun getCurrentCallDuration(): Long {
        if (callState == CallState.OFFHOOK && currentCallConnectedTime.get() > 0) {
            return (System.currentTimeMillis() - currentCallConnectedTime.get()) / 1000
        }
        return 0
    }

    /**
     * Normalize phone number for matching (remove spaces, dashes, keep digits and +)
     */
    private fun normalizePhoneNumber(phone: String): String {
        // Remove all non-digits except leading +
        val cleaned = phone.replace("[^\\d+]".toRegex(), "")
        // Normalize Indian numbers (10 digits starting with 6-9)
        if (cleaned.length == 10 && cleaned.matches(Regex("^[6-9]\\d{9}"))) {
            return "+91$cleaned"
        }
        // If 12 digits starting with 91, add +
        if (cleaned.length == 12 && cleaned.startsWith("91")) {
            return "+$cleaned"
        }
        // If longer than 10 digits and doesn't start with +, add +
        if (!cleaned.startsWith("+") && cleaned.length > 10) {
            return "+$cleaned"
        }
        return cleaned
    }

    private fun sendCallEvent(eventType: String, data: Map<String, Any>) {
        val eventData = mapOf(
            "type" to eventType,
            "data" to data
        )

        val json = gson.toJson(eventData)
        Log.d(tag, "Sending event to JS: $eventType with data: $json")

        // Try multiple ways to ensure event is received
        // First, try to ensure window.onNativeEvent exists
        val ensureHandlerScript = """
            if (typeof window.onNativeEvent !== 'function') {
                console.warn('[CallStateMonitor] window.onNativeEvent not found, setting up fallback');
                window.onNativeEvent = function(event) {
                    console.log('[CallStateMonitor] Fallback handler received event:', event);
                    // Try to dispatch as custom event
                    if (typeof window.dispatchEvent === 'function') {
                        window.dispatchEvent(new CustomEvent('nativeappevent', { detail: event }));
                    }
                };
            }
        """.trimIndent()

        val script1 = "if (window.onNativeEvent) { window.onNativeEvent($json); }"
        val script2 = "if (typeof window.onNativeEvent === 'function') { window.onNativeEvent($json); }"
        val script3 = "try { if (window.onNativeEvent) window.onNativeEvent($json); } catch(e) { console.error('Error calling onNativeEvent:', e); }"

        (context as? MainActivity)?.runOnUiThread {
            // First ensure handler exists
            webView.evaluateJavascript(ensureHandlerScript, null)
            // Then send event with delays to ensure handler is ready
            webView.postDelayed({
                webView.evaluateJavascript(script1, null)
            }, 50)
            webView.postDelayed({
                webView.evaluateJavascript(script2, null)
            }, 150)
            webView.postDelayed({
                webView.evaluateJavascript(script3, null)
            }, 250)
        }
    }
}

