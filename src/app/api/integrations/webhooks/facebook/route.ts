/**
 * Facebook Lead Ads Webhook Handler
 * Handles incoming webhooks from Facebook for lead generation
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { FacebookIntegration } from '@/lib/integrations/facebook';
import { mapLeadData, validateMappedLead, getSourceFromPlatform } from '@/lib/integrations/mapper';
import { assignLead } from '@/lib/integrations/assignment';

const facebookIntegration = new FacebookIntegration();

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get('x-hub-signature-256') || '';

    // Get webhook secret from query params or headers
    const webhookSecret = request.nextUrl.searchParams.get('secret') || 
                         request.headers.get('x-webhook-secret') || '';

    if (!webhookSecret) {
      return NextResponse.json(
        { error: 'Webhook secret required' },
        { status: 401 }
      );
    }

    // Handle Facebook webhook verification (GET request) - must be before signature verification
    if (request.method === 'GET') {
      // Facebook sends a verification challenge
      const mode = request.nextUrl.searchParams.get('hub.mode');
      const token = request.nextUrl.searchParams.get('hub.verify_token');
      const challenge = request.nextUrl.searchParams.get('hub.challenge');

      if (mode === 'subscribe' && token === webhookSecret) {
        return new NextResponse(challenge, { status: 200 });
      }

      return NextResponse.json({ error: 'Invalid verification' }, { status: 403 });
    }

    // Verify webhook signature for POST requests
    if (!facebookIntegration.verifyWebhookSignature(payload, signature, webhookSecret)) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Parse payload
    const webhookData = JSON.parse(payload);

    // Extract lead data from webhook
    const leadData = facebookIntegration.extractLeadFromWebhook(webhookData);
    if (!leadData) {
      return NextResponse.json(
        { error: 'No lead data found in webhook' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Find integration by webhook secret
    const { data: integration, error: integrationError } = await supabase
      .from('platform_integrations')
      .select('id, org_id, platform, webhook_secret')
      .eq('webhook_secret', webhookSecret)
      .eq('is_active', true)
      .single();

    if (integrationError || !integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      );
    }

    // Check for duplicate lead (by external_id)
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id')
      .eq('org_id', integration.org_id)
      .eq('external_id', leadData.external_id)
      .single();

    if (existingLead) {
      // Lead already exists, log but don't create duplicate
      await logSyncOperation(
        supabase,
        integration.id,
        'webhook',
        'success',
        0,
        1, // 1 updated (skipped)
        'Lead already exists'
      );

      return NextResponse.json({ message: 'Lead already exists', lead_id: existingLead.id });
    }

    // Map lead data to CRM structure
    const mappedLead = mapLeadData(leadData, integration.org_id, integration.id);
    mappedLead.source = getSourceFromPlatform(integration.platform);

    // Validate mapped lead
    const validation = validateMappedLead(mappedLead);
    if (!validation.valid) {
      await logSyncOperation(
        supabase,
        integration.id,
        'webhook',
        'error',
        0,
        0,
        `Validation failed: ${validation.errors.join(', ')}`
      );

      return NextResponse.json(
        { error: 'Invalid lead data', details: validation.errors },
        { status: 400 }
      );
    }

    // Assign lead using assignment logic
    const assignment = await assignLead(mappedLead, integration.org_id);

    // Add assignment to mapped lead
    mappedLead.assigned_to = assignment.assigned_to;
    mappedLead.created_by = assignment.created_by;

    // Create lead
    const { data: createdLead, error: createError } = await supabase
      .from('leads')
      .insert(mappedLead)
      .select()
      .single();

    if (createError || !createdLead) {
      await logSyncOperation(
        supabase,
        integration.id,
        'webhook',
        'error',
        0,
        0,
        `Failed to create lead: ${createError?.message || 'Unknown error'}`
      );

      return NextResponse.json(
        { error: 'Failed to create lead', details: createError },
        { status: 500 }
      );
    }

    // Log successful sync
    await logSyncOperation(
      supabase,
      integration.id,
      'webhook',
      'success',
      1,
      0,
      `Lead created via ${assignment.assignment_method} assignment`
    );

    // Update integration last_sync_at
    await supabase
      .from('platform_integrations')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', integration.id);

    return NextResponse.json({
      success: true,
      lead_id: createdLead.id,
      assignment_method: assignment.assignment_method,
    });
  } catch (error) {
    console.error('Facebook webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Log sync operation to integration_sync_logs
 */
async function logSyncOperation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  integrationId: string,
  syncType: 'webhook' | 'manual' | 'scheduled',
  status: 'success' | 'error' | 'partial',
  leadsCreated: number,
  leadsUpdated: number,
  errorMessage?: string
) {
  await supabase.from('integration_sync_logs').insert({
    integration_id: integrationId,
    sync_type: syncType,
    status,
    leads_created: leadsCreated,
    leads_updated: leadsUpdated,
    error_message: errorMessage || null,
  });
}

// Handle GET for webhook verification
export async function GET(request: NextRequest) {
  return POST(request);
}

