package com.neesac.bharatcrm

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.util.Log
import android.webkit.WebView
import com.google.gson.Gson
import java.text.SimpleDateFormat
import java.util.*

/**
 * Bridge for call tracking functionality
 * Provides exact call duration and status from device call logs
 */
class CallTrackingBridge(
    private val activity: MainActivity,
    private val webView: WebView
) {
    private val tag = "CallTrackingBridge"
    private lateinit var callLogReader: CallLogReader
    private lateinit var callStateMonitor: CallStateMonitor
    private lateinit var apiClient: ApiClient
    private val gson = Gson()
    private var pendingCallLeadId: String? = null
    private var pendingCallPhoneNumber: String? = null
    private val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    init {
        // Initialize call tracking components
        callLogReader = CallLogReader(activity)
        callStateMonitor = CallStateMonitor(activity, webView)
        apiClient = ApiClient(activity)
    }

    fun initiateCall(leadId: String, phoneNumber: String) {
        Log.d(tag, "Initiating call for lead: $leadId, phone: $phoneNumber")

        pendingCallLeadId = leadId
        pendingCallPhoneNumber = phoneNumber

        // Request permissions if needed
        val permissions = arrayOf(
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.READ_PHONE_STATE
        )

        activity.requestPermissions(permissions)

        // Start monitoring immediately (will work once permissions are granted)
        callStateMonitor.startMonitoring(leadId, phoneNumber)

        // Open dialer
        val intent = Intent(Intent.ACTION_DIAL).apply {
            data = Uri.parse("tel:$phoneNumber")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }

        try {
            activity.startActivity(intent)
            Log.d(tag, "Dialer opened for: $phoneNumber")
        } catch (e: Exception) {
            Log.e(tag, "Error opening dialer", e)
            sendErrorToJS("Failed to open dialer: ${e.message}")
        }
    }

    fun getCallLogs(phoneNumber: String?, limit: Int): String {
        Log.d(tag, "Getting call logs for: $phoneNumber, limit: $limit")

        try {
            val logs = callLogReader.getCallLogs(phoneNumber, limit)
            val jsonArray = logs.joinToString(", ", "[", "]") { it.toJson() }
            return jsonArray
        } catch (e: SecurityException) {
            Log.e(tag, "Permission denied: READ_CALL_LOG", e)
            return """[{"error": "PERMISSION_DENIED", "message": "READ_CALL_LOG permission required"}]"""
        } catch (e: Exception) {
            Log.e(tag, "Error getting call logs", e)
            return """[{"error": "UNKNOWN_ERROR", "message": "${e.message}"}]"""
        }
    }

    fun getLastCallStatus(): String {
        Log.d(tag, "Getting last call status")

        try {
            val duration = callStateMonitor.getCurrentCallDuration()
            val status = if (duration > 0) {
                mapOf(
                    "isInCall" to true,
                    "duration" to duration,
                    "leadId" to (pendingCallLeadId ?: ""),
                    "phoneNumber" to (pendingCallPhoneNumber ?: "")
                )
            } else {
                // Get last call from call log if available
                pendingCallPhoneNumber?.let { phone ->
                    val lastCall = callLogReader.getLastCallForNumber(phone)
                    if (lastCall != null) {
                        mapOf(
                            "isInCall" to false,
                            "lastCall" to mapOf(
                                "phoneNumber" to lastCall.phoneNumber,
                                "callType" to lastCall.getCallTypeString(),
                                "duration" to lastCall.duration,
                                "date" to lastCall.date
                            )
                        )
                    } else {
                        mapOf("isInCall" to false)
                    }
                } ?: mapOf("isInCall" to false)
            }

            return gson.toJson(status)
        } catch (e: Exception) {
            Log.e(tag, "Error getting call status", e)
            return """{"error": "${e.message}"}"""
        }
    }

    fun logCallToBackend(
        leadId: String?,
        phoneNumber: String,
        callDirection: String,
        callStatus: String,
        callStartedAt: Long,
        callEndedAt: Long?,
        durationSeconds: Int,
        ringDurationSeconds: Int = 0,
        talkTimeSeconds: Int = 0
    ) {
        val startedAt = dateFormat.format(Date(callStartedAt))
        val endedAt = callEndedAt?.let { dateFormat.format(Date(it)) }

        val deviceInfo = mapOf(
            "manufacturer" to android.os.Build.MANUFACTURER,
            "model" to android.os.Build.MODEL,
            "android_version" to android.os.Build.VERSION.RELEASE,
            "sdk_version" to android.os.Build.VERSION.SDK_INT
        )

        apiClient.logCall(
            leadId = leadId,
            phoneNumber = phoneNumber,
            callDirection = callDirection,
            callStatus = callStatus,
            callStartedAt = startedAt,
            callEndedAt = endedAt,
            durationSeconds = durationSeconds,
            ringDurationSeconds = ringDurationSeconds,
            talkTimeSeconds = talkTimeSeconds,
            deviceInfo = deviceInfo,
            networkType = null,
            authToken = null, // TODO: Get auth token from WebView
            callback = { success, error ->
                if (success) {
                    Log.d(tag, "Call logged successfully to backend")
                } else {
                    Log.e(tag, "Failed to log call to backend: $error")
                }
            }
        )
    }

    fun onPermissionGranted(permission: String) {
        Log.d(tag, "Permission granted: $permission")

        when (permission) {
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.READ_PHONE_STATE -> {
                // If we have a pending call, start monitoring
                pendingCallLeadId?.let { leadId ->
                    pendingCallPhoneNumber?.let { phone ->
                        if (!callStateMonitor.isMonitoringActive) {
                            callStateMonitor.startMonitoring(leadId, phone)
                        }
                    }
                }
            }
        }
    }

    fun onPermissionDenied(permission: String) {
        Log.d(tag, "Permission denied: $permission")
        sendErrorToJS("Permission denied: $permission")
    }

    private fun sendErrorToJS(message: String) {
        val script = """
            if (window.onNativeEvent) {
                window.onNativeEvent({
                    type: 'CALL_ERROR',
                    data: { error: '$message' }
                });
            }
        """.trimIndent()

        activity.runOnUiThread {
            webView.evaluateJavascript(script, null)
        }
    }
}
