package com.neesac.bharatcrm

import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.util.Log

/**
 * Base NativeBridge that provides JavaScript interface for PWA
 * All native functionality is exposed through this bridge
 */
class NativeBridge(
    private val activity: MainActivity,
    private val webView: WebView
) {
    private val tag = "NativeBridge"

    // Initialize sub-bridges
    private lateinit var callTrackingBridge: CallTrackingBridge
    private lateinit var recordingBridge: RecordingBridge
    private lateinit var locationBridge: LocationBridge

    init {
        // Initialize sub-bridges
        callTrackingBridge = CallTrackingBridge(activity, webView)
        recordingBridge = RecordingBridge(activity, webView)
        locationBridge = LocationBridge(activity, webView)
    }

    /**
     * Check if native bridge is available
     */
    @JavascriptInterface
    fun isAvailable(): Boolean {
        return true
    }

    /**
     * Get platform information
     */
    @JavascriptInterface
    fun getPlatform(): String {
        return "android"
    }

    /**
     * Get app version
     */
    @JavascriptInterface
    fun getVersion(): String {
        return "1.0.0"
    }

    // ========== Call Tracking Methods ==========

    @JavascriptInterface
    fun initiateCall(leadId: String, phoneNumber: String) {
        callTrackingBridge.initiateCall(leadId, phoneNumber)
    }

    @JavascriptInterface
    fun getCallLogs(phoneNumber: String?, limit: Int): String {
        return callTrackingBridge.getCallLogs(phoneNumber, limit)
    }

    @JavascriptInterface
    fun getLastCallStatus(): String {
        return callTrackingBridge.getLastCallStatus()
    }

    // ========== Recording Methods ==========

    @JavascriptInterface
    fun startRecording(leadId: String, phoneNumber: String) {
        recordingBridge.startRecording(leadId, phoneNumber)
    }

    @JavascriptInterface
    fun stopRecording() {
        recordingBridge.stopRecording()
    }

    @JavascriptInterface
    fun getRecordingStatus(): String {
        return recordingBridge.getRecordingStatus()
    }

    // ========== Location Methods ==========

    @JavascriptInterface
    fun getCurrentLocation(): String {
        return locationBridge.getCurrentLocation()
    }

    @JavascriptInterface
    fun startTracking(intervalSeconds: Int) {
        locationBridge.startTracking(intervalSeconds)
    }

    @JavascriptInterface
    fun stopTracking() {
        locationBridge.stopTracking()
    }

    // ========== Permission Handling ==========

    fun onPermissionGranted(permission: String) {
        Log.d(tag, "Permission granted: $permission")
        // Notify sub-bridges
        callTrackingBridge.onPermissionGranted(permission)
        recordingBridge.onPermissionGranted(permission)
        locationBridge.onPermissionGranted(permission)
    }

    fun onPermissionDenied(permission: String) {
        Log.d(tag, "Permission denied: $permission")
        // Notify sub-bridges
        callTrackingBridge.onPermissionDenied(permission)
        recordingBridge.onPermissionDenied(permission)
        locationBridge.onPermissionDenied(permission)
    }

    /**
     * Send event to JavaScript
     */
    fun sendEventToJS(eventType: String, data: String) {
        val script = "if (window.onNativeEvent) { window.onNativeEvent({type: '$eventType', data: $data}); }"
        activity.runOnUiThread {
            webView.evaluateJavascript(script, null)
        }
    }
}


