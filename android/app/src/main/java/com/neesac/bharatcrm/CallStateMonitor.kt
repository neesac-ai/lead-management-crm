package com.neesac.bharatcrm

import android.content.Context
import android.telephony.PhoneStateListener
import android.telephony.TelephonyManager
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
    private var currentCallPhoneNumber: String? = null
    private var currentLeadId: String? = null
    private var callState: CallState = CallState.IDLE
    private var phoneStateListener: PhoneStateListener? = null
    private val telephonyManager: TelephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    private val gson = Gson()

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
        } catch (e: SecurityException) {
            Log.e(tag, "Permission denied: READ_PHONE_STATE", e)
            sendCallEvent("CALL_ERROR", mapOf("error" to "PERMISSION_DENIED"))
        } catch (e: Exception) {
            Log.e(tag, "Error registering phone state listener", e)
            val errorMessage: String = e.message ?: "UNKNOWN_ERROR"
            sendCallEvent("CALL_ERROR", mapOf("error" to errorMessage))
        }
    }

    fun stopMonitoring() {
        Log.d(tag, "Stopping call monitoring")

        if (!isMonitoring) {
            return
        }

        // Unregister listener
        phoneStateListener?.let {
            try {
                telephonyManager.listen(it, PhoneStateListener.LISTEN_NONE)
            } catch (e: Exception) {
                Log.e(tag, "Error unregistering phone state listener", e)
            }
        }
        phoneStateListener = null

        // Calculate final duration if call was in progress
        if (callState == CallState.OFFHOOK) {
            val endTime = System.currentTimeMillis()
            val duration = if (currentCallConnectedTime.get() > 0) {
                (endTime - currentCallConnectedTime.get()) / 1000
            } else {
                0
            }

            sendCallEvent("CALL_ENDED", mapOf(
                "leadId" to (currentLeadId ?: ""),
                "phoneNumber" to (currentCallPhoneNumber ?: ""),
                "duration" to duration,
                "status" to "completed"
            ))
        }

        isMonitoring = false
        callState = CallState.IDLE
    }

    private fun handleCallStateChange(state: Int, phoneNumber: String?) {
        Log.d(tag, "Call state changed: $state, phone: $phoneNumber")

        when (state) {
            TelephonyManager.CALL_STATE_IDLE -> {
                if (callState == CallState.OFFHOOK || callState == CallState.RINGING) {
                    // Call ended
                    val endTime = System.currentTimeMillis()
                    val duration = if (currentCallConnectedTime.get() > 0) {
                        (endTime - currentCallConnectedTime.get()) / 1000
                    } else {
                        0
                    }

                    sendCallEvent("CALL_ENDED", mapOf(
                        "leadId" to (currentLeadId ?: ""),
                        "phoneNumber" to (currentCallPhoneNumber ?: ""),
                        "duration" to duration,
                        "status" to "completed"
                    ))

                    callState = CallState.ENDED
                    stopMonitoring()
                }
            }
            TelephonyManager.CALL_STATE_RINGING -> {
                callState = CallState.RINGING
                sendCallEvent("CALL_RINGING", mapOf(
                    "leadId" to (currentLeadId ?: ""),
                    "phoneNumber" to (currentCallPhoneNumber ?: "")
                ))
            }
            TelephonyManager.CALL_STATE_OFFHOOK -> {
                if (callState == CallState.RINGING || callState == CallState.IDLE) {
                    // Call connected
                    callState = CallState.OFFHOOK
                    currentCallConnectedTime.set(System.currentTimeMillis())

                    sendCallEvent("CALL_CONNECTED", mapOf(
                        "leadId" to (currentLeadId ?: ""),
                        "phoneNumber" to (currentCallPhoneNumber ?: ""),
                        "connectedAt" to currentCallConnectedTime.get()
                    ))
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

    private fun sendCallEvent(eventType: String, data: Map<String, Any>) {
        val eventData = mapOf(
            "type" to eventType,
            "data" to data
        )

        val json = gson.toJson(eventData)
        val script = "if (window.onNativeEvent) { window.onNativeEvent($json); }"

        (context as? MainActivity)?.runOnUiThread {
            webView.evaluateJavascript(script, null)
        }
    }
}

