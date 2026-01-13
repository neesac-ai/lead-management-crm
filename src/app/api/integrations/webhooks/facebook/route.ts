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

function extractLeadgenIdFromWebhook(payload: unknown): {
  leadgen_id: string;
  form_id?: string;
  page_id?: string;
  created_time?: number;
} | null {
  try {
    const webhook = payload as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            leadgen_id?: string;
            form_id?: string;
            page_id?: string;
            created_time?: number;
          };
        }>;
      }>;
    };

    const leadgen_id = webhook.entry?.[0]?.changes?.[0]?.value?.leadgen_id;
    if (!leadgen_id) return null;

    const value = webhook.entry?.[0]?.changes?.[0]?.value;
    return {
      leadgen_id,
      form_id: value?.form_id,
      page_id: value?.page_id,
      created_time: value?.created_time,
    };
  } catch {
    return null;
  }
}

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

    // Parse payload
    const webhookData = JSON.parse(payload);

    const supabase = await createClient();

    // Find integration by webhook secret
    const { data: integration, error: integrationError } = await supabase
      .from('platform_integrations')
      .select('id, org_id, platform, webhook_secret, credentials, config')
      .eq('webhook_secret', webhookSecret)
      .eq('is_active', true)
      .single();

    if (integrationError || !integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      );
    }

    // Verify webhook signature for POST requests using Meta App Secret (not webhook token)
    const appSecret = (integration.config as Record<string, unknown> | null)?.facebook_app_secret as string | undefined;
    if (!appSecret) {
      return NextResponse.json(
        { error: 'Integration missing Meta App Secret (facebook_app_secret)' },
        { status: 400 }
      );
    }

    if (!facebookIntegration.verifyWebhookSignature(payload, signature, appSecret)) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    const leadgen = extractLeadgenIdFromWebhook(webhookData);
    if (!leadgen) {
      return NextResponse.json(
        { error: 'No leadgen_id found in webhook payload' },
        { status: 400 }
      );
    }

    const accessToken = (integration.credentials as Record<string, unknown> | null)?.access_token as string | undefined;
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Integration not connected (missing access token)' },
        { status: 400 }
      );
    }

    // Fetch full lead details from Graph API (webhook payload does not include field_data reliably)
    const leadRes = await fetch(
      `https://graph.facebook.com/v18.0/${leadgen.leadgen_id}?` +
      `fields=id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,page_id&` +
      `access_token=${accessToken}`
    );
    if (!leadRes.ok) {
      const err = await leadRes.json().catch(() => ({}));
      await logSyncOperation(
        supabase,
        integration.id,
        'webhook',
        'error',
        0,
        0,
        `Failed to fetch lead details: ${JSON.stringify(err)}`
      );
      return NextResponse.json(
        { error: 'Failed to fetch lead details from Meta', details: err },
        { status: 502 }
      );
    }

    const leadJson = await leadRes.json() as {
      id: string;
      created_time?: string;
      field_data?: Array<{ name: string; values: string[] }>;
      ad_id?: string;
      ad_name?: string;
      adset_id?: string;
      adset_name?: string;
      campaign_id?: string;
      campaign_name?: string;
      form_id?: string;
      page_id?: string;
    };

    const fieldData: Record<string, string> = {};
    if (leadJson.field_data) {
      for (const field of leadJson.field_data) {
        if (field.name && field.values && field.values.length > 0) {
          fieldData[field.name] = field.values[0];
        }
      }
    }

    const name = fieldData.full_name || fieldData.first_name || fieldData.name || 'Unknown';
    const email = fieldData.email || '';
    const phone = fieldData.phone_number || fieldData.phone || '';
    const company = fieldData.company_name || fieldData.company || '';

    const leadData = {
      name: name.trim() || 'Unknown',
      email: email || undefined,
      phone: phone || undefined,
      company: company || undefined,
      external_id: leadJson.id,
      campaign_data: {
        campaign_id: leadJson.campaign_id || '',
        campaign_name: leadJson.campaign_name || '',
        ad_set_id: leadJson.adset_id || '',
        ad_id: leadJson.ad_id || '',
        form_id: leadJson.form_id || leadgen.form_id || '',
        page_id: leadJson.page_id || leadgen.page_id || '',
      },
      metadata: {
        ad_name: leadJson.ad_name,
        form_id: leadJson.form_id || leadgen.form_id,
        page_id: leadJson.page_id || leadgen.page_id,
        field_data: fieldData,
      },
      created_at: leadJson.created_time,
    };

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

export async function GET(request: NextRequest) {
  return POST(request);
}

