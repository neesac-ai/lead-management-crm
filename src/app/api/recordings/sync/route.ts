import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import {
  listRecordingFiles,
  extractPhoneFromFilename,
  extractDateFromFilename,
} from '@/lib/google/drive'
import { refreshAccessToken } from '@/lib/google/oauth'
import type { DriveSyncResult } from '@/types/ai.types'

// Normalize phone number for matching
function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return ''
  // Remove all non-digits except leading +
  const cleaned = phone.replace(/[^\d+]/g, '')
  // Normalize Indian numbers
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    return '+91' + cleaned
  }
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return '+' + cleaned
  }
  if (!cleaned.startsWith('+') && cleaned.length > 10) {
    return '+' + cleaned
  }
  return cleaned
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminSupabase = await createAdminClient()

    // Get current user
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile using admin client
    const { data: user } = await adminSupabase
      .from('users')
      .select('id, org_id, google_access_token, google_refresh_token')
      .eq('auth_id', authUser.id)
      .single()

    if (!user || !user.org_id) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.google_refresh_token) {
      return NextResponse.json(
        { error: 'Google Drive not connected. Please reconnect your Google account in Settings to grant Drive access.' },
        { status: 400 }
      )
    }

    // Refresh access token if needed
    let accessToken = user.google_access_token
    try {
      const newCredentials = await refreshAccessToken(user.google_refresh_token)
      if (newCredentials.access_token) {
        accessToken = newCredentials.access_token
        // Update the stored access token
        await adminSupabase
          .from('users')
          .update({ google_access_token: accessToken })
          .eq('id', user.id)
      }
    } catch (refreshError) {
      console.error('Token refresh error:', refreshError)
      return NextResponse.json(
        { error: 'Google authentication expired. Please reconnect your Google account in Settings.' },
        { status: 401 }
      )
    }

    // Get sync settings
    const { data: syncSettings } = await adminSupabase
      .from('drive_sync_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    // Require user to select folder first
    if (!syncSettings || !syncSettings.folder_id) {
      return NextResponse.json(
        { error: 'Please select a recording folder in Settings first.', not_configured: true },
        { status: 400 }
      )
    }

    const folderId = syncSettings.folder_id

    // Fetch ALL recordings from Drive (no date filter to ensure we get everything)
    const files = await listRecordingFiles(
      accessToken!,
      user.google_refresh_token || undefined,
      folderId,
      undefined // Don't filter by date - fetch all files
    )

    console.log(`Found ${files.length} files in Drive folder`)

    // Get all leads for this org (for phone number matching)
    const { data: leads } = await adminSupabase
      .from('leads')
      .select('id, phone, name')
      .eq('org_id', user.org_id)

    // Create a map of normalized phone numbers to lead IDs
    const phoneToLeadMap = new Map<string, { id: string; name: string }>()
    leads?.forEach(lead => {
      if (lead.phone) {
        const normalized = normalizePhone(lead.phone)
        if (normalized) {
          phoneToLeadMap.set(normalized, { id: lead.id, name: lead.name })
        }
      }
    })

    console.log(`Found ${leads?.length || 0} leads with phone numbers`)

    // Get existing recordings to avoid duplicates (including deleted ones)
    // We check both active and deleted recordings to prevent re-syncing deleted files
    // Note: If is_deleted column doesn't exist yet (migration not applied), query will work without it
    let existingRecordings: Array<{ drive_file_id: string | null; is_deleted?: boolean }> | null = null

    // Try to query with is_deleted column first (if migration is applied)
    // IMPORTANT: Include ALL recordings (even deleted ones) to prevent re-syncing
    // Using adminSupabase (service role) bypasses RLS, so we should get all records
    const { data: recordingsWithDeleted, error: queryError } = await adminSupabase
      .from('call_recordings')
      .select('drive_file_id, is_deleted')
      .eq('org_id', user.org_id)
    // Note: adminSupabase bypasses RLS, so we should get ALL records including deleted ones
    // But if RLS is somehow still filtering, we'll catch it in the else branch

    // If query failed due to missing column, try without is_deleted
    if (queryError && queryError.message?.includes('is_deleted')) {
      const { data: recordings } = await adminSupabase
        .from('call_recordings')
        .select('drive_file_id')
        .eq('org_id', user.org_id)
      existingRecordings = recordings
    } else {
      existingRecordings = recordingsWithDeleted
    }

    // Track file IDs to prevent re-syncing (includes both active and deleted if column exists)
    const existingFileIds = new Set(existingRecordings?.map(r => r.drive_file_id).filter(Boolean) || [])

    // Log how many deleted recordings we found (for debugging)
    if (existingRecordings && existingRecordings.length > 0) {
      const deletedCount = existingRecordings.filter(r => r.is_deleted === true).length
      console.log(`Found ${existingRecordings.length} total recordings (${deletedCount} deleted)`)
    }

    // Also check deleted_recording_files table to prevent re-syncing files that were deleted
    let deletedFileIds = new Set<string>()
    try {
      const { data: deletedFiles, error: deletedFilesError } = await adminSupabase
        .from('deleted_recording_files')
        .select('drive_file_id')
        .eq('org_id', user.org_id)

      if (deletedFilesError) {
        console.error('Error querying deleted_recording_files:', deletedFilesError)
        // Table might not exist yet, continue without it
      } else {
        deletedFileIds = new Set(deletedFiles?.map(f => f.drive_file_id).filter(Boolean) || [])
        console.log(`Found ${deletedFileIds.size} deleted file IDs to skip`)
      }
    } catch (err) {
      console.error('Error checking deleted_recording_files table:', err)
      // Table might not exist yet, continue without it
    }

    // Combine both sets - skip files that exist OR were deleted
    const allFileIdsToSkip = new Set([...existingFileIds, ...deletedFileIds])

    // Process files
    const result: DriveSyncResult = {
      success: true,
      files_found: files.length,
      files_matched: 0,
      files_imported: 0,
      errors: [],
    }

    console.log(`Total files to check: ${files.length}, Existing: ${existingFileIds.size}, Deleted: ${deletedFileIds.size}, Total to skip: ${allFileIdsToSkip.size}`)

    for (const file of files) {
      // Skip if already imported or was previously deleted
      if (allFileIdsToSkip.has(file.id)) {
        const isDeleted = deletedFileIds.has(file.id)
        const isExisting = existingFileIds.has(file.id)
        console.log(`Skipping ${file.name} (ID: ${file.id}) - existing: ${isExisting}, deleted: ${isDeleted}`)
        continue
      }

      // Extract phone number from filename
      const phoneNumber = extractPhoneFromFilename(file.name)

      // Normalize phone if found
      const normalizedPhone = phoneNumber ? normalizePhone(phoneNumber) : null

      // Try to match to lead (but import anyway even if no match)
      const matchedLead = normalizedPhone ? phoneToLeadMap.get(normalizedPhone) : null

      if (matchedLead) {
        result.files_matched++
      }

      // Extract date from filename
      const recordingDate = extractDateFromFilename(file.name, file.createdTime)

      // Insert recording (even if no lead match - we'll show it as "unmatched")
      const { error: insertError } = await adminSupabase
        .from('call_recordings')
        .insert({
          org_id: user.org_id,
          lead_id: matchedLead?.id || null,
          user_id: user.id,
          phone_number: normalizedPhone || 'unknown',
          drive_file_id: file.id,
          drive_file_url: file.webViewLink || file.webContentLink,
          drive_file_name: file.name,
          file_size_bytes: parseInt(file.size) || null,
          recording_date: recordingDate.toISOString(),
          processing_status: 'pending',
        })

      if (insertError) {
        console.error('Error inserting recording:', insertError)
        result.errors.push(`Failed to import: ${file.name} - ${insertError.message}`)
      } else {
        result.files_imported++
        console.log(`Imported: ${file.name} (matched: ${matchedLead ? 'yes' : 'no'})`)
      }
    }

    // Update sync timestamp
    await adminSupabase
      .from('drive_sync_settings')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_file_count: result.files_imported,
        sync_error: result.errors.length > 0 ? result.errors.join('; ') : null,
      })
      .eq('id', syncSettings.id)

    console.log(`Sync complete: ${result.files_found} found, ${result.files_imported} imported, ${result.files_matched} matched to leads`)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        files_found: 0,
        files_matched: 0,
        files_imported: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      },
      { status: 500 }
    )
  }
}

// GET - Get sync status
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', authUser.id)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { data: syncSettings } = await supabase
      .from('drive_sync_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    return NextResponse.json({
      configured: !!syncSettings,
      settings: syncSettings || null,
    })
  } catch (error) {
    console.error('Get sync status error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


