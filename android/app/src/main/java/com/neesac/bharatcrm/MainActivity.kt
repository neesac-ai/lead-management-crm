package com.neesac.bharatcrm

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var nativeBridge: NativeBridge
    private lateinit var callTrackingBridge: CallTrackingBridge
    private lateinit var locationBridge: LocationBridge

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
        }
    }
}

