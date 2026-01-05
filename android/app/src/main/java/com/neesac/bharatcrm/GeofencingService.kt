package com.neesac.bharatcrm

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.ActivityCompat
import com.google.android.gms.location.*
import java.util.*

/**
 * Manages geofencing
 * Creates geofences around customer locations and handles enter/exit events
 */
class GeofencingService(private val context: Context) {
    private val tag = "GeofencingService"
    private val geofencingClient: GeofencingClient = LocationServices.getGeofencingClient(context)
    private val geofences = mutableMapOf<String, GeofenceData>()

    private val geofencePendingIntent: PendingIntent by lazy {
        val intent = Intent(context, GeofenceBroadcastReceiver::class.java)
        PendingIntent.getBroadcast(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    fun addGeofence(
        geofenceId: String,
        leadId: String,
        latitude: Double,
        longitude: Double,
        radius: Double,
        autoCheckIn: Boolean = true,
        callback: (Boolean, String?) -> Unit
    ) {
        Log.d(tag, "Adding geofence: $geofenceId for lead: $leadId at ($latitude, $longitude) radius: $radius")

        val geofence = Geofence.Builder()
            .setRequestId(geofenceId)
            .setCircularRegion(latitude, longitude, radius.toFloat())
            .setExpirationDuration(Geofence.NEVER_EXPIRE)
            .setTransitionTypes(
                Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT
            )
            .setLoiteringDelay(60000) // 1 minute loitering delay
            .build()

        val geofencingRequest = GeofencingRequest.Builder()
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
            .addGeofence(geofence)
            .build()

        // Store geofence data
        geofences[geofenceId] = GeofenceData(
            geofenceId = geofenceId,
            leadId = leadId,
            latitude = latitude,
            longitude = longitude,
            radius = radius,
            autoCheckIn = autoCheckIn
        )

        try {
            geofencingClient.addGeofences(geofencingRequest, geofencePendingIntent)
                .addOnSuccessListener {
                    Log.d(tag, "Geofence added successfully: $geofenceId")
                    callback(true, null)
                }
                .addOnFailureListener { e ->
                    Log.e(tag, "Error adding geofence", e)
                    callback(false, e.message)
                }
        } catch (e: SecurityException) {
            Log.e(tag, "Security exception adding geofence", e)
            callback(false, "Permission denied")
        }
    }

    fun removeGeofence(geofenceId: String, callback: (Boolean, String?) -> Unit) {
        Log.d(tag, "Removing geofence: $geofenceId")

        val geofenceIds = listOf(geofenceId)

        geofencingClient.removeGeofences(geofenceIds)
            .addOnSuccessListener {
                geofences.remove(geofenceId)
                Log.d(tag, "Geofence removed successfully: $geofenceId")
                callback(true, null)
            }
            .addOnFailureListener { e ->
                Log.e(tag, "Error removing geofence", e)
                callback(false, e.message)
            }
    }

    fun removeAllGeofences(callback: (Boolean, String?) -> Unit) {
        Log.d(tag, "Removing all geofences")

        val geofenceIds = geofences.keys.toList()
        if (geofenceIds.isEmpty()) {
            callback(true, null)
            return
        }

        geofencingClient.removeGeofences(geofenceIds)
            .addOnSuccessListener {
                geofences.clear()
                Log.d(tag, "All geofences removed successfully")
                callback(true, null)
            }
            .addOnFailureListener { e ->
                Log.e(tag, "Error removing geofences", e)
                callback(false, e.message)
            }
    }

    fun getGeofenceData(geofenceId: String): GeofenceData? {
        return geofences[geofenceId]
    }

    fun getAllGeofences(): List<GeofenceData> {
        return geofences.values.toList()
    }

    data class GeofenceData(
        val geofenceId: String,
        val leadId: String,
        val latitude: Double,
        val longitude: Double,
        val radius: Double,
        val autoCheckIn: Boolean
    )
}

/**
 * Broadcast receiver for geofence events
 */
class GeofenceBroadcastReceiver : android.content.BroadcastReceiver() {
    private val tag = "GeofenceReceiver"

    override fun onReceive(context: Context, intent: Intent) {
        Log.d(tag, "Geofence event received")

        val geofencingEvent = GeofencingEvent.fromIntent(intent)
        if (geofencingEvent?.hasError() == true) {
            Log.e(tag, "Geofencing error: ${geofencingEvent.errorCode}")
            return
        }

        val transitionType = geofencingEvent?.geofenceTransition
        val triggeringGeofences = geofencingEvent?.triggeringGeofences

        when (transitionType) {
            Geofence.GEOFENCE_TRANSITION_ENTER -> {
                Log.d(tag, "Entered geofence")
                triggeringGeofences?.forEach { geofence ->
                    handleGeofenceEnter(context, geofence.requestId)
                }
            }
            Geofence.GEOFENCE_TRANSITION_EXIT -> {
                Log.d(tag, "Exited geofence")
                triggeringGeofences?.forEach { geofence ->
                    handleGeofenceExit(context, geofence.requestId)
                }
            }
            Geofence.GEOFENCE_TRANSITION_DWELL -> {
                Log.d(tag, "Dwelling in geofence")
                triggeringGeofences?.forEach { geofence ->
                    handleGeofenceDwell(context, geofence.requestId)
                }
            }
        }
    }

    private fun handleGeofenceEnter(context: Context, geofenceId: String) {
        // Get geofence data and trigger check-in if auto check-in is enabled
        val geofencingService = GeofencingService(context)
        val geofenceData = geofencingService.getGeofenceData(geofenceId)

        if (geofenceData != null && geofenceData.autoCheckIn) {
            // Trigger automatic check-in
            Log.d(tag, "Auto check-in triggered for lead: ${geofenceData.leadId}")
            // This will be handled by LocationBridge
            sendGeofenceEvent(context, "GEOFENCE_ENTER", geofenceData)
        }
    }

    private fun handleGeofenceExit(context: Context, geofenceId: String) {
        val geofencingService = GeofencingService(context)
        val geofenceData = geofencingService.getGeofenceData(geofenceId)

        if (geofenceData != null) {
            sendGeofenceEvent(context, "GEOFENCE_EXIT", geofenceData)
        }
    }

    private fun handleGeofenceDwell(context: Context, geofenceId: String) {
        val geofencingService = GeofencingService(context)
        val geofenceData = geofencingService.getGeofenceData(geofenceId)

        if (geofenceData != null && geofenceData.autoCheckIn) {
            Log.d(tag, "Auto check-in triggered (dwell) for lead: ${geofenceData.leadId}")
            sendGeofenceEvent(context, "GEOFENCE_DWELL", geofenceData)
        }
    }

    private fun sendGeofenceEvent(context: Context, eventType: String, geofenceData: GeofencingService.GeofenceData) {
        // Send event to JavaScript via WebView
        // This will be handled by MainActivity or LocationBridge
        val intent = Intent("com.neesac.bharatcrm.GEOFENCE_EVENT").apply {
            putExtra("eventType", eventType)
            putExtra("geofenceId", geofenceData.geofenceId)
            putExtra("leadId", geofenceData.leadId)
            putExtra("latitude", geofenceData.latitude)
            putExtra("longitude", geofenceData.longitude)
        }
        context.sendBroadcast(intent)
    }
}


