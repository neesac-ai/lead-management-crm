package com.neesac.bharatcrm

import android.content.Context
import android.database.Cursor
import android.provider.CallLog
import android.util.Log
import java.text.SimpleDateFormat
import java.util.*

/**
 * Reads call logs from device
 * Provides exact call duration and status
 */
class CallLogReader(private val context: Context) {
    private val tag = "CallLogReader"

    data class DeviceCallLogEntry(
        val id: Long,
        val phoneNumber: String,
        val callType: Int, // CallLog.Calls.INCOMING_TYPE, OUTGOING_TYPE, MISSED_TYPE, etc.
        val duration: Long, // Duration in seconds
        val date: Long, // Timestamp in milliseconds (start time)
        val name: String?, // Contact name if available
        val phoneAccountId: String? // SIM / phone-account identifier (dual SIM)
    ) {
        fun getCallTypeString(): String {
            return when (callType) {
                CallLog.Calls.INCOMING_TYPE -> "incoming"
                CallLog.Calls.OUTGOING_TYPE -> "outgoing"
                CallLog.Calls.MISSED_TYPE -> "missed"
                CallLog.Calls.REJECTED_TYPE -> "rejected"
                CallLog.Calls.BLOCKED_TYPE -> "blocked"
                else -> "unknown"
            }
        }
    }

    fun getCallLogs(phoneNumber: String?, limit: Int): List<CallLogEntry> {
        Log.d(tag, "Reading call logs for: $phoneNumber, limit: $limit")

        val callLogs = mutableListOf<CallLogEntry>()
        var cursor: Cursor? = null

        try {
            // Build query
            val projection = arrayOf(
                CallLog.Calls.NUMBER,
                CallLog.Calls.TYPE,
                CallLog.Calls.DURATION,
                CallLog.Calls.DATE,
                CallLog.Calls.CACHED_NAME,
                CallLog.Calls.CACHED_NUMBER_TYPE,
                CallLog.Calls.CACHED_NUMBER_LABEL
            )

            val selection = if (phoneNumber != null) {
                "${CallLog.Calls.NUMBER} = ?"
            } else {
                null
            }

            val selectionArgs = if (phoneNumber != null) {
                arrayOf(phoneNumber)
            } else {
                null
            }

            // IMPORTANT: Many OEM call log providers do NOT support "LIMIT" in sortOrder.
            // Using it can return 0 rows or throw on some devices.
            // We'll sort by DATE and apply limit in code.
            val sortOrder = "${CallLog.Calls.DATE} DESC"

            // Query call log
            cursor = context.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                projection,
                selection,
                selectionArgs,
                sortOrder
            )

            cursor?.let {
                val numberIndex = it.getColumnIndex(CallLog.Calls.NUMBER)
                val typeIndex = it.getColumnIndex(CallLog.Calls.TYPE)
                val durationIndex = it.getColumnIndex(CallLog.Calls.DURATION)
                val dateIndex = it.getColumnIndex(CallLog.Calls.DATE)
                val nameIndex = it.getColumnIndex(CallLog.Calls.CACHED_NAME)

                while (it.moveToNext() && callLogs.size < limit) {
                    val number = it.getString(numberIndex) ?: ""
                    val type = it.getInt(typeIndex)
                    val duration = it.getLong(durationIndex)
                    val date = it.getLong(dateIndex)
                    val name = it.getString(nameIndex)

                    callLogs.add(
                        CallLogEntry(
                            phoneNumber = number,
                            callType = type,
                            duration = duration,
                            date = date,
                            name = name
                        )
                    )
                }
            }

            Log.d(tag, "Found ${callLogs.size} call log entries")
        } catch (e: SecurityException) {
            Log.e(tag, "Permission denied: READ_CALL_LOG", e)
        } catch (e: Exception) {
            Log.e(tag, "Error reading call logs", e)
        } finally {
            cursor?.close()
        }

