package com.neesac.bharatcrm

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Address
import android.location.Geocoder
import android.location.Location
import android.util.Log
import androidx.core.app.ActivityCompat
import com.google.android.gms.location.*
import java.util.*

/**
 * Manages location tracking
 * Handles GPS, check-in, and geofencing
 */
class LocationManager(private val context: Context) {
    private val tag = "LocationManager"
    private var isTracking = false
    private var trackingInterval: Long = 60000 // Default 1 minute

    private val fusedLocationClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    private var locationCallback: LocationCallback? = null
    private var locationRequest: LocationRequest? = null

    private val geocoder: Geocoder = Geocoder(context, Locale.getDefault())

    fun getCurrentLocation(callback: (LocationData?) -> Unit) {
        Log.d(tag, "Getting current location")

        if (!hasLocationPermission()) {
            Log.w(tag, "Location permission not granted")
            callback(null)
            return
        }

        try {
            fusedLocationClient.lastLocation.addOnSuccessListener { location ->
                if (location != null) {
                    val locationData = LocationData(
                        latitude = location.latitude,
                        longitude = location.longitude,
                        accuracy = location.accuracy,
                        timestamp = location.time,
                        address = null // Will be filled by reverse geocoding if needed
                    )
                    Log.d(tag, "Got location: ${location.latitude}, ${location.longitude}")
                    callback(locationData)
                } else {
                    Log.w(tag, "Last location is null, requesting new location")
                    requestNewLocation(callback)
                }
            }.addOnFailureListener { e ->
                Log.e(tag, "Error getting last location", e)
                requestNewLocation(callback)
            }
        } catch (e: SecurityException) {
            Log.e(tag, "Security exception getting location", e)
            callback(null)
        }
    }

    private fun requestNewLocation(callback: (LocationData?) -> Unit) {
        if (!hasLocationPermission()) {
            callback(null)
            return
        }

        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10000)
            .setMaxUpdateDelayMillis(5000)
            .build()

        val locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                fusedLocationClient.removeLocationUpdates(this)
                val location = result.lastLocation
                if (location != null) {
                    val locationData = LocationData(
                        latitude = location.latitude,
                        longitude = location.longitude,
                        accuracy = location.accuracy,
                        timestamp = location.time
                    )
                    callback(locationData)
                } else {
                    callback(null)
                }
            }
        }

        try {
            fusedLocationClient.requestLocationUpdates(
                request,
                locationCallback,
                context.mainLooper
            )
        } catch (e: SecurityException) {
            Log.e(tag, "Security exception requesting location", e)
            callback(null)
        }
    }

    fun startTracking(intervalSeconds: Int, onLocationUpdate: (LocationData) -> Unit) {
        Log.d(tag, "Starting continuous tracking with interval: $intervalSeconds seconds")

        if (isTracking) {
            Log.w(tag, "Tracking already in progress")
            return
        }

        if (!hasLocationPermission()) {
            Log.w(tag, "Location permission not granted")
            return
        }

        trackingInterval = (intervalSeconds * 1000).toLong()

        locationRequest = LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, trackingInterval)
            .setMaxUpdateDelayMillis(trackingInterval * 2)
            .setMinUpdateIntervalMillis(trackingInterval)
            .build()

        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val location = result.lastLocation
                if (location != null) {
                    val locationData = LocationData(
                        latitude = location.latitude,
                        longitude = location.longitude,
                        accuracy = location.accuracy,
                        timestamp = location.time
                    )
                    onLocationUpdate(locationData)
                }
            }
        }

        try {
            fusedLocationClient.requestLocationUpdates(
                locationRequest!!,
                locationCallback!!,
                context.mainLooper
            )
            isTracking = true
            Log.d(tag, "Location tracking started")
        } catch (e: SecurityException) {
            Log.e(tag, "Security exception starting tracking", e)
        }
    }

    fun stopTracking() {
        Log.d(tag, "Stopping tracking")

        if (!isTracking) {
            Log.w(tag, "Tracking not in progress")
            return
        }

        locationCallback?.let {
            fusedLocationClient.removeLocationUpdates(it)
        }
        locationCallback = null
        locationRequest = null
        isTracking = false
        Log.d(tag, "Location tracking stopped")
    }

    fun reverseGeocode(latitude: Double, longitude: Double, callback: (String?) -> Unit) {
        Log.d(tag, "Reverse geocoding: $latitude, $longitude")

        try {
            val addresses = geocoder.getFromLocation(latitude, longitude, 1)
            if (addresses != null && addresses.isNotEmpty()) {
                val address = addresses[0]
                val addressString = buildAddressString(address)
                Log.d(tag, "Address: $addressString")
                callback(addressString)
            } else {
                Log.w(tag, "No address found")
                callback(null)
            }
        } catch (e: Exception) {
            Log.e(tag, "Error reverse geocoding", e)
            callback(null)
        }
    }

    private fun buildAddressString(address: Address): String {
        val parts = mutableListOf<String>()

        address.getAddressLine(0)?.let { parts.add(it) }
        address.locality?.let { if (!parts.contains(it)) parts.add(it) }
        address.adminArea?.let { if (!parts.contains(it)) parts.add(it) }
        address.postalCode?.let { if (!parts.contains(it)) parts.add(it) }
        address.countryName?.let { if (!parts.contains(it)) parts.add(it) }

        return parts.joinToString(", ")
    }

    private fun hasLocationPermission(): Boolean {
        return ActivityCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED ||
        ActivityCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun isTracking(): Boolean {
        return isTracking
    }

    data class LocationData(
        val latitude: Double,
        val longitude: Double,
        val accuracy: Float,
        val timestamp: Long,
        val address: String? = null
    ) {
        fun toJson(): String {
            return """
                {
                    "latitude": $latitude,
                    "longitude": $longitude,
                    "accuracy": $accuracy,
                    "timestamp": $timestamp,
                    "address": ${if (address != null) "\"${address.replace("\"", "\\\"")}\"" else "null"}
                }
            """.trimIndent()
        }
    }
}
