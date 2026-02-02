package com.neesac.bharatcrm

import android.Manifest
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import android.os.Build
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager
import android.provider.Settings
import android.content.Intent
import android.net.Uri
import android.app.NotificationManager

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
    private val authTokenStore: AuthTokenStore = AuthTokenStore(activity)
    private val deviceEnrollmentStore: DeviceEnrollmentStore = DeviceEnrollmentStore(activity)
    private val callLogReader: CallLogReader = CallLogReader(activity)
    private val appPrefs = activity.getSharedPreferences("bharatcrm_prefs", android.content.Context.MODE_PRIVATE)

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
     * Request the minimal permission needed to read SIM info (slot count + active SIMs + phone accounts).
     * This is used by the Settings page to show SIM counts even before enabling call tracking.
     */
    @JavascriptInterface
    fun requestSimInfoPermission() {
        activity.runOnUiThread {
            activity.requestPermissions(arrayOf(Manifest.permission.READ_PHONE_STATE))
        }
    }

    /**
     * Request all permissions required for call tracking in one go.
     * Use when user clicks Enable.
     */
    @JavascriptInterface
    fun requestAllCallTrackingPermissions() {
        activity.runOnUiThread {
            val perms = mutableListOf<String>()
            perms.add(Manifest.permission.READ_PHONE_STATE)
            perms.add(Manifest.permission.READ_CALL_LOG)
            if (Build.VERSION.SDK_INT >= 33) perms.add(Manifest.permission.POST_NOTIFICATIONS)
            activity.requestPermissions(perms.toTypedArray())
        }
    }

    @JavascriptInterface
    fun openAppPermissionsSettings() {
        activity.runOnUiThread {
            try {
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${activity.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(intent)
            } catch (e: Exception) {
                Log.e(tag, "openAppPermissionsSettings failed", e)
            }
        }
    }

    /**
     * Request notification permission on Android 13+.
     * Note: If the user disabled notifications at OS level for the app, they must enable them in Settings.
     */
    @JavascriptInterface
    fun requestNotificationPermission() {
        activity.runOnUiThread {
            if (Build.VERSION.SDK_INT >= 33) {
                activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS))
            }
        }
    }

    @JavascriptInterface
    fun openNotificationSettings() {
        activity.runOnUiThread {
            try {
                val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                    putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(intent)
            } catch (e: Exception) {
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${activity.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(intent)
            }
        }
    }

    @JavascriptInterface
    fun sendTestNotification(): String {
        return try {
            val nm = activity.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as NotificationManager
            val channelId = "bharatcrm_call_tracking"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val existing = nm.getNotificationChannel(channelId)
                if (existing == null) {
                    // ensure channel exists
                    val ch = android.app.NotificationChannel(
                        channelId,
                        "Call tracking",
                        NotificationManager.IMPORTANCE_DEFAULT
                    )
                    nm.createNotificationChannel(ch)
                }
            }

            val n = androidx.core.app.NotificationCompat.Builder(activity, channelId)
                .setContentTitle("BharatCRM Test Notification")
                .setContentText("If you see this, notifications work.")
                .setSmallIcon(android.R.drawable.stat_notify_more)
                .setAutoCancel(true)
                .build()

            nm.notify(99001, n)
            """{"success":true}"""
        } catch (e: Exception) {
            Log.e(tag, "sendTestNotification failed", e)
            """{"success":false,"error":"${e.message?.replace("\"","\\\"") ?: "unknown"}"}"""
        }
    }

    @JavascriptInterface
    fun setSyncIntervalMinutes(minutes: Int): String {
        return try {
            simSelectionManager.setSyncIntervalMinutes(minutes)
            """{"success":true}"""
        } catch (e: Exception) {
            Log.e(tag, "setSyncIntervalMinutes failed", e)
            """{"success":false,"error":"${e.message?.replace("\"","\\\"") ?: "unknown"}"}"""
        }
    }

    @JavascriptInterface
    fun getSyncIntervalMinutes(): Int {
        return simSelectionManager.getSyncIntervalMinutes()
    }

    @JavascriptInterface
    fun setAutoSyncEnabled(enabled: Boolean): String {
        return try {
            simSelectionManager.setAutoSyncEnabled(enabled)
            """{"success":true}"""
        } catch (e: Exception) {
            Log.e(tag, "setAutoSyncEnabled failed", e)
            """{"success":false,"error":"${e.message?.replace("\"","\\\"") ?: "unknown"}"}"""
        }
    }

    @JavascriptInterface
    fun isAutoSyncEnabled(): Boolean {
        return simSelectionManager.isAutoSyncEnabled()
    }

    @JavascriptInterface
    fun syncCallLogsNow(fullSync: Boolean): String {
        return try {
            if (fullSync) simSelectionManager.setForceFullSyncOnce()
            activity.maybeStartCallTrackingForegroundService("sync-now")
            activity.triggerCallLogSyncNow()
            """{"success":true,"fullSync":$fullSync}"""
        } catch (e: Exception) {
            Log.e(tag, "syncCallLogsNow failed", e)
            """{"success":false,"error":"${e.message?.replace("\"","\\\"") ?: "unknown"}"}"""
        }
    }

    @JavascriptInterface
    fun startCallTrackingServiceNow(): String {
        return try {
            val attempt = activity.tryStartCallTrackingForegroundService("manual")
            // Return attempt + latest status so UI can show why it didn't start.
            val status = getCallTrackingStatus()
            """{"attempt":$attempt,"status":$status}"""
        } catch (e: Exception) {
            Log.e(tag, "startCallTrackingServiceNow failed", e)
            """{"error":"${e.message?.replace("\"","\\\"") ?: "unknown"}"}"""
        }
    }

    /**
     * Save call tracking config directly (enabled + allowed SIM/phone-account ids).
     * The PWA Settings page uses this to implement SIM selection without relying on native dialogs.
     *
     * allowedPhoneAccountIdsJson must be a JSON array of strings, e.g. ["id1","id2"].
     * Empty array means "no SIM filter" (track all calls).
     */
    @JavascriptInterface
    fun configureCallTracking(enabled: Boolean, allowedPhoneAccountIdsJson: String): String {
        return try {
            val ids = parseJsonStringArray(allowedPhoneAccountIdsJson)
            simSelectionManager.setAllowedPhoneAccountIds(ids.toSet())
            simSelectionManager.setEnabled(enabled)

            if (!enabled) {
                activity.stopDeviceCallLogMonitorNow()
                activity.stopCallTrackingForegroundService()
            } else {
                // Request all call tracking permissions (phone, call log, notifications)
                val perms = mutableListOf(
                    Manifest.permission.READ_PHONE_STATE,
                    Manifest.permission.READ_CALL_LOG
                )
                if (Build.VERSION.SDK_INT >= 33) perms.add(Manifest.permission.POST_NOTIFICATIONS)
                activity.requestPermissions(perms.toTypedArray())
                activity.maybeStartCallTrackingForegroundService("configure")
            }

            // Notify UI to refresh
            sendEventToJS(
                "CALL_TRACKING_SETUP",
                """{"success":true,"enabled":${if (enabled) "true" else "false"}}"""
            )
            getCallTrackingStatus()
        } catch (e: Exception) {
            Log.e(tag, "configureCallTracking failed", e)
            """{"error":"${e.message?.replace("\"", "\\\"") ?: "unknown"}"}"""
        }
    }

    /**
     * Store Supabase session tokens (from the PWA) so native background sync can authenticate.
     *
     * expiresAtEpochSeconds should be session.expires_at (seconds since epoch).
     */
    @JavascriptInterface
    fun setAuthTokens(accessToken: String, refreshToken: String, expiresAtEpochSeconds: Long) {
        try {
            authTokenStore.setTokens(accessToken, refreshToken, expiresAtEpochSeconds)
            // If call tracking is enabled, start background sync once we have tokens.
            activity.maybeStartCallTrackingForegroundService("auth")
        } catch (e: Exception) {
            Log.e(tag, "setAuthTokens failed", e)
        }
    }

    /**
     * Store device enrollment (device_id + device_key) so background call tracking can work even if user logs out.
     */
    @JavascriptInterface
    fun setDeviceEnrollment(deviceId: String, deviceKey: String) {
        try {
            deviceEnrollmentStore.setEnrollment(deviceId, deviceKey)
            // If call tracking is enabled, start background sync once we have a device key.
            activity.maybeStartCallTrackingForegroundService("device-enroll")
        } catch (e: Exception) {
            Log.e(tag, "setDeviceEnrollment failed", e)
        }
    }

    /**
     * Same as setDeviceEnrollment, but returns a JSON result so the web UI can verify persistence.
     */
    @JavascriptInterface
    fun setDeviceEnrollmentWithResult(deviceId: String, deviceKey: String): String {
        return try {
            deviceEnrollmentStore.setEnrollment(deviceId, deviceKey)
            val present = !deviceEnrollmentStore.getDeviceKey().isNullOrBlank()
            activity.maybeStartCallTrackingForegroundService("device-enroll")
            """{"success":true,"device_key_present":${if (present) "true" else "false"}}"""
        } catch (e: Exception) {
            Log.e(tag, "setDeviceEnrollmentWithResult failed", e)
            """{"success":false,"error":"${e.message?.replace("\"","\\\"") ?: "unknown"}"}"""
        }
    }

    /**
     * Store device enrollment along with assignment metadata (who this device is enrolled to).
     */
    @JavascriptInterface
    fun setDeviceEnrollmentDetailsWithResult(deviceId: String, deviceKey: String, assignedUserName: String, assignedUserEmail: String): String {
        return try {
            deviceEnrollmentStore.setEnrollment(
                deviceId = deviceId,
                deviceKey = deviceKey,
                assignedUserName = assignedUserName.takeIf { it.isNotBlank() },
                assignedUserEmail = assignedUserEmail.takeIf { it.isNotBlank() }
            )
            val present = !deviceEnrollmentStore.getDeviceKey().isNullOrBlank()
            activity.maybeStartCallTrackingForegroundService("device-enroll")
            """{"success":true,"device_key_present":${if (present) "true" else "false"}}"""
        } catch (e: Exception) {
            Log.e(tag, "setDeviceEnrollmentDetailsWithResult failed", e)
            """{"success":false,"error":"${e.message?.replace("\"","\\\"") ?: "unknown"}"}"""
        }
    }

    /**
     * Get current call tracking status (enabled + selected SIMs).
     * Also returns available phone accounts so the PWA can show SIM1/SIM2 labels.
     */
    @JavascriptInterface
    fun getCallTrackingStatus(): String {
        val allowed = simSelectionManager.getAllowedPhoneAccountIds().toList()
        val enabled = simSelectionManager.isEnabled()
        val configured = simSelectionManager.isConfigured()

        val simSlotCount = simSelectionManager.getSimSlotCount()
        val phoneStateGranted = simSelectionManager.hasPhoneStatePermission()
        val callLogGranted = simSelectionManager.hasCallLogPermission()
        val notificationsEnabled = NotificationManagerCompat.from(activity).areNotificationsEnabled()
        val postNotificationsGranted = if (Build.VERSION.SDK_INT >= 33) {
            ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }

        val deviceKeyPresent = !deviceEnrollmentStore.getDeviceKey().isNullOrBlank()
        val tokenPresent = !authTokenStore.getAccessToken().isNullOrBlank() || !authTokenStore.getRefreshToken().isNullOrBlank()
        val enrolledDeviceId = (deviceEnrollmentStore.getDeviceId() ?: "").replace("\"","\\\"")
        val assignedName = (deviceEnrollmentStore.getAssignedUserName() ?: "").replace("\"","\\\"")
        val assignedEmail = (deviceEnrollmentStore.getAssignedUserEmail() ?: "").replace("\"","\\\"")

        val channelStatusJson = try {
            val nm = activity.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as NotificationManager
            val channelId = "bharatcrm_call_tracking"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val ch = nm.getNotificationChannel(channelId)
                if (ch == null) {
                    """{"exists":false}"""
                } else {
                    val importance = ch.importance
                    val blocked = importance == NotificationManager.IMPORTANCE_NONE
                    """{"exists":true,"importance":$importance,"blocked":${if (blocked) "true" else "false"}}"""
                }
            } else {
                """{"exists":true}"""
            }
        } catch (e: Exception) {
            """{"exists":false}"""
        }

        val serviceStatusJson = try {
            val running = appPrefs.getBoolean("call_tracking_service_running", false)
            val lastError = (appPrefs.getString("call_tracking_service_last_error", "") ?: "").replace("\"","\\\"")
            val lastStartAt = appPrefs.getLong("call_tracking_service_last_start_at_ms", 0L)
            val lastReason = (appPrefs.getString("call_tracking_service_last_start_reason", "") ?: "").replace("\"","\\\"")
            """{"running":${if (running) "true" else "false"},"last_error":"$lastError","last_start_at_ms":$lastStartAt,"last_start_reason":"$lastReason"}"""
        } catch (e: Exception) {
            """{"running":false,"last_error":"","last_start_at_ms":0,"last_start_reason":""}"""
        }

        val serviceStartAttemptJson = try {
            val at = appPrefs.getLong("call_tracking_service_last_start_attempt_at_ms", 0L)
            val reason = (appPrefs.getString("call_tracking_service_last_start_attempt_reason", "") ?: "").replace("\"","\\\"")
            val blockers = (appPrefs.getString("call_tracking_service_last_start_attempt_blockers", "") ?: "").replace("\"","\\\"")
            val err = (appPrefs.getString("call_tracking_service_last_start_attempt_error", "") ?: "").replace("\"","\\\"")
            """{"at_ms":$at,"reason":"$reason","blockers":"$blockers","error":"$err"}"""
        } catch (e: Exception) {
            """{"at_ms":0,"reason":"","blockers":"","error":""}"""
        }

        val activeSubscriptions = if (phoneStateGranted) simSelectionManager.getActiveSubscriptions() else emptyList()
        val activeSimCount = if (phoneStateGranted) activeSubscriptions.size else -1

        // Enumerate available phone accounts (SIM slots) if the OS exposes them
        val availableAccounts = simSelectionManager.getAvailablePhoneAccounts()
        val accountsJson = availableAccounts.joinToString(prefix = "[", postfix = "]") { acc ->
            val safeId = acc.id.replace("\"", "\\\"")
            val safeLabel = acc.label.replace("\"", "\\\"")
            val matchIdsJson = acc.matchIds.joinToString(prefix = "[", postfix = "]") { id ->
                "\"${id.replace("\"", "\\\"")}\""
            }
            """{"id":"$safeId","label":"$safeLabel","match_ids":$matchIdsJson}"""
        }

        val activeSubsJson = activeSubscriptions.joinToString(prefix = "[", postfix = "]") { sub ->
            val safeDisplay = (sub.displayName ?: "").replace("\"", "\\\"")
            val safeCarrier = (sub.carrierName ?: "").replace("\"", "\\\"")
            """{"subscription_id":${sub.subscriptionId},"sim_slot_index":${sub.simSlotIndex},"display_name":"$safeDisplay","carrier_name":"$safeCarrier"}"""
        }

        val allowedJson = allowed.joinToString(prefix = "[", postfix = "]") { "\"${it.replace("\"", "\\\"")}\"" }

        // Detect whether this device's CallLog provider populates PHONE_ACCOUNT_ID.
        // This indicates whether SIM filtering can be enforced reliably.
        val simSupportJson = try {
            val recent = if (callLogGranted) callLogReader.getRecentDeviceCallLogs(30) else emptyList()
            val sampleSize = recent.size
            val withPhoneAccountId = recent.count { !it.phoneAccountId.isNullOrBlank() }
            val ratio = if (sampleSize > 0) (withPhoneAccountId.toDouble() / sampleSize.toDouble()) else 0.0
            val level = when {
                !callLogGranted -> "unknown"
                sampleSize == 0 -> "unknown"
                ratio >= 0.8 -> "reliable"
                ratio >= 0.2 -> "partial"
                else -> "not_supported"
            }
            """{"level":"$level","sample_size":$sampleSize,"rows_with_phone_account_id":$withPhoneAccountId}"""
        } catch (e: Exception) {
            Log.w(tag, "SIM support probe failed", e)
            """{"level":"unknown","sample_size":0,"rows_with_phone_account_id":0}"""
        }

        val syncIntervalMinutes = simSelectionManager.getSyncIntervalMinutes()
        val autoSyncEnabled = simSelectionManager.isAutoSyncEnabled()

        return """
            {
              "enabled": $enabled,
              "configured": $configured,
              "sim_slot_count": $simSlotCount,
              "active_sim_count": $activeSimCount,
              "sync_interval_minutes": $syncIntervalMinutes,
              "auto_sync_enabled": ${if (autoSyncEnabled) "true" else "false"},
              "active_subscriptions": $activeSubsJson,
              "permissions": {
                "read_phone_state": ${if (phoneStateGranted) "true" else "false"},
                "read_call_log": ${if (callLogGranted) "true" else "false"},
                "post_notifications": ${if (postNotificationsGranted) "true" else "false"},
                "notifications_enabled": ${if (notificationsEnabled) "true" else "false"}
              },
              "auth_state": {
                "device_key_present": ${if (deviceKeyPresent) "true" else "false"},
                "token_present": ${if (tokenPresent) "true" else "false"},
                "device_id": "$enrolledDeviceId",
                "assigned_user_name": "$assignedName",
                "assigned_user_email": "$assignedEmail"
              },
              "notification_channel": $channelStatusJson,
              "service_status": $serviceStatusJson,
              "service_start_attempt": $serviceStartAttemptJson,
              "sim_filtering_support": $simSupportJson,
              "allowed_phone_account_ids": $allowedJson,
              "available_phone_accounts": $accountsJson
            }
        """.trimIndent()
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

    private fun parseJsonStringArray(json: String): List<String> {
        val trimmed = json.trim()
        if (trimmed.isEmpty()) return emptyList()
        if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return emptyList()
        val inner = trimmed.removePrefix("[").removeSuffix("]").trim()
        if (inner.isEmpty()) return emptyList()

        // Minimal safe parser for a JSON array of strings.
        // We expect values like: "abc","def"
        return inner.split(",")
            .map { it.trim() }
            .map { token ->
                var t = token
                if (t.startsWith("\"") && t.endsWith("\"") && t.length >= 2) {
                    t = t.substring(1, t.length - 1)
                }
                t.replace("\\\"", "\"")
            }
            .filter { it.isNotBlank() }
    }
}


