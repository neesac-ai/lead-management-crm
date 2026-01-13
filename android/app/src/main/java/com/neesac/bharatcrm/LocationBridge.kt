package com.neesac.bharatcrm

import android.Manifest
import android.util.Log
import android.webkit.WebView
import com.google.gson.Gson
import java.text.SimpleDateFormat
import java.util.*

/**
 * Bridge for location tracking functionality
 * Provides GPS coordinates, check-in, and geofencing
 */
class LocationBridge(
    private val activity: MainActivity,
    private val webView: WebView
) {
    private val tag = "LocationBridge"
    private lateinit var locationManager: LocationManager
    private lateinit var apiClient: ApiClient
    private val gson = Gson()
    private var isTracking = false
    private var trackingSessionId: String? = null

    init {
        locationManager = LocationManager(activity)
        apiClient = ApiClient(activity)
    }

    fun getCurrentLocation(): String {
        Log.d(tag, "Getting current location")

        var result: String? = null
        var completed = false

        locationManager.getCurrentLocation { locationData ->
            if (locationData != null) {
                // Reverse geocode if address is not available
                if (locationData.address == null) {
                    locationManager.reverseGeocode(locationData.latitude, locationData.longitude) { address ->
                        val data = locationData.copy(address = address)
                        result = data.toJson()
                        completed = true
                    }
                } else {
                    result = locationData.toJson()
                    completed = true
                }
            } else {
                result = """{"error": "LOCATION_UNAVAILABLE"}"""
                completed = true
            }
        }

        // Wait for result (with timeout)
        var attempts = 0
        while (!completed && attempts < 50) {
            Thread.sleep(100)
            attempts++
        }

        return result ?: """{"error": "TIMEOUT"}"""
    }

    fun startTracking(intervalSeconds: Int) {
        Log.d(tag, "Starting location tracking with interval: $intervalSeconds seconds")

        if (isTracking) {
            Log.w(tag, "Tracking already in progress")
            return
        }

        // Request permissions
        val permissions = arrayOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        activity.requestPermissions(permissions)

        // Generate tracking session ID
        trackingSessionId = UUID.randomUUID().toString()

        locationManager.startTracking(intervalSeconds) { locationData ->
            // Send location update to backend
            logLocationToBackend(
                leadId = null,
                locationData = locationData,
                locationType = "tracking",
                notes = null
            )

            // Send event to JavaScript
            sendLocationEventToJS("LOCATION_UPDATE", locationData)
        }

        isTracking = true
    }

    fun stopTracking() {
        Log.d(tag, "Stopping location tracking")

        if (!isTracking) {
            Log.w(tag, "Tracking not in progress")
            return
        }

        locationManager.stopTracking()
        isTracking = false
        trackingSessionId = null
    }

    private fun logLocationToBackend(
        leadId: String?,
        locationData: LocationManager.LocationData,
        locationType: String,
        notes: String?
    ) {
        val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }

        apiClient.logLocation(
            leadId = leadId,
            latitude = locationData.latitude,
            longitude = locationData.longitude,
            accuracy = locationData.accuracy,
            address = locationData.address,
            locationType = locationType,
            trackingSessionId = trackingSessionId,
            notes = notes,
            authToken = null, // TODO: Get auth token from WebView
            callback = { success, error ->
                if (success) {
                    Log.d(tag, "Location logged successfully")
                } else {
                    Log.e(tag, "Failed to log location: $error")
                }
            }
        )
    }

    private fun sendLocationEventToJS(eventType: String, locationData: LocationManager.LocationData) {
        val eventData = mapOf(
            "type" to eventType,
            "data" to mapOf(
                "latitude" to locationData.latitude,
                "longitude" to locationData.longitude,
                "accuracy" to locationData.accuracy,
                "timestamp" to locationData.timestamp,
                "address" to (locationData.address ?: "")
            )
        )
        sendEventToJS(eventType, eventData["data"] as Map<String, Any>)
    }

    private fun sendEventToJS(eventType: String, data: Map<String, Any>) {
        val eventData = mapOf(
            "type" to eventType,
            "data" to data
        )
        val json = gson.toJson(eventData)
        val script = "if (window.onNativeEvent) { window.onNativeEvent($json); }"

        activity.runOnUiThread {
            webView.evaluateJavascript(script, null)
        }
    }

    private fun sendErrorToJS(message: String) {
        sendEventToJS("LOCATION_ERROR", mapOf("error" to message))
    }

    fun onPermissionGranted(permission: String) {
        Log.d(tag, "Permission granted: $permission")

        when (permission) {
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION -> {
                // Permissions granted, can now track location
                if (isTracking && !locationManager.isTracking()) {
                    // Restart tracking if it was requested but failed due to permissions
                    startTracking(60) // Default 60 seconds
                }
            }
        }
    }

    fun onPermissionDenied(permission: String) {
        Log.d(tag, "Permission denied: $permission")
        sendErrorToJS("Permission denied: $permission")
    }
}
