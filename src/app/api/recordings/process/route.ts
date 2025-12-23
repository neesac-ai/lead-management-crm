import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { downloadFile } from '@/lib/google/drive'
import { createAIProvider } from '@/lib/ai/providers'
import type { AIProvider } from '@/types/ai.types'

export async function POST(request: NextRequest) {
  try {
    const { recordingId } = await request.json()

    if (!recordingId) {
      return NextResponse.json({ error: 'Recording ID required' }, { status: 400 })
    }

    const supabase = await createClient()
    const adminSupabase = await createAdminClient()

    // Get current user
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user with Google tokens (use admin client to ensure we get the data)
    const { data: user } = await adminSupabase
      .from('users')
      .select('id, org_id, google_access_token, google_refresh_token')
      .eq('auth_id', authUser.id)
      .single()

    if (!user || !user.org_id) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get recording using admin client to bypass RLS
    const { data: recording, error: recordingError } = await adminSupabase
      .from('call_recordings')
      .select('*, leads(name, email, phone)')
      .eq('id', recordingId)
      .single()

    if (recordingError || !recording) {
      console.error('Recording fetch error:', recordingError)
      return NextResponse.json({ 
        error: 'Recording not found', 
        details: recordingError?.message 
      }, { status: 404 })
    }

    // Verify user has access to this recording's org
    if (recording.org_id !== user.org_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    if (!recording.drive_file_id) {
      return NextResponse.json({ error: 'No file associated with recording' }, { status: 400 })
    }

    // Get AI configs using admin client
    const { data: aiConfigs } = await adminSupabase
      .from('ai_config')
      .select('*')
      .eq('org_id', user.org_id)
      .eq('is_active', true)

    if (!aiConfigs || aiConfigs.length === 0) {
      return NextResponse.json(
        { error: 'No AI providers configured. Please configure AI settings first.' },
        { status: 400 }
      )
    }

    // Update status to processing
    await adminSupabase
      .from('call_recordings')
      .update({ processing_status: 'processing' })
      .eq('id', recordingId)

    try {
      // Step 1: Find transcription provider
      const transcriptionConfig = aiConfigs.find(c => c.is_default_transcription)
        || aiConfigs.find(c => 
            c.provider === 'groq' || c.provider === 'openai'
          )

      if (!transcriptionConfig) {
        throw new Error('No transcription provider available')
      }

      const transcriptionProvider = createAIProvider(
        transcriptionConfig.provider as AIProvider,
        transcriptionConfig.api_key!,
        (transcriptionConfig.config as { transcription_model?: string })?.transcription_model
      )

      // For transcription, we need the actual audio data
      // Download the file first
      const audioBuffer = await downloadFile(
        user.google_access_token!,
        user.google_refresh_token || undefined,
        recording.drive_file_id
      )

      // Create a blob URL for the audio
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' })
      const audioUrl = URL.createObjectURL(audioBlob)

      let transcriptionResult
      try {
        transcriptionResult = await transcriptionProvider.transcribe(audioUrl)
      } finally {
        URL.revokeObjectURL(audioUrl)
      }

      // Step 3: Summarize
      const summaryConfig = aiConfigs.find(c => c.is_default_summary)
        || aiConfigs[0]

      const summaryProvider = createAIProvider(
        summaryConfig.provider as AIProvider,
        summaryConfig.api_key!,
        summaryConfig.model_name
      )

      // Add context about the lead
      const leadContext = recording.leads
        ? `Lead: ${recording.leads.name}${recording.leads.email ? ` (${recording.leads.email})` : ''}`
        : undefined

      const summaryResult = await summaryProvider.summarize(
        transcriptionResult.text,
        leadContext
      )

      // Step 4: Update recording with results
      const { error: updateError } = await adminSupabase
        .from('call_recordings')
        .update({
          transcript: transcriptionResult.text,
          summary: summaryResult.summary,
          sentiment: summaryResult.sentiment,
          sentiment_reasoning: summaryResult.sentiment_reasoning,
          key_points: summaryResult.key_points,
          action_items: summaryResult.action_items,
          next_steps: summaryResult.next_steps,
          call_quality: summaryResult.call_quality || null,
          duration_seconds: transcriptionResult.duration_seconds,
          transcription_model: `${transcriptionConfig.provider}/${(transcriptionConfig.config as { transcription_model?: string })?.transcription_model || 'default'}`,
          ai_model_used: `${summaryConfig.provider}/${summaryConfig.model_name}`,
          processing_status: 'completed',
          processed_at: new Date().toISOString(),
        })
        .eq('id', recordingId)

      if (updateError) {
        throw updateError
      }

      // Update AI config usage stats (optional, skip if function doesn't exist)
      try {
        await adminSupabase.rpc('increment_ai_usage', {
          config_id: transcriptionConfig.id,
        })
        if (summaryConfig.id !== transcriptionConfig.id) {
          await adminSupabase.rpc('increment_ai_usage', {
            config_id: summaryConfig.id,
          })
        }
      } catch {
        // RPC function might not exist, ignore
      }

      // Create activity on the lead
      if (recording.lead_id) {
        await adminSupabase
          .from('lead_activities')
          .insert({
            lead_id: recording.lead_id,
            user_id: user.id,
            action_type: 'Call Analyzed',
            comments: `AI Summary: ${summaryResult.summary.slice(0, 200)}...`,
          })
      }

      return NextResponse.json({
        success: true,
        transcript: transcriptionResult.text,
        summary: summaryResult,
        duration: transcriptionResult.duration_seconds,
      })
    } catch (processingError) {
      // Update status to failed
      await adminSupabase
        .from('call_recordings')
        .update({
          processing_status: 'failed',
          processing_error: processingError instanceof Error 
            ? processingError.message 
            : 'Unknown error',
        })
        .eq('id', recordingId)

      throw processingError
    }
  } catch (error) {
    console.error('Process recording error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Process all pending recordings
export async function PUT() {
  try {
    const supabase = await createClient()
    const adminSupabase = await createAdminClient()

    // Get current user
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: user } = await adminSupabase
      .from('users')
      .select('id, org_id')
      .eq('auth_id', authUser.id)
      .single()

    if (!user || !user.org_id) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get pending recordings
    const { data: pendingRecordings } = await adminSupabase
      .from('call_recordings')
      .select('id')
      .eq('org_id', user.org_id)
      .eq('processing_status', 'pending')
      .limit(10)

    if (!pendingRecordings || pendingRecordings.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending recordings to process',
        processed: 0,
      })
    }

    // Queue processing for each (in a real app, you'd use a proper job queue)
    const results = []
    for (const recording of pendingRecordings) {
      try {
        const response = await fetch(
          new URL('/api/recordings/process', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recordingId: recording.id }),
          }
        )
        results.push({ id: recording.id, success: response.ok })
      } catch {
        results.push({ id: recording.id, success: false })
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    })
  } catch (error) {
    console.error('Batch process error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


