package com.neesac.bharatcrm

import android.content.Context
import android.os.Build
import android.telecom.TelecomManager
import android.util.Log

/**
 * Stores which SIM(s) the user has allowed call tracking for.
 *
 * We identify SIMs via Telecom "phone accounts" (PhoneAccountHandle.id), which is what CallLog
 * commonly stores in the PHONE_ACCOUNT_ID column on dual-SIM devices.
 */
class SimSelectionManager(private val context: Context) {
    private val tag = "SimSelectionManager"
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    data class PhoneAccountOption(
        val id: String,
        val label: String
    )

    fun isConfigured(): Boolean {
        return prefs.contains(KEY_ENABLED) && prefs.contains(KEY_ALLOWED_PHONE_ACCOUNT_IDS)
    }

    fun isEnabled(): Boolean {
        return prefs.getBoolean(KEY_ENABLED, false)
    }

    fun setEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    fun getAllowedPhoneAccountIds(): Set<String> {
        return prefs.getStringSet(KEY_ALLOWED_PHONE_ACCOUNT_IDS, emptySet()) ?: emptySet()
    }

    fun setAllowedPhoneAccountIds(ids: Set<String>) {
        prefs.edit().putStringSet(KEY_ALLOWED_PHONE_ACCOUNT_IDS, ids).apply()
    }

    fun getAvailablePhoneAccounts(): List<PhoneAccountOption> {
        return try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            val handles = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                telecomManager.callCapablePhoneAccounts
            } else {
                emptyList()
            }

            handles.mapNotNull { handle ->
                try {
                    val account = telecomManager.getPhoneAccount(handle)
                    val label = account?.label?.toString()?.takeIf { it.isNotBlank() }
                        ?: "SIM"
                    PhoneAccountOption(id = handle.id, label = label)
                } catch (e: Exception) {
                    Log.w(tag, "Failed reading phone account for handle=${handle.id}", e)
                    null
                }
            }
        } catch (e: SecurityException) {
            // Some OEMs require READ_PHONE_STATE to enumerate phone accounts.
            Log.w(tag, "Permission denied while enumerating phone accounts", e)
            emptyList()
        } catch (e: Exception) {
            Log.e(tag, "Error enumerating phone accounts", e)
            emptyList()
        }
    }

    companion object {
        private const val PREFS_NAME = "bharatcrm_prefs"
        private const val KEY_ENABLED = "call_tracking_enabled"
        private const val KEY_ALLOWED_PHONE_ACCOUNT_IDS = "call_tracking_allowed_phone_account_ids"
    }
}

