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

            val sortOrder = "${CallLog.Calls.DATE} DESC LIMIT $limit"

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

                while (it.moveToNext()) {
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

