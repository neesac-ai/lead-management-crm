package com.neesac.bharatcrm

import android.Manifest
import android.content.Context
import android.os.Build
import android.telecom.TelecomManager
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager

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
        val label: String,
        // A set of IDs that might appear in CallLog.Calls.PHONE_ACCOUNT_ID for this SIM.
        // Different OEMs populate this column differently (phoneAccountHandle.id, subscriptionId, slot index, etc).
        val matchIds: List<String> = listOf(id)
    )

    data class ActiveSubscriptionOption(
        val subscriptionId: Int,
        val simSlotIndex: Int,
        val displayName: String?,
        val carrierName: String?
    )

    fun hasPhoneStatePermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun hasCallLogPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_CALL_LOG
        ) == PackageManager.PERMISSION_GRANTED
    }

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

    /**
     * Number of SIM slots / modems the device reports (hardware capability).
     * This does NOT necessarily mean SIMs are inserted/active.
     */
    fun getSimSlotCount(): Int {
        return try {
            val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            // phoneCount exists since API 23; on older versions return 1 as a sane default.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) telephonyManager.phoneCount else 1
        } catch (e: Exception) {
            Log.w(tag, "Failed reading sim slot count", e)
            0
        }
    }

    /**
     * Active SIM subscriptions currently present/enabled on the device.
     * Requires READ_PHONE_STATE on many devices/OEMs.
     */
    fun getActiveSubscriptions(): List<ActiveSubscriptionOption> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP_MR1) return emptyList()
        return try {
            val subscriptionManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
            val list = subscriptionManager.activeSubscriptionInfoList ?: emptyList()
            list.map { info ->
                ActiveSubscriptionOption(
                    subscriptionId = info.subscriptionId,
                    simSlotIndex = info.simSlotIndex,
                    displayName = info.displayName?.toString(),
                    carrierName = info.carrierName?.toString()
                )
            }
        } catch (e: SecurityException) {
            Log.w(tag, "Permission denied while reading active subscriptions", e)
            emptyList()
        } catch (e: Exception) {
            Log.e(tag, "Error reading active subscriptions", e)
            emptyList()
        }
    }

    fun getAvailablePhoneAccounts(): List<PhoneAccountOption> {
        val telecomAccounts = try {
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
                    PhoneAccountOption(id = handle.id, label = label, matchIds = listOf(handle.id))
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

        if (telecomAccounts.isNotEmpty()) {
            return telecomAccounts
        }

        // Fallback: derive SIM options from active subscriptions when Telecom doesn't expose phone accounts.
        // This enables showing SIM options in UI even on OEMs where phone accounts are hidden.
        val subs = getActiveSubscriptions()
        if (subs.isEmpty()) {
            return emptyList()
        }

        return subs
            .sortedBy { it.simSlotIndex }
            .map { sub ->
                val slotHuman = if (sub.simSlotIndex >= 0) (sub.simSlotIndex + 1) else null
                val baseLabel = listOfNotNull(
                    sub.carrierName?.takeIf { it.isNotBlank() },
                    sub.displayName?.takeIf { it.isNotBlank() }
                ).firstOrNull() ?: "SIM"
                val label = if (slotHuman != null) "SIM $slotHuman - $baseLabel" else baseLabel

                val matchIds = mutableSetOf<String>()
                matchIds.add(sub.subscriptionId.toString())
                if (sub.simSlotIndex >= 0) matchIds.add(sub.simSlotIndex.toString())

                // Use subscriptionId as stable id for UI selection.
                PhoneAccountOption(
                    id = sub.subscriptionId.toString(),
                    label = label,
                    matchIds = matchIds.toList()
                )
            }
    }

    fun getSyncIntervalMinutes(): Int {
        val v = prefs.getInt(KEY_SYNC_INTERVAL_MINUTES, DEFAULT_SYNC_INTERVAL_MINUTES)
        return if (VALID_SYNC_INTERVALS.contains(v)) v else DEFAULT_SYNC_INTERVAL_MINUTES
    }

    fun setSyncIntervalMinutes(minutes: Int) {
        val v = if (VALID_SYNC_INTERVALS.contains(minutes)) minutes else DEFAULT_SYNC_INTERVAL_MINUTES
        prefs.edit().putInt(KEY_SYNC_INTERVAL_MINUTES, v).apply()
    }

    fun isAutoSyncEnabled(): Boolean {
        return prefs.getBoolean(KEY_AUTO_SYNC_ENABLED, true)
    }

    fun setAutoSyncEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_AUTO_SYNC_ENABLED, enabled).apply()
    }

    fun setForceFullSyncOnce() {
        prefs.edit().putBoolean(KEY_FORCE_FULL_SYNC_ONCE, true).apply()
    }

    fun consumeForceFullSyncOnce(): Boolean {
        val v = prefs.getBoolean(KEY_FORCE_FULL_SYNC_ONCE, false)
        if (v) prefs.edit().putBoolean(KEY_FORCE_FULL_SYNC_ONCE, false).apply()
        return v
    }

    companion object {
        private const val PREFS_NAME = "bharatcrm_prefs"
        private const val KEY_ENABLED = "call_tracking_enabled"
        private const val KEY_ALLOWED_PHONE_ACCOUNT_IDS = "call_tracking_allowed_phone_account_ids"
        private const val KEY_SYNC_INTERVAL_MINUTES = "call_tracking_sync_interval_minutes"
        private const val KEY_AUTO_SYNC_ENABLED = "call_tracking_auto_sync_enabled"
        private const val KEY_FORCE_FULL_SYNC_ONCE = "call_tracking_force_full_sync_once"
        private const val DEFAULT_SYNC_INTERVAL_MINUTES = 15
        private val VALID_SYNC_INTERVALS = setOf(5, 10, 15, 30, 60)
    }
}

