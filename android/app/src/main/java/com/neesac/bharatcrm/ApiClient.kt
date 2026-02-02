package com.neesac.bharatcrm

import android.content.Context
import android.net.Uri
import android.util.Log
import com.google.gson.Gson
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * HTTP client for making API calls to the backend
 */
class ApiClient(private val context: Context) {
    private val tag = "ApiClient"
    private val gson = Gson()
    private val baseUrl: String = resolveBaseUrl(context)

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private fun resolveBaseUrl(context: Context): String {
        // For local testing, use the same origin as the WebView PWA URL.
        // Example pwa_url: http://192.168.x.x:3000 -> baseUrl becomes http://192.168.x.x:3000
        return try {
            val pwaUrl = context.getString(R.string.pwa_url)
            val uri = Uri.parse(pwaUrl)
            val scheme = uri.scheme ?: "https"
            val host = uri.host ?: "bharatcrm.neesac.ai"
            val port = uri.port
            if (port > 0) "$scheme://$host:$port" else "$scheme://$host"
        } catch (e: Exception) {
            Log.w(tag, "Failed to resolve baseUrl from pwa_url, using default", e)
            "https://bharatcrm.neesac.ai"
        }
    }

    /**
     * POST request to log a call
     */
    fun logCall(
        leadId: String?,
        phoneNumber: String,
        callDirection: String,
        callStatus: String,
        callStartedAt: String,
        callEndedAt: String?,
        durationSeconds: Int,
        ringDurationSeconds: Int = 0,
        talkTimeSeconds: Int = 0,
        deviceInfo: Map<String, Any>? = null,
        networkType: String? = null,
        authToken: String? = null,
        callback: (Boolean, String?) -> Unit
    ) {
        val url = "$baseUrl/api/calls/log"

        val requestBody = mapOf(
            "lead_id" to (leadId ?: ""),
            "phone_number" to phoneNumber,
            "call_direction" to callDirection,
            "call_status" to callStatus,
            "call_started_at" to callStartedAt,
            "call_ended_at" to (callEndedAt ?: ""),
            "duration_seconds" to durationSeconds,
            "ring_duration_seconds" to ringDurationSeconds,
            "talk_time_seconds" to talkTimeSeconds,
            "device_info" to (deviceInfo ?: emptyMap<String, Any>()),
            "network_type" to (networkType ?: "")
        )

        val json = gson.toJson(requestBody)
        val mediaType = "application/json; charset=utf-8".toMediaType()
        val body = json.toRequestBody(mediaType)

        val requestBuilder = Request.Builder()
            .url(url)
            .post(body)
            .addHeader("Content-Type", "application/json")

        authToken?.let {
            requestBuilder.addHeader("Authorization", "Bearer $it")
        }

        val request = requestBuilder.build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e(tag, "Failed to log call", e)
                callback(false, e.message)
            }