        return callLogs
    }

    /**
     * Get device call logs since a timestamp (exclusive).
     *
     * NOTE: We do not rely on provider-specific LIMIT syntax; we apply limits in code.
     */
    fun getDeviceCallLogsSince(
        sinceTimestampMsExclusive: Long,
        limit: Int,
        allowedPhoneAccountIds: Set<String>?
    ): List<DeviceCallLogEntry> {
        val allowed = allowedPhoneAccountIds?.takeIf { it.isNotEmpty() }
        val logs = mutableListOf<DeviceCallLogEntry>()
        var cursor: Cursor? = null

        try {
            val projection = arrayOf(
                CallLog.Calls._ID,
                CallLog.Calls.NUMBER,
                CallLog.Calls.TYPE,
                CallLog.Calls.DURATION,
                CallLog.Calls.DATE,
                CallLog.Calls.CACHED_NAME,
                // For dual SIM filtering (may be null / missing on some OEMs)
                CallLog.Calls.PHONE_ACCOUNT_ID
            )

            val selection = "${CallLog.Calls.DATE} > ?"
            val selectionArgs = arrayOf(sinceTimestampMsExclusive.toString())
            val sortOrder = "${CallLog.Calls.DATE} ASC"

            cursor = context.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                projection,
                selection,
                selectionArgs,
                sortOrder
            )

            cursor?.let {
                val idIndex = it.getColumnIndex(CallLog.Calls._ID)
                val numberIndex = it.getColumnIndex(CallLog.Calls.NUMBER)
                val typeIndex = it.getColumnIndex(CallLog.Calls.TYPE)
                val durationIndex = it.getColumnIndex(CallLog.Calls.DURATION)
                val dateIndex = it.getColumnIndex(CallLog.Calls.DATE)
                val nameIndex = it.getColumnIndex(CallLog.Calls.CACHED_NAME)
                val phoneAccountIdIndex = it.getColumnIndex(CallLog.Calls.PHONE_ACCOUNT_ID)

                while (it.moveToNext() && logs.size < limit) {
                    val id = if (idIndex >= 0) it.getLong(idIndex) else 0L
                    val number = if (numberIndex >= 0) it.getString(numberIndex) ?: "" else ""
                    val type = if (typeIndex >= 0) it.getInt(typeIndex) else 0
                    val duration = if (durationIndex >= 0) it.getLong(durationIndex) else 0L
                    val date = if (dateIndex >= 0) it.getLong(dateIndex) else 0L
                    val name = if (nameIndex >= 0) it.getString(nameIndex) else null
                    val phoneAccountId =
                        if (phoneAccountIdIndex >= 0) it.getString(phoneAccountIdIndex) else null

                    // Filter by SIM selection if we have phoneAccountId and allowed set.
                    if (allowed != null) {
                        // If provider doesn't populate phoneAccountId, we can't reliably map it to SIM.
                        // Conservative behavior:
                        // - If user allowed BOTH SIMs, accept rows without phoneAccountId.
                        // - If user allowed a single SIM, skip rows without phoneAccountId (can't prove which SIM).
                        if (phoneAccountId.isNullOrBlank()) {
                            if (allowed.size <= 1) continue
                        } else if (!allowed.contains(phoneAccountId)) {
                            continue
                        }
                    }

                    logs.add(
                        DeviceCallLogEntry(
                            id = id,
                            phoneNumber = number,
                            callType = type,
                            duration = duration,
                            date = date,
                            name = name,
                            phoneAccountId = phoneAccountId
                        )
                    )
                }
            }
        } catch (e: SecurityException) {
            Log.e(tag, "Permission denied: READ_CALL_LOG", e)
        } catch (e: Exception) {
            Log.e(tag, "Error reading device call logs", e)
        } finally {
            cursor?.close()
        }

        return logs
    }

    fun getLastCallForNumber(phoneNumber: String): CallLogEntry? {
        val logs = getCallLogs(phoneNumber, 1)
        return logs.firstOrNull()
    }

    data class CallLogEntry(
        val phoneNumber: String,
        val callType: Int, // CallLog.Calls.INCOMING_TYPE, OUTGOING_TYPE, MISSED_TYPE
        val duration: Long, // Duration in seconds
        val date: Long, // Timestamp in milliseconds
        val name: String? // Contact name if available
    ) {
        fun getCallTypeString(): String {
            return when (callType) {
                CallLog.Calls.INCOMING_TYPE -> "incoming"
                CallLog.Calls.OUTGOING_TYPE -> "outgoing"
                CallLog.Calls.MISSED_TYPE -> "missed"
                CallLog.Calls.REJECTED_TYPE -> "rejected"
                CallLog.Calls.BLOCKED_TYPE -> "blocked"
                else -> "unknown"
            }
        }

        fun toJson(): String {
            val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
            dateFormat.timeZone = TimeZone.getTimeZone("UTC")
            return """
                {
                    "phoneNumber": "${phoneNumber.replace("\"", "\\\"")}",
                    "callType": "${getCallTypeString()}",
                    "duration": $duration,
                    "date": "${dateFormat.format(Date(date))}",
                    "timestamp": $date,
                    "name": ${if (name != null) "\"${name.replace("\"", "\\\"")}\"" else "null"}
                }
            """.trimIndent()
        }
    }
}

