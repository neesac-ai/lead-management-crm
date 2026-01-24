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
    private lateinit var locationBridge: LocationBridge
    private val simSelectionManager: SimSelectionManager = SimSelectionManager(activity)

    init {
        // Initialize sub-bridges
        callTrackingBridge = CallTrackingBridge(activity, webView)
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

    /**
     * Open the native SIM selection + permission flow for call tracking.
     * This is invoked from the PWA Settings page.
     */
    @JavascriptInterface
    fun setupCallTracking() {
        activity.runOnUiThread {
            activity.showCallTrackingSetupDialog()
        }
    }

    /**
     * Get current call tracking status (enabled + selected SIMs).
     */
    @JavascriptInterface
    fun getCallTrackingStatus(): String {
        val allowed = simSelectionManager.getAllowedPhoneAccountIds().toList()
        val enabled = simSelectionManager.isEnabled()
        val configured = simSelectionManager.isConfigured()
        val allowedJson = allowed.joinToString(prefix = "[", postfix = "]") { "\"${it.replace("\"", "\\\"")}\"" }
        return """{"enabled": $enabled, "configured": $configured, "allowed_phone_account_ids": $allowedJson}"""
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
        locationBridge.onPermissionGranted(permission)
    }

    fun onPermissionDenied(permission: String) {
        Log.d(tag, "Permission denied: $permission")
        // Notify sub-bridges
        callTrackingBridge.onPermissionDenied(permission)
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