            override fun onResponse(call: Call, response: Response) {
                val responseBody = response.body?.string()
                if (response.isSuccessful) {
                    Log.d(tag, "Call logged successfully: $responseBody")
                    callback(true, null)
                } else {
                    Log.e(tag, "Failed to log call: ${response.code} - $responseBody")
                    callback(false, responseBody)
                }
            }
        })
    }

    /**
     * POST /api/calls/log-native (Authorization: Bearer <supabase access token>)
     * Used by native background/foreground sync services (no WebView cookies).
     */
    fun logCallNative(
        leadId: String?,
        phoneNumber: String,
        callDirection: String,
        callStatus: String,
        callStartedAt: String,
        callEndedAt: String?,
        durationSeconds: Int,
        ringDurationSeconds: Int = 0,
        talkTimeSeconds: Int = 0,
        deviceInfo: Map<String, Any>? = null,
        networkType: String? = null,
        accessToken: String,
        callback: (Boolean, String?) -> Unit
    ) {
        val url = "$baseUrl/api/calls/log-native"

        val requestBody = mapOf(
            "lead_id" to (leadId ?: ""),
            "phone_number" to phoneNumber,
            "call_direction" to callDirection,
            "call_status" to callStatus,
            "call_started_at" to callStartedAt,
            "call_ended_at" to (callEndedAt ?: ""),
            "duration_seconds" to durationSeconds,
            "ring_duration_seconds" to ringDurationSeconds,
            "talk_time_seconds" to talkTimeSeconds,
            "device_info" to (deviceInfo ?: emptyMap<String, Any>()),
            "network_type" to (networkType ?: "")
        )

        val json = gson.toJson(requestBody)
        val mediaType = "application/json; charset=utf-8".toMediaType()
        val body = json.toRequestBody(mediaType)

        val request = Request.Builder()
            .url(url)
            .post(body)
            .addHeader("Content-Type", "application/json")
            .addHeader("Authorization", "Bearer $accessToken")
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e(tag, "Failed to log call (native)", e)
                callback(false, e.message)
            }

            override fun onResponse(call: Call, response: Response) {
                val responseBody = response.body?.string()
                if (response.isSuccessful) {
                    Log.d(tag, "Call logged successfully (native): $responseBody")
                    callback(true, null)
                } else {
                    Log.e(tag, "Failed to log call (native): ${response.code} - $responseBody")
                    callback(false, responseBody)
                }
            }
        })
    }

    /**
     * POST /api/calls/log-device (Authorization: Device <device_key>)
     * Used for device-key authenticated background call tracking.
     */
    fun logCallDevice(
        leadId: String?,
        phoneNumber: String,
        callDirection: String,
        callStatus: String,
        callStartedAt: String,
        callEndedAt: String?,
        durationSeconds: Int,
        ringDurationSeconds: Int = 0,
        talkTimeSeconds: Int = 0,
        deviceInfo: Map<String, Any>? = null,
        networkType: String? = null,
        deviceKey: String,
        callback: (Boolean, String?) -> Unit
    ) {
        val url = "$baseUrl/api/calls/log-device"

        val requestBody = mapOf(
            "lead_id" to (leadId ?: ""),
            "phone_number" to phoneNumber,
            "call_direction" to callDirection,
            "call_status" to callStatus,
            "call_started_at" to callStartedAt,
            "call_ended_at" to (callEndedAt ?: ""),
            "duration_seconds" to durationSeconds,
            "ring_duration_seconds" to ringDurationSeconds,
            "talk_time_seconds" to talkTimeSeconds,
            "device_info" to (deviceInfo ?: emptyMap<String, Any>()),
            "network_type" to (networkType ?: "")
        )

        val json = gson.toJson(requestBody)
        val mediaType = "application/json; charset=utf-8".toMediaType()
        val body = json.toRequestBody(mediaType)

        val request = Request.Builder()
            .url(url)
            .post(body)
            .addHeader("Content-Type", "application/json")
            .addHeader("Authorization", "Device $deviceKey")
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e(tag, "Failed to log call (device)", e)
                callback(false, e.message)
            }

            override fun onResponse(call: Call, response: Response) {
                val responseBody = response.body?.string()
                if (response.isSuccessful) {
                    Log.d(tag, "Call logged successfully (device): $responseBody")
                    callback(true, null)
                } else {
                    Log.e(tag, "Failed to log call (device): ${response.code} - $responseBody")
                    callback(false, responseBody)
                }
            }
        })
    }

    /**
     * POST /api/native/auth/refresh
     * Exchanges refresh_token for new access_token for background services.
     */
    fun refreshSupabaseSession(
        refreshToken: String,
        callback: (Boolean, String?, String?, Long?, String?) -> Unit
    ) {
        val url = "$baseUrl/api/native/auth/refresh"

        val requestBody = mapOf(
            "refresh_token" to refreshToken
        )

        val json = gson.toJson(requestBody)
        val mediaType = "application/json; charset=utf-8".toMediaType()
        val body = json.toRequestBody(mediaType)

        val request = Request.Builder()
            .url(url)
            .post(body)
            .addHeader("Content-Type", "application/json")
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e(tag, "Failed to refresh session", e)
                callback(false, null, null, null, e.message)
            }

            override fun onResponse(call: Call, response: Response) {
                val responseBody = response.body?.string()
                if (!response.isSuccessful || responseBody.isNullOrBlank()) {
                    Log.e(tag, "Failed to refresh session: ${response.code} - $responseBody")
                    callback(false, null, null, null, responseBody)
                    return
                }

                try {
                    val parsed = gson.fromJson(responseBody, Map::class.java)
                    val access = parsed["access_token"]?.toString()
                    val refresh = parsed["refresh_token"]?.toString()
                    val expiresAt = (parsed["expires_at"] as? Number)?.toLong()
                    if (access.isNullOrBlank() || refresh.isNullOrBlank() || expiresAt == null) {
                        callback(false, null, null, null, "Invalid refresh response")
                        return
                    }
                    callback(true, access, refresh, expiresAt, null)
                } catch (e: Exception) {
                    Log.e(tag, "Error parsing refresh response", e)
                    callback(false, null, null, null, e.message)
                }
            }
        })
    }

    /**
     * GET request to fetch call logs for a lead
     */
    fun getCallLogs(
        leadId: String,
        authToken: String? = null,
        callback: (Boolean, List<Map<String, Any>>?, String?) -> Unit
    ) {
        val url = "$baseUrl/api/calls/$leadId"

        val requestBuilder = Request.Builder()
            .url(url)
            .get()

        authToken?.let {
            requestBuilder.addHeader("Authorization", "Bearer $it")
        }

        val request = requestBuilder.build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e(tag, "Failed to get call logs", e)
                callback(false, null, e.message)
            }

            override fun onResponse(call: Call, response: Response) {
                val responseBody = response.body?.string()
                if (response.isSuccessful) {
                    try {
                        val json = gson.fromJson(responseBody, Map::class.java)
                        val callLogs = (json["call_logs"] as? List<*>)?.map { it as Map<String, Any> } ?: emptyList()
                        Log.d(tag, "Fetched ${callLogs.size} call logs")
                        callback(true, callLogs, null)
                    } catch (e: Exception) {
                        Log.e(tag, "Error parsing call logs", e)
                        callback(false, null, e.message)
                    }
                } else {
                    Log.e(tag, "Failed to get call logs: ${response.code} - $responseBody")
                    callback(false, null, responseBody)
                }
            }
        })
    }

    /**
     * POST request to log location
     */
    fun logLocation(
        leadId: String?,
        latitude: Double,
        longitude: Double,
        accuracy: Float,
        address: String?,
        locationType: String,
        trackingSessionId: String?,
        notes: String?,
        authToken: String? = null,
        callback: (Boolean, String?) -> Unit
    ) {
        val url = "$baseUrl/api/locations/track"

        val requestBody = mapOf(
            "lead_id" to (leadId ?: ""),
            "latitude" to latitude,
            "longitude" to longitude,
            "accuracy" to accuracy,
            "address" to (address ?: ""),
            "location_type" to locationType,
            "tracking_session_id" to (trackingSessionId ?: ""),
            "notes" to (notes ?: "")
        )

        val json = gson.toJson(requestBody)
        val mediaType = "application/json; charset=utf-8".toMediaType()
        val body = json.toRequestBody(mediaType)

        val requestBuilder = Request.Builder()
            .url(url)
            .post(body)
            .addHeader("Content-Type", "application/json")

        authToken?.let {
            requestBuilder.addHeader("Authorization", "Bearer $it")
        }

        val request = requestBuilder.build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e(tag, "Failed to log location", e)
                callback(false, e.message)
            }

            override fun onResponse(call: Call, response: Response) {
                val responseBody = response.body?.string()
                if (response.isSuccessful) {
                    Log.d(tag, "Location logged successfully: $responseBody")
                    callback(true, null)
                } else {
                    Log.e(tag, "Failed to log location: ${response.code} - $responseBody")
                    callback(false, responseBody)
                }
            }
        })
    }

    /**
     * NOTE: Lead-linked check-in removed (team member tracking only).
     */
}

