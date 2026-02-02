package com.neesac.bharatcrm

import android.content.Context
import android.util.Log

/**
 * Stores Supabase session tokens for native background sync.
 *
 * Tokens are provided by the WebView (PWA) via NativeBridge.setAuthTokens().
 *
 * NOTE: For stronger security, migrate to EncryptedSharedPreferences.
 */
class AuthTokenStore(private val context: Context) {
    private val tag = "AuthTokenStore"
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun setTokens(accessToken: String, refreshToken: String, expiresAtEpochSeconds: Long) {
        if (accessToken.isBlank() || refreshToken.isBlank() || expiresAtEpochSeconds <= 0) {
            // Treat invalid as "clear"
            clear()
            return
        }
        prefs.edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_REFRESH_TOKEN, refreshToken)
            .putLong(KEY_EXPIRES_AT, expiresAtEpochSeconds)
            .apply()
        Log.d(tag, "Tokens stored (expiresAt=$expiresAtEpochSeconds)")
    }

    fun clear() {
        prefs.edit()
            .remove(KEY_ACCESS_TOKEN)
            .remove(KEY_REFRESH_TOKEN)
            .remove(KEY_EXPIRES_AT)
            .apply()
        Log.d(tag, "Tokens cleared")
    }

    fun getAccessToken(): String? = prefs.getString(KEY_ACCESS_TOKEN, null)
    fun getRefreshToken(): String? = prefs.getString(KEY_REFRESH_TOKEN, null)
    fun getExpiresAtEpochSeconds(): Long = prefs.getLong(KEY_EXPIRES_AT, 0L)

    fun isAccessTokenValid(nowEpochSeconds: Long = System.currentTimeMillis() / 1000L): Boolean {
        val exp = getExpiresAtEpochSeconds()
        // Consider token invalid if exp is within the next minute.
        return exp > (nowEpochSeconds + 60L) && !getAccessToken().isNullOrBlank()
    }

    companion object {
        private const val PREFS_NAME = "bharatcrm_prefs"
        private const val KEY_ACCESS_TOKEN = "supabase_access_token"
        private const val KEY_REFRESH_TOKEN = "supabase_refresh_token"
        private const val KEY_EXPIRES_AT = "supabase_expires_at"
    }
}

