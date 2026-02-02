package com.neesac.bharatcrm

import android.content.Context
import android.util.Log

/**
 * Stores device enrollment credentials for device-key auth uploads.
 *
 * These should persist even if user logs out in the WebView.
 */
class DeviceEnrollmentStore(private val context: Context) {
    private val tag = "DeviceEnrollmentStore"
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun setEnrollment(deviceId: String, deviceKey: String, assignedUserName: String? = null, assignedUserEmail: String? = null) {
        if (deviceId.isBlank() || deviceKey.isBlank()) {
            clear()
            return
        }
        prefs.edit()
            .putString(KEY_DEVICE_ID, deviceId)
            .putString(KEY_DEVICE_KEY, deviceKey)
            .putString(KEY_ASSIGNED_USER_NAME, assignedUserName)
            .putString(KEY_ASSIGNED_USER_EMAIL, assignedUserEmail)
            .apply()
        Log.d(tag, "Enrollment stored (deviceId=$deviceId)")
    }

    fun clear() {
        prefs.edit()
            .remove(KEY_DEVICE_ID)
            .remove(KEY_DEVICE_KEY)
            .remove(KEY_ASSIGNED_USER_NAME)
            .remove(KEY_ASSIGNED_USER_EMAIL)
            .apply()
        Log.d(tag, "Enrollment cleared")
    }

    fun getDeviceId(): String? = prefs.getString(KEY_DEVICE_ID, null)
    fun getDeviceKey(): String? = prefs.getString(KEY_DEVICE_KEY, null)
    fun getAssignedUserName(): String? = prefs.getString(KEY_ASSIGNED_USER_NAME, null)
    fun getAssignedUserEmail(): String? = prefs.getString(KEY_ASSIGNED_USER_EMAIL, null)

    fun isEnrolled(): Boolean = !getDeviceId().isNullOrBlank() && !getDeviceKey().isNullOrBlank()

    companion object {
        private const val PREFS_NAME = "bharatcrm_prefs"
        private const val KEY_DEVICE_ID = "device_enrollment_id"
        private const val KEY_DEVICE_KEY = "device_enrollment_key"
        private const val KEY_ASSIGNED_USER_NAME = "device_enrollment_assigned_user_name"
        private const val KEY_ASSIGNED_USER_EMAIL = "device_enrollment_assigned_user_email"
    }
}

