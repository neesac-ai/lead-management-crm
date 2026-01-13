import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user details
    const { data: userData } = await supabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', authUser.id)
      .single<{ id: string; role: string; org_id: string }>()

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Only admin and super_admin can delete recordings
    if (userData.role !== 'admin' && userData.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only admins can delete recordings' },
        { status: 403 }
      )
    }

    const { recordingId, hardDelete = false } = await request.json()

    if (!recordingId) {
      return NextResponse.json(
        { error: 'Recording ID is required' },
        { status: 400 }
      )
    }

    // Use admin client to bypass RLS
    const adminClient = await createAdminClient()

    // Verify the recording belongs to the user's org
    const { data: recording } = await adminClient
      .from('call_recordings')
      .select('id, org_id, drive_file_id')
      .eq('id', recordingId)
      .single<{ id: string; org_id: string; drive_file_id: string | null }>()

    if (!recording) {
      return NextResponse.json(
        { error: 'Recording not found' },
        { status: 404 }
      )
    }

    if (recording.org_id !== userData.org_id) {
      return NextResponse.json(
        { error: 'Not authorized to delete this recording' },
        { status: 403 }
      )
    }

    // Get the recording's drive_file_id before deleting (to track it)
    const driveFileId = recording?.drive_file_id
    console.log(`[DELETE] Starting ${hardDelete ? 'HARD' : 'SOFT'} deletion for recording ${recordingId}`)
    console.log(`[DELETE] Drive file ID: ${driveFileId || 'NONE'}`)

    let deleted = false
    let deleteError: any = null
    let deleteMethod = 'unknown'

    if (hardDelete) {
      // Hard delete: Permanently remove from database
      console.log(`[DELETE] Performing HARD delete (permanent removal)`)
      const hardDeleteResult = await adminClient
        .from('call_recordings')
        .delete()
        .eq('id', recordingId)

      deleteError = hardDeleteResult.error
      deleted = !hardDeleteResult.error
      deleteMethod = deleted ? 'hard' : 'failed'

      if (deleted) {
        console.log(`[DELETE] ✅ Hard delete successful - recording permanently removed`)
      } else {
        console.log(`[DELETE] ❌ Hard delete failed: ${hardDeleteResult.error?.message}`)
      }
    } else {
      // Soft delete: Mark as deleted but keep in database
      try {
        // Try soft delete first
        // Use type assertion since is_deleted column may not be in TypeScript types yet
        console.log(`[DELETE] Attempting soft delete (is_deleted = true)`)
        const softDeleteResult = await (adminClient
          .from('call_recordings') as any)
          .update({ is_deleted: true })
          .eq('id', recordingId)
          .select()

        deleteError = softDeleteResult.error

        if (!deleteError) {
          deleted = true
          deleteMethod = 'soft'
          console.log(`[DELETE] ✅ Soft delete successful - recording hidden but kept in database`)
        } else {
          const errorMessage = deleteError.message || ''
          console.log(`[DELETE] Soft delete failed: ${errorMessage}`)
          // If soft delete fails due to missing column, try hard delete
          if (errorMessage.includes('column') && errorMessage.includes('is_deleted')) {
            console.log(`[DELETE] is_deleted column not found, falling back to hard delete`)
            const hardDeleteResult = await adminClient
              .from('call_recordings')
              .delete()
              .eq('id', recordingId)

            deleteError = hardDeleteResult.error
            deleted = !hardDeleteResult.error
            deleteMethod = deleted ? 'hard' : 'failed'
            if (deleted) {
              console.log(`[DELETE] ✅ Hard delete successful`)
            } else {
              console.log(`[DELETE] ❌ Hard delete failed: ${hardDeleteResult.error?.message}`)
            }
          } else {
            // Other error, return it
            console.error(`[DELETE] ❌ Delete error:`, deleteError)
            return NextResponse.json(
              { error: 'Failed to delete recording', details: deleteError.message },
              { status: 500 }
            )
          }
        }
      } catch (err: any) {
        console.log(`[DELETE] Exception during delete: ${err.message}`)
        // If update throws an error (e.g., column doesn't exist), try hard delete
        if (err.message?.includes('is_deleted') || err.message?.includes('column')) {
          console.log(`[DELETE] is_deleted column not found, falling back to hard delete`)
          const hardDeleteResult = await adminClient
            .from('call_recordings')
            .delete()
            .eq('id', recordingId)

          deleteError = hardDeleteResult.error
          deleted = !hardDeleteResult.error
          deleteMethod = deleted ? 'hard' : 'failed'
          if (deleted) {
            console.log(`[DELETE] ✅ Hard delete successful`)
          } else {
            console.log(`[DELETE] ❌ Hard delete failed: ${hardDeleteResult.error?.message}`)
          }
        } else {
          throw err
        }
      }
    }

    if (!deleted && deleteError) {
      console.error('Delete error:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete recording', details: deleteError.message },
        { status: 500 }
      )
    }

    // Track the deleted file ID to prevent re-syncing (even if hard deleted)
    if (driveFileId) {
      console.log(`[DELETE] Tracking deleted file ID in deleted_recording_files table`)
      try {
        const { error: trackError } = await adminClient
          .from('deleted_recording_files')
          .insert({
            org_id: userData.org_id,
            drive_file_id: driveFileId,
            deleted_by: userData.id,
          } as any)

        if (trackError) {
          // Log error but don't fail the delete operation
          console.error(`[DELETE] ❌ Failed to track deleted file ID:`, trackError.message)
          console.error(`[DELETE] File ID: ${driveFileId}, Org ID: ${userData.org_id}`)
          // Don't return error - deletion succeeded, tracking is secondary
        } else {
          console.log(`[DELETE] ✅ Successfully tracked deleted file ID: ${driveFileId}`)
        }
      } catch (err) {
        // Table might not exist yet (migration not applied)
        console.error(`[DELETE] ❌ Error tracking deleted file ID:`, err)
      }
    } else {
      console.warn(`[DELETE] ⚠️ No drive_file_id found for recording: ${recordingId}`)
    }

    console.log(`[DELETE] ✅ Deletion complete - Method: ${deleteMethod}${hardDelete ? ' (PERMANENT)' : ' (SOFT)'}, Recording ID: ${recordingId}`)

    return NextResponse.json({
      success: true,
      message: hardDelete
        ? 'Recording permanently deleted'
        : 'Recording deleted (soft delete - can be restored)',
      method: deleteMethod
    })

  } catch (error) {
    console.error('Delete recording error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}





