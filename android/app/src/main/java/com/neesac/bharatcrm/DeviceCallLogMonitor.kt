package com.neesac.bharatcrm

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.provider.CallLog
import android.util.Log
import android.webkit.WebView
import androidx.core.content.ContextCompat
import com.google.gson.Gson
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Periodically scans device CallLog and forwards new rows to the PWA (WebView) as native events.
 *
 * The PWA is responsible for POSTing these to `/api/calls/log` using the logged-in session cookies.
 *
 * This is intentionally "catch-up" based: even if the app wasn't open during a call,
 * the call will appear in CallLog and will be sent on next app open/resume.
 */
class DeviceCallLogMonitor(
    private val context: Context,
    private val webView: WebView
) {
    private val tag = "DeviceCallLogMonitor"
    private val gson = Gson()
    private val callLogReader = CallLogReader(context)
    private val simSelectionManager = SimSelectionManager(context)
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private var isRunning = false
    private var handler: Handler? = null
    private var runnable: Runnable? = null

    private val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    fun start() {
        if (isRunning) return
        if (!hasPermissions()) {
            Log.w(tag, "Missing permissions; not starting")
            return
        }
        if (!simSelectionManager.isEnabled()) {
            Log.d(tag, "Call tracking disabled; not starting")
            return
        }

        isRunning = true
        handler = Handler(Looper.getMainLooper())
        runnable = object : Runnable {
            override fun run() {
                try {
                    scanAndSend()
                } catch (e: Exception) {
                    Log.e(tag, "scanAndSend failed", e)
                } finally {
                    // Re-schedule
                    if (isRunning) {
                        handler?.postDelayed(this, SCAN_INTERVAL_MS)
                    }
                }
            }
        }

        // Scan immediately, then interval
        handler?.post(runnable!!)
        Log.d(tag, "Started")
    }

    fun stop() {
        isRunning = false
        runnable?.let { r -> handler?.removeCallbacks(r) }
        runnable = null
        handler = null
        Log.d(tag, "Stopped")
    }

    fun scanAndSend() {
        if (!hasPermissions()) return
        if (!simSelectionManager.isEnabled()) return

        val allowedPhoneAccountIds = simSelectionManager.getAllowedPhoneAccountIds()
        val forceFull = simSelectionManager.consumeForceFullSyncOnce()
        val lastTs = if (forceFull) 0L else prefs.getLong(KEY_LAST_SYNCED_CALLLOG_TS_MS, 0L)

        // Read a conservative batch size so we don't overload the bridge / network.
        val rows = callLogReader.getDeviceCallLogsSince(
            sinceTimestampMsExclusive = lastTs,
            limit = MAX_ROWS_PER_SCAN,
            allowedPhoneAccountIds = allowedPhoneAccountIds
        )

        if (rows.isEmpty()) {
            return
        }

        // Convert to payload the webapp can directly POST.
        // CallLog.Calls.DATE is the call start time. End time is approximated as start + duration seconds.
        val payloadRows = rows.mapNotNull { row ->
            val type = row.callType

            // Direction is only incoming/outgoing. Status is the outcome/type.
            val direction = when (type) {
                CallLog.Calls.OUTGOING_TYPE -> "outgoing"
                else -> "incoming"
            }

            val callStartedAtIso = dateFormat.format(Date(row.date))
            val callEndedAtIso = dateFormat.format(Date(row.date + (row.duration * 1000L)))

            val status = when (type) {
                CallLog.Calls.MISSED_TYPE -> "missed"
                CallLog.Calls.REJECTED_TYPE -> "rejected"
                CallLog.Calls.BLOCKED_TYPE -> "blocked"
                CallLog.Calls.VOICEMAIL_TYPE -> "voicemail"
                CallLog.Calls.ANSWERED_EXTERNALLY_TYPE -> "answered_externally"
                CallLog.Calls.INCOMING_TYPE, CallLog.Calls.OUTGOING_TYPE -> {
                    // CallLog duration is "talk time" for incoming/outgoing.
                    when {
                        row.duration <= 0L -> "missed"
                        row.duration < 5L -> "failed"
                        else -> "completed"
                    }
                }
                else -> "unknown"
            }

            mapOf(
                "device_call_log_id" to row.id,
                "phone_number" to row.phoneNumber,
                "call_direction" to direction,
                "call_status" to status,
                "call_started_at" to callStartedAtIso,
                "call_ended_at" to callEndedAtIso,
                "duration_seconds" to row.duration,
                "contact_name" to row.name,
                "phone_account_id" to row.phoneAccountId,
                "raw_call_type" to row.callType
            )
        }

        if (payloadRows.isEmpty()) {
            // Still advance timestamp to avoid rescanning the same entries repeatedly.
            val maxTs = rows.maxOf { it.date }
            prefs.edit().putLong(KEY_LAST_SYNCED_CALLLOG_TS_MS, maxTs).apply()
            return
        }

        // Advance marker to the max DATE we processed (CallLog start time).
        val maxTs = rows.maxOf { it.date }
        prefs.edit().putLong(KEY_LAST_SYNCED_CALLLOG_TS_MS, maxTs).apply()

        val event = mapOf(
            "type" to "DEVICE_CALL_LOGS",
            "data" to mapOf(
                "logs" to payloadRows
            )
        )

        val json = gson.toJson(event)
        val script = """
            try {
              if (typeof window.onNativeEvent === 'function') {
                window.onNativeEvent($json);
              } else if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('nativeappevent', { detail: $json }));
              }
            } catch (e) {
              console.error('DEVICE_CALL_LOGS dispatch failed', e);
            }
        """.trimIndent()

        Log.d(tag, "Sending DEVICE_CALL_LOGS count=${payloadRows.size} lastTs=$maxTs allowed=${allowedPhoneAccountIds.size}")
        (context as? MainActivity)?.runOnUiThread {
            webView.evaluateJavascript(script, null)
        }
    }

    private fun hasPermissions(): Boolean {
        val hasCallLog = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED
        val hasPhoneState = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
        return hasCallLog && hasPhoneState
    }

    companion object {
        private const val PREFS_NAME = "bharatcrm_prefs"
        private const val KEY_LAST_SYNCED_CALLLOG_TS_MS = "device_calllog_last_synced_ts_ms"

        private const val SCAN_INTERVAL_MS = 60_000L // 1 minute while app is open
        private const val MAX_ROWS_PER_SCAN = 50
    }
}

