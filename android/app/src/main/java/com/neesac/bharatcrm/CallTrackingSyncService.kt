package com.neesac.bharatcrm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.CallLog
import android.telephony.PhoneStateListener
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Foreground service to sync call logs in near real-time even when the app is closed.
 *
 * How it works:
 * - Runs as a foreground service (persistent notification) to survive background limits.
 * - Listens for call state changes; on call end, scans CallLog and uploads new rows.
 * - Also does a periodic scan as a safety net.
 */
class CallTrackingSyncService : Service() {
    private val tag = "CallTrackingSyncService"

    private lateinit var telephonyManager: TelephonyManager
    private var phoneStateListener: PhoneStateListener? = null

    private val simSelectionManager by lazy { SimSelectionManager(this) }
    private val callLogReader by lazy { CallLogReader(this) }
    private val authTokenStore by lazy { AuthTokenStore(this) } // legacy fallback
    private val deviceEnrollmentStore by lazy { DeviceEnrollmentStore(this) }
    private val apiClient by lazy { ApiClient(this) }
    private val prefs by lazy { getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE) }

    private var lastCallState: Int = TelephonyManager.CALL_STATE_IDLE

    private val handler: Handler = Handler(Looper.getMainLooper())
    private val periodicRunnable = object : Runnable {
        override fun run() {
            try {
                if (simSelectionManager.isAutoSyncEnabled()) {
                    syncOnce("periodic")
                }
            } catch (e: Exception) {
                Log.e(tag, "Periodic sync failed", e)
            } finally {
                val intervalMs = simSelectionManager.getSyncIntervalMinutes() * 60L * 1000L
                handler.postDelayed(this, intervalMs)
            }
        }
    }

    private val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    override fun onCreate() {
        super.onCreate()
        telephonyManager = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        try {
            startForeground(NOTIFICATION_ID, buildNotification())
            prefs.edit()
                .putBoolean(KEY_SERVICE_RUNNING, true)
                .putString(KEY_SERVICE_LAST_ERROR, "")
                .apply()
        } catch (e: Exception) {
            Log.e(tag, "startForeground failed", e)
            prefs.edit()
                .putBoolean(KEY_SERVICE_RUNNING, false)
                .putString(KEY_SERVICE_LAST_ERROR, (e.message ?: e.toString()))
                .apply()
            stopSelf()
            return
        }
        registerCallStateListener()
        // Start periodic scan safety net (uses configured interval)
        val intervalMs = simSelectionManager.getSyncIntervalMinutes() * 60L * 1000L
        handler.postDelayed(periodicRunnable, intervalMs)
        Log.d(tag, "Service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Ensure we keep running
        val reason = intent?.getStringExtra(EXTRA_REASON) ?: "start"
        Log.d(tag, "onStartCommand reason=$reason enabled=${simSelectionManager.isEnabled()}")
        prefs.edit()
            .putLong(KEY_SERVICE_LAST_START_AT_MS, System.currentTimeMillis())
            .putString(KEY_SERVICE_LAST_START_REASON, reason)
            .apply()
        // Kick an immediate sync on start
        handler.post { syncOnce("start:$reason") }
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterCallStateListener()
        handler.removeCallbacks(periodicRunnable)
        prefs.edit().putBoolean(KEY_SERVICE_RUNNING, false).apply()
        Log.d(tag, "Service destroyed")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun hasPermissions(): Boolean {
        val hasCallLog = ContextCompat.checkSelfPermission(this, android.Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED
        val hasPhoneState = ContextCompat.checkSelfPermission(this, android.Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
        return hasCallLog && hasPhoneState
    }

    private fun registerCallStateListener() {
        if (phoneStateListener != null) return
        phoneStateListener = object : PhoneStateListener() {
            override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                super.onCallStateChanged(state, phoneNumber)
                // When a call ends (RINGING/OFFHOOK -> IDLE), trigger an immediate sync.
                if (state == TelephonyManager.CALL_STATE_IDLE &&
                    (lastCallState == TelephonyManager.CALL_STATE_RINGING || lastCallState == TelephonyManager.CALL_STATE_OFFHOOK)
                ) {
                    // Give Android a moment to write the CallLog row
                    handler.postDelayed({ syncOnce("call-ended") }, 2000L)
                }
                lastCallState = state
            }
        }

        try {
            telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE)
            Log.d(tag, "PhoneStateListener registered")
        } catch (e: SecurityException) {
            Log.e(tag, "Missing READ_PHONE_STATE permission", e)
        }
    }

    private fun unregisterCallStateListener() {
        phoneStateListener?.let {
            try {
                telephonyManager.listen(it, PhoneStateListener.LISTEN_NONE)
            } catch (e: Exception) {
                Log.e(tag, "Error unregistering listener", e)
            }
        }
        phoneStateListener = null
    }

    private fun setLastError(msg: String) {
        prefs.edit().putString(KEY_SERVICE_LAST_ERROR, msg).apply()
    }

    private fun syncOnce(source: String) {
        if (!simSelectionManager.isEnabled()) {
            Log.d(tag, "Call tracking disabled; stopping service")
            setLastError("")
            stopSelf()
            return
        }
        if (!hasPermissions()) {
            Log.w(tag, "Missing permissions; cannot sync")
            setLastError("Missing Call log / Phone permission. Grant in App settings.")
            return
        }

        val deviceKey = deviceEnrollmentStore.getDeviceKey()
        val useDeviceAuth = !deviceKey.isNullOrBlank()

        if (!useDeviceAuth) {
            Log.w(tag, "No device enrollment key; falling back to token auth (requires login)")
        }

        ensureAccessToken { token ->
            if (!useDeviceAuth && token.isNullOrBlank()) {
                Log.w(tag, "No valid device key or access token; cannot sync")
                setLastError("Enroll this device in Settings (Call tracking) or log in to sync.")
                return@ensureAccessToken
            }

            val allowedPhoneAccountIds = simSelectionManager.getAllowedPhoneAccountIds()
            val forceFull = simSelectionManager.consumeForceFullSyncOnce()
            val storedLastTs = if (forceFull) 0L else prefs.getLong(KEY_LAST_SYNCED_CALLLOG_TS_MS, 0L)
            val minRecentTs = System.currentTimeMillis() - DEFAULT_LOOKBACK_MS
            val lastTs = if (forceFull) {
                0L
            } else {
                // Avoid uploading very old history by default; keep "recent calls" responsive.
                val clamped = if (storedLastTs <= 0L || storedLastTs < minRecentTs) minRecentTs else storedLastTs
                if (clamped != storedLastTs) {
                    prefs.edit().putLong(KEY_LAST_SYNCED_CALLLOG_TS_MS, clamped).apply()
                }
                clamped
            }

            val rows = callLogReader.getDeviceCallLogsSince(
                sinceTimestampMsExclusive = lastTs,
                limit = MAX_ROWS_PER_SCAN,
                allowedPhoneAccountIds = allowedPhoneAccountIds
            )

            if (rows.isEmpty()) {
                Log.d(tag, "No new call log rows (source=$source)")
                if (forceFull) {
                    val recent = callLogReader.getRecentDeviceCallLogs(5)
                    if (recent.isEmpty()) {
                        setLastError("No call log access. Grant Call log permission in App settings and disable battery restriction.")
                    } else {
                        setLastError("No new calls to sync (last sync may be up to date).")
                    }
                } else {
                    setLastError("")
                }
                return@ensureAccessToken
            }

            val maxTs = rows.maxOf { it.date }
            prefs.edit().putLong(KEY_LAST_SYNCED_CALLLOG_TS_MS, maxTs).apply()
            setLastError("") // clear previous error when we have rows to upload

            Log.d(tag, "Syncing ${rows.size} rows (source=$source) lastTs=$lastTs -> $maxTs")

            rows.forEach { row ->
                val type = row.callType
                val direction = when (type) {
                    CallLog.Calls.OUTGOING_TYPE -> "outgoing"
                    else -> "incoming"
                }
                val status = when (type) {
                    CallLog.Calls.MISSED_TYPE -> "missed"
                    CallLog.Calls.REJECTED_TYPE -> "rejected"
                    CallLog.Calls.BLOCKED_TYPE -> "blocked"
                    CallLog.Calls.VOICEMAIL_TYPE -> "voicemail"
                    CallLog.Calls.ANSWERED_EXTERNALLY_TYPE -> "answered_externally"
                    CallLog.Calls.INCOMING_TYPE, CallLog.Calls.OUTGOING_TYPE -> {
                        when {
                            row.duration <= 0L -> "missed"
                            row.duration < 5L -> "failed"
                            else -> "completed"
                        }
                    }
                    else -> "unknown"
                }

                val callStartedAtIso = dateFormat.format(Date(row.date))
                val callEndedAtIso = dateFormat.format(Date(row.date + (row.duration * 1000L)))

                // Build Map<String, Any> explicitly (avoid Kotlin inferring a narrower common supertype).
                val deviceInfo: Map<String, Any> = mutableMapOf<String, Any>().apply {
                    put("device_call_log_id", row.id)
                    if (!row.name.isNullOrBlank()) put("contact_name", row.name!!)
                    if (!row.phoneAccountId.isNullOrBlank()) put("phone_account_id", row.phoneAccountId!!)
                    put("raw_call_type", row.callType)
                    put("source", "android_foreground_service")
                }

                if (useDeviceAuth) {
                    apiClient.logCallDevice(
                        leadId = null,
                        phoneNumber = row.phoneNumber,
                        callDirection = direction,
                        callStatus = status,
                        callStartedAt = callStartedAtIso,
                        callEndedAt = callEndedAtIso,
                        durationSeconds = row.duration.toInt(),
                        ringDurationSeconds = 0,
                        talkTimeSeconds = 0,
                        deviceInfo = deviceInfo,
                        networkType = null,
                        deviceKey = deviceKey!!
                    ) { success, error ->
                        if (!success) {
                            Log.e(tag, "Upload failed (device): $error")
                            setLastError(error?.take(120) ?: "Upload failed. Try re-enrolling device in Settings.")
                        }
                    }
                } else {
                    val accessToken = token
                    if (accessToken.isNullOrBlank()) {
                        Log.w(tag, "No access token available for token upload")
                        setLastError("Session expired. Log in again or enroll device.")
                        return@ensureAccessToken
                    }
                    apiClient.logCallNative(
                        leadId = null,
                        phoneNumber = row.phoneNumber,
                        callDirection = direction,
                        callStatus = status,
                        callStartedAt = callStartedAtIso,
                        callEndedAt = callEndedAtIso,
                        durationSeconds = row.duration.toInt(),
                        ringDurationSeconds = 0,
                        talkTimeSeconds = 0,
                        deviceInfo = deviceInfo,
                        networkType = null,
                        accessToken = accessToken
                    ) { success, error ->
                        if (!success) {
                            Log.e(tag, "Upload failed (token): $error")
                            setLastError(error?.take(120) ?: "Upload failed. Log in again or enroll device.")
                        }
                    }
                }
            }
        }
    }

    private fun ensureAccessToken(callback: (String?) -> Unit) {
        // Fast path: token is valid
        if (authTokenStore.isAccessTokenValid()) {
            callback(authTokenStore.getAccessToken())
            return
        }

        val refresh = authTokenStore.getRefreshToken()
        if (refresh.isNullOrBlank()) {
            callback(null)
            return
        }

        apiClient.refreshSupabaseSession(refresh) { ok, access, newRefresh, expiresAt, err ->
            if (!ok || access.isNullOrBlank() || newRefresh.isNullOrBlank() || expiresAt == null) {
                Log.e(tag, "Token refresh failed: $err")
                callback(null)
                return@refreshSupabaseSession
            }
            authTokenStore.setTokens(access, newRefresh, expiresAt)
            callback(access)
        }
    }

    private fun buildNotification(): Notification {
        ensureChannel()
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("BharatCRM Call Tracking")
            .setContentText("Tracking calls in the background")
            .setSmallIcon(android.R.drawable.stat_sys_phone_call)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val existing = nm.getNotificationChannel(CHANNEL_ID)
        if (existing != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Call tracking",
            NotificationManager.IMPORTANCE_LOW
        )
        nm.createNotificationChannel(channel)
    }

    companion object {
        private const val CHANNEL_ID = "bharatcrm_call_tracking"
        private const val NOTIFICATION_ID = 4201
        private const val EXTRA_REASON = "reason"

        private const val PREFS_NAME = "bharatcrm_prefs"
        private const val KEY_LAST_SYNCED_CALLLOG_TS_MS = "device_calllog_last_synced_ts_ms"
        private const val KEY_SERVICE_RUNNING = "call_tracking_service_running"
        private const val KEY_SERVICE_LAST_ERROR = "call_tracking_service_last_error"
        private const val KEY_SERVICE_LAST_START_AT_MS = "call_tracking_service_last_start_at_ms"
        private const val KEY_SERVICE_LAST_START_REASON = "call_tracking_service_last_start_reason"

        private const val MAX_ROWS_PER_SCAN = 50
        private const val DEFAULT_LOOKBACK_MS = 7L * 24L * 60L * 60L * 1000L // 7 days

        fun start(context: Context, reason: String = "manual") {
            val intent = Intent(context, CallTrackingSyncService::class.java).apply {
                putExtra(EXTRA_REASON, reason)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(context, intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, CallTrackingSyncService::class.java))
        }
    }
}

