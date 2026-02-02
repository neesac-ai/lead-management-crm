package com.neesac.bharatcrm

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.appcompat.app.AlertDialog
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var nativeBridge: NativeBridge
    private lateinit var callTrackingBridge: CallTrackingBridge
    private lateinit var locationBridge: LocationBridge
    private lateinit var simSelectionManager: SimSelectionManager
    private var deviceCallLogMonitor: DeviceCallLogMonitor? = null

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        // Handle permission results
        if (::nativeBridge.isInitialized && ::callTrackingBridge.isInitialized && ::locationBridge.isInitialized) {
            permissions.entries.forEach {
                val permission = it.key
                val granted = it.value
                if (granted) {
                    // Permission granted, notify bridges
                    nativeBridge.onPermissionGranted(permission)
                    callTrackingBridge.onPermissionGranted(permission)
                    locationBridge.onPermissionGranted(permission)
                } else {
                    // Permission denied, notify bridges
                    nativeBridge.onPermissionDenied(permission)
                    callTrackingBridge.onPermissionDenied(permission)
                    locationBridge.onPermissionDenied(permission)
                }
            }
        }

        if (pendingCallTrackingSetup) {
            val phoneGranted = hasPhonePermission()
            val callLogGranted = hasCallLogPermission()

            if (!phoneGranted) {
                // User denied phone permission → stop setup
                pendingCallTrackingSetup = false
                simSelectionManager.setEnabled(false)
                sendCallTrackingSetupEventToJS(success = false, enabled = false)
                return@registerForActivityResult
            }

            // We have phone permission now → show SIM picker (even if previously configured, allow re-selection)
            if (!callLogGranted) {
                // Only show SIM picker if we don't have Call Log permission yet
                // (if we already have it, we're probably just re-enabling, so skip SIM picker)
                showSimSelectionDialog()
                return@registerForActivityResult
            }

            // SIMs chosen; wait for call-log permission to start tracking
            if (callLogGranted && simSelectionManager.isEnabled()) {
                maybeStartDeviceCallLogMonitor()
                // Start foreground sync for near-real-time uploads (even if app is closed)
                maybeStartCallTrackingForegroundService("permission-granted")
                sendCallTrackingSetupEventToJS(success = true, enabled = true)
                pendingCallTrackingSetup = false
            }
        } else {
            // Normal flow (e.g. in-settings Enable, outbound call tracking)
            maybeStartDeviceCallLogMonitor()
            maybeStartCallTrackingForegroundService("permission-granted")
            // Notify web to refresh so Step 2/3 appear when permissions were just granted
            if (simSelectionManager.isEnabled()) {
                sendCallTrackingSetupEventToJS(success = true, enabled = true)
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Initialize WebView
        webView = findViewById(R.id.webView)

        // Configure WebView settings
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            setSupportZoom(true)
            builtInZoomControls = false
            displayZoomControls = false
            loadWithOverviewMode = true
            useWideViewPort = true
            allowFileAccess = true
            allowContentAccess = true
            javaScriptCanOpenWindowsAutomatically = true
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            // Cache settings - force fresh content to avoid stale cache issues
            cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
        }

        // Clear WebView cache on startup to ensure fresh content
        webView.clearCache(true)
        webView.clearHistory()

        // Initialize NativeBridge
        nativeBridge = NativeBridge(this, webView)
        callTrackingBridge = CallTrackingBridge(this, webView)
        locationBridge = LocationBridge(this, webView)
        simSelectionManager = SimSelectionManager(this)
        deviceCallLogMonitor = DeviceCallLogMonitor(this, webView)

        webView.addJavascriptInterface(nativeBridge, "NativeBridge")
        webView.addJavascriptInterface(callTrackingBridge, "CallTrackingBridge")
        webView.addJavascriptInterface(locationBridge, "LocationBridge")

        // Set WebViewClient to handle navigation
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): android.webkit.WebResourceResponse? {
                // Add cache-control headers to prevent aggressive caching
                val url = request?.url.toString()
                if (url.contains("bharatcrm.neesac.ai") || url.contains("login") || url.contains("auth")) {
                    // Force fresh content for auth pages
                    return super.shouldInterceptRequest(view, request)?.apply {
                        responseHeaders = responseHeaders?.toMutableMap()?.apply {
                            put("Cache-Control", "no-cache, no-store, must-revalidate")
                            put("Pragma", "no-cache")
                            put("Expires", "0")
                        } ?: responseHeaders
                    }
                }
                return super.shouldInterceptRequest(view, request)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url.toString()

                // Handle deep links
                if (url.startsWith("bharatcrm://")) {
                    handleDeepLink(url)
                    return true
                }

                // Handle tel: links (phone calls)
                if (url.startsWith("tel:")) {
                    val intent = Intent(Intent.ACTION_DIAL, Uri.parse(url))
                    startActivity(intent)
                    return true
                }

                // Handle mailto: links
                if (url.startsWith("mailto:")) {
                    val intent = Intent(Intent.ACTION_SENDTO, Uri.parse(url))
                    startActivity(intent)
                    return true
                }

                // Let WebView handle other URLs
                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Inject native bridge detection script
                injectNativeBridgeScript()
            }
        }

        // Set WebChromeClient for progress and console
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: android.webkit.ConsoleMessage?): Boolean {
                android.util.Log.d("WebView", "${consoleMessage?.message()} -- From line ${consoleMessage?.lineNumber()} of ${consoleMessage?.sourceId()}")
                return true
            }
        }

        // Load PWA URL
        val pwaUrl = getString(R.string.pwa_url)
        webView.loadUrl(pwaUrl)

        // Handle deep link from intent
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent?.action == Intent.ACTION_VIEW) {
            val data = intent.data
            if (data != null) {
                handleDeepLink(data.toString())
            }
        }
    }

    private fun handleDeepLink(url: String) {
        // Extract path from deep link: bharatcrm://app/path
        val path = url.replace("bharatcrm://app", "")
        val fullUrl = "${getString(R.string.pwa_url)}$path"
        webView.loadUrl(fullUrl)
    }

    private fun injectNativeBridgeScript() {
        val script = """
            (function() {
                if (typeof window.NativeBridge === 'undefined') {
                    window.NativeBridge = {
                        // This will be replaced by actual bridge methods
                        isAvailable: true,
                        platform: 'android'
                    };
                }
            })();
        """.trimIndent()

        webView.evaluateJavascript(script, null)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onResume() {
        super.onResume()
        // Catch-up scan any time the app becomes active.
        maybeStartDeviceCallLogMonitor()
        maybeStartCallTrackingForegroundService("resume")
    }

    override fun onPause() {
        super.onPause()
        // Avoid unnecessary polling while app is backgrounded; we’ll catch up on next resume.
        deviceCallLogMonitor?.stop()
    }

    fun requestPermissions(permissions: Array<String>) {
        val permissionsToRequest = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }.toTypedArray()

        if (permissionsToRequest.isNotEmpty()) {
            requestPermissionLauncher.launch(permissionsToRequest)
        } else {
            // All permissions already granted
            if (::nativeBridge.isInitialized && ::callTrackingBridge.isInitialized && ::locationBridge.isInitialized) {
                permissions.forEach { permission ->
                    nativeBridge.onPermissionGranted(permission)
                    callTrackingBridge.onPermissionGranted(permission)
                    locationBridge.onPermissionGranted(permission)
                }
            }

            maybeStartDeviceCallLogMonitor()
        }
    }

    private fun hasPhonePermission(): Boolean {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
    }

    private fun hasCallLogPermission(): Boolean {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED
    }

    private fun hasPostNotificationsPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= 33) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    private fun areNotificationsEnabledForApp(): Boolean {
        return NotificationManagerCompat.from(this).areNotificationsEnabled()
    }

    private fun openAppNotificationSettings() {
        try {
            val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
        } catch (e: Exception) {
            // Fallback: open app details page
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$packageName")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
        }
    }

    private fun maybeStartDeviceCallLogMonitor() {
        if (!::simSelectionManager.isInitialized) return
        if (!simSelectionManager.isEnabled()) return

        val hasCallLog = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED
        val hasPhoneState = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
        if (!hasCallLog || !hasPhoneState) return

        deviceCallLogMonitor?.start()
        // Also run an immediate scan (helps after permission grant)
        deviceCallLogMonitor?.scanAndSend()
    }

    fun stopDeviceCallLogMonitorNow() {
        deviceCallLogMonitor?.stop()
    }

    fun triggerCallLogSyncNow() {
        deviceCallLogMonitor?.scanAndSend()
    }

    fun maybeStartCallTrackingForegroundService(reason: String = "auto") {
        // Keep old callers, but always record diagnostics.
        tryStartCallTrackingForegroundService(reason)
    }

    fun stopCallTrackingForegroundService() {
        CallTrackingSyncService.stop(this)
    }

    fun tryStartCallTrackingForegroundService(reason: String = "manual"): String {
        val prefs = getSharedPreferences("bharatcrm_prefs", Context.MODE_PRIVATE)
        val blockers = mutableListOf<String>()

        if (!::simSelectionManager.isInitialized) {
            blockers.add("simSelectionManager_not_initialized")
        } else if (!simSelectionManager.isEnabled()) {
            blockers.add("call_tracking_disabled")
        }

        val hasCallLog = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED
        val hasPhoneState = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
        if (!hasCallLog) blockers.add("missing_READ_CALL_LOG")
        if (!hasPhoneState) blockers.add("missing_READ_PHONE_STATE")

        val notificationsEnabled = areNotificationsEnabledForApp()
        val postNotifGranted = hasPostNotificationsPermission()
        if (!notificationsEnabled) blockers.add("notifications_disabled")
        if (!postNotifGranted) blockers.add("missing_POST_NOTIFICATIONS")

        val enrollmentStore = DeviceEnrollmentStore(this)
        val hasDeviceKey = !enrollmentStore.getDeviceKey().isNullOrBlank()
        val tokenStore = AuthTokenStore(this)
        val hasAnyToken = !tokenStore.getRefreshToken().isNullOrBlank() || !tokenStore.getAccessToken().isNullOrBlank()
        if (!hasDeviceKey && !hasAnyToken) blockers.add("missing_device_key_or_tokens")

        val attemptAt = System.currentTimeMillis()
        prefs.edit()
            .putLong("call_tracking_service_last_start_attempt_at_ms", attemptAt)
            .putString("call_tracking_service_last_start_attempt_reason", reason)
            .putString("call_tracking_service_last_start_attempt_blockers", blockers.joinToString(","))
            .putString("call_tracking_service_last_start_attempt_error", "")
            .apply()

        if (blockers.isNotEmpty()) {
            return """{"started":false,"reason":"blocked","blockers":"${blockers.joinToString(",")}"}"""
        }

        return try {
            CallTrackingSyncService.start(this, reason)
            prefs.edit()
                .putString("call_tracking_service_last_start_attempt_error", "")
                .apply()
            """{"started":true}"""
        } catch (e: Exception) {
            val msg = (e.message ?: e.toString()).replace("\"", "\\\"")
            prefs.edit()
                .putString("call_tracking_service_last_start_attempt_error", msg)
                .apply()
            """{"started":false,"reason":"exception","error":"$msg"}"""
        }
    }

    /**
     * Explicit call-tracking setup flow (invoked from the PWA Settings page).
     *
     * IMPORTANT: We do NOT auto-prompt on app launch anymore (per product requirement).
     */
    fun showCallTrackingSetupDialog() {
        pendingCallTrackingSetup = true

        // Foreground sync requires notifications; guide user to enable if blocked.
        if (!areNotificationsEnabledForApp()) {
            AlertDialog.Builder(this)
                .setTitle("Enable Notifications")
                .setMessage("Background call tracking requires notifications to be enabled for BharatCRM. Please enable notifications to allow the tracking service to run.")
                .setPositiveButton("Open Settings") { _, _ ->
                    openAppNotificationSettings()
                }
                .setNegativeButton("Cancel") { _, _ ->
                    pendingCallTrackingSetup = false
                }
                .setCancelable(false)
                .show()
            return
        }

        // Step 1: ensure we have phone permission before trying to read SIM list
        if (!hasPhonePermission()) {
            val perms = mutableListOf<String>()
            perms.add(Manifest.permission.READ_PHONE_STATE)
            if (Build.VERSION.SDK_INT >= 33) perms.add(Manifest.permission.POST_NOTIFICATIONS)
            requestPermissions(perms.toTypedArray())
            return
        }

        // We already have READ_PHONE_STATE → show SIM picker
        showSimSelectionDialog()
    }

    private fun showSimSelectionDialog() {
        try {
            android.util.Log.d("MainActivity", "showSimSelectionDialog() called")
            val accounts = simSelectionManager.getAvailablePhoneAccounts()
            android.util.Log.d("MainActivity", "Found ${accounts.size} phone accounts: ${accounts.map { "${it.label} (${it.id})" }}")

        val optionLabels = mutableListOf<String>()
        val optionAccountSets = mutableListOf<Set<String>>()

        if (accounts.isNotEmpty()) {
            accounts.forEachIndexed { idx, acc ->
                val label = "SIM ${idx + 1} - ${acc.label}"
                optionLabels.add(label)
                optionAccountSets.add(acc.matchIds.toSet())
            }
            if (accounts.size > 1) {
                optionLabels.add("Both SIMs")
                optionAccountSets.add(accounts.flatMap { it.matchIds }.toSet())
            }
        } else {
            // Fallback when we can't enumerate accounts; allow "All SIMs" mode.
            android.util.Log.w("MainActivity", "No phone accounts found, using fallback 'All SIMs' option")
            // Show a more descriptive message when we can't detect individual SIMs
            optionLabels.add("Track all calls (SIM detection unavailable)")
            optionAccountSets.add(emptySet()) // empty means "no SIM filter" (allow-all)
        }

        if (optionLabels.isEmpty()) {
            android.util.Log.e("MainActivity", "No SIM options available, cannot show dialog")
            pendingCallTrackingSetup = false
            sendCallTrackingSetupEventToJS(success = false, enabled = false)
            return
        }

        var selectedIdx = 0
        android.util.Log.d("MainActivity", "Showing SIM selection dialog with ${optionLabels.size} options")
        AlertDialog.Builder(this)
            .setTitle("Select SIM for Call Tracking")
            .setMessage("Choose which SIM(s) to track calls from. We will track all inbound and outbound calls from the selected SIM(s).")
            .setSingleChoiceItems(optionLabels.toTypedArray(), 0) { _, which ->
                selectedIdx = which
                android.util.Log.d("MainActivity", "User selected option $which: ${optionLabels[which]}")
            }
            .setPositiveButton("Continue") { _, _ ->
                val selectedSet = optionAccountSets.getOrNull(selectedIdx) ?: emptySet()
                android.util.Log.d("MainActivity", "User confirmed SIM selection: ${optionLabels[selectedIdx]}, account IDs: $selectedSet")

                // Persist selection and enable
                simSelectionManager.setAllowedPhoneAccountIds(selectedSet)
                simSelectionManager.setEnabled(true)

                // Step 2: request Call Log permission now that SIM choice is known
                if (!hasCallLogPermission()) {
                    android.util.Log.d("MainActivity", "Requesting READ_CALL_LOG permission")
                    requestPermissions(arrayOf(Manifest.permission.READ_CALL_LOG))
                } else {
                    android.util.Log.d("MainActivity", "Call Log permission already granted, starting monitor")
                    maybeStartDeviceCallLogMonitor()
                    pendingCallTrackingSetup = false
                    sendCallTrackingSetupEventToJS(success = true, enabled = true)
                }
            }
            .setNegativeButton("Cancel") { _, _ ->
                android.util.Log.d("MainActivity", "User cancelled SIM selection")
                pendingCallTrackingSetup = false
                simSelectionManager.setEnabled(false)
                sendCallTrackingSetupEventToJS(success = false, enabled = false)
            }
            .setCancelable(false)
            .show()
        } catch (e: Exception) {
            android.util.Log.e("MainActivity", "Error showing SIM selection dialog", e)
            pendingCallTrackingSetup = false
            sendCallTrackingSetupEventToJS(success = false, enabled = false)
        }
    }

    private var pendingCallTrackingSetup: Boolean = false

    private fun sendCallTrackingSetupEventToJS(success: Boolean, enabled: Boolean) {
        val allowed = simSelectionManager.getAllowedPhoneAccountIds()
        val dataJson = """
            {
              "success": ${if (success) "true" else "false"},
              "enabled": ${if (enabled) "true" else "false"},
              "allowed_phone_account_ids": ${allowed.map { "\"${it.replace("\"", "\\\"")}\"" }.joinToString(prefix = "[", postfix = "]")}
            }
        """.trimIndent()

        val script = """
            try {
              if (typeof window.onNativeEvent === 'function') {
                window.onNativeEvent({ type: 'CALL_TRACKING_SETUP', data: $dataJson });
              } else if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('nativeappevent', { detail: { type: 'CALL_TRACKING_SETUP', data: $dataJson } }));
              }
            } catch (e) {}
        """.trimIndent()

        runOnUiThread { webView.evaluateJavascript(script, null) }
    }
}

