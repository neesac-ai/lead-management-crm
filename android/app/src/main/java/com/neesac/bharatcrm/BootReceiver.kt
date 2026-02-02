package com.neesac.bharatcrm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Restarts call tracking foreground sync after device reboot (if enabled).
 */
class BootReceiver : BroadcastReceiver() {
    private val tag = "BootReceiver"

    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_LOCKED_BOOT_COMPLETED) return

        try {
            val simSelectionManager = SimSelectionManager(context)
            if (!simSelectionManager.isEnabled()) return

            val tokenStore = AuthTokenStore(context)
            val hasAnyToken = !tokenStore.getRefreshToken().isNullOrBlank() || !tokenStore.getAccessToken().isNullOrBlank()
            if (!hasAnyToken) return

            CallTrackingSyncService.start(context, "boot")
            Log.d(tag, "Started CallTrackingSyncService on boot")
        } catch (e: Exception) {
            Log.e(tag, "Failed starting on boot", e)
        }
    }
}

