/**
 * Polling Service API
 * Scheduled job endpoint for fetching leads from all active integrations
 * Can be called via cron job or manually
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { FacebookIntegration } from '@/lib/integrations/facebook';
import { mapLeadData, validateMappedLead, getSourceFromPlatform } from '@/lib/integrations/mapper';
import { assignLead } from '@/lib/integrations/assignment';

// Verify this is called from a trusted source (cron job, admin, etc.)
const POLLING_SECRET = process.env.POLLING_SECRET || '';

export async function POST(request: NextRequest) {
  try {
    // Verify polling secret if provided
    const authHeader = request.headers.get('authorization');
    if (POLLING_SECRET && authHeader !== `Bearer ${POLLING_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    // Get all active integrations
    const { data: integrations, error: fetchError } = await supabase
      .from('platform_integrations')
      .select('*')
      .eq('is_active', true)
      .in('sync_status', ['idle', 'error']); // Only poll idle or error integrations

    if (fetchError) {
      return NextResponse.json(
        { error: 'Failed to fetch integrations', details: fetchError },
        { status: 500 }
      );
    }

    if (!integrations || integrations.length === 0) {
      return NextResponse.json({ message: 'No active integrations to poll' });
    }

    const results = [];

    // Process each integration
    for (const integration of integrations) {
      try {
        // Get integration instance
        let integrationInstance;
        switch (integration.platform) {
          case 'facebook':
            integrationInstance = new FacebookIntegration();
            break;
          // Add other platforms as they're implemented
          default:
            results.push({
              integration_id: integration.id,
              integration_name: integration.name,
              status: 'skipped',
              message: `Platform ${integration.platform} not yet implemented`,
            });
            continue;
        }

        // Update sync status
        await supabase
          .from('platform_integrations')
          .update({ sync_status: 'syncing' })
          .eq('id', integration.id);

        // Determine since date
        let since: Date | undefined;
        if (integration.last_sync_at) {
          since = new Date(integration.last_sync_at);
        } else {
          since = new Date();
          since.setHours(since.getHours() - 24);
        }

        // Fetch leads
        const leadsData = await integrationInstance.fetchLeads(
          integration.credentials as Record<string, unknown>,
          integration.config as Record<string, unknown>,
          since
        );

        let leadsCreated = 0;
        let leadsUpdated = 0;
        const errors: string[] = [];

        // Process each lead
        for (const leadData of leadsData) {
          try {
            // Check for duplicate
            const { data: existingLead } = await supabase
              .from('leads')
              .select('id')
              .eq('org_id', integration.org_id)
              .eq('external_id', leadData.external_id)
              .single();

            if (existingLead) {
              leadsUpdated++;
              continue;
            }

            // Map and validate
            const mappedLead = mapLeadData(leadData, integration.org_id, integration.id);
            mappedLead.source = getSourceFromPlatform(integration.platform);

            const validation = validateMappedLead(mappedLead);
            if (!validation.valid) {
              errors.push(`Lead ${leadData.external_id}: ${validation.errors.join(', ')}`);
              continue;
            }

            // Assign lead
            const assignment = await assignLead(mappedLead, integration.org_id);
            mappedLead.assigned_to = assignment.assigned_to;
            mappedLead.created_by = assignment.created_by;

            // Create lead
            const { error: createError } = await supabase
              .from('leads')
              .insert(mappedLead);

            if (createError) {
              errors.push(`Lead ${leadData.external_id}: ${createError.message}`);
            } else {
              leadsCreated++;
            }
          } catch (error) {
            errors.push(`Lead ${leadData.external_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        // Update integration
        await supabase
          .from('platform_integrations')
          .update({
            sync_status: errors.length > 0 ? 'error' : 'idle',
            last_sync_at: new Date().toISOString(),
            error_message: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
          })
          .eq('id', integration.id);

        // Log sync operation
        await supabase.from('integration_sync_logs').insert({
          integration_id: integration.id,
          sync_type: 'scheduled',
          status: errors.length > 0 ? 'partial' : 'success',
          leads_created: leadsCreated,
          leads_updated: leadsUpdated,
          error_message: errors.length > 0 ? errors.join('; ') : null,
        });

        results.push({
          integration_id: integration.id,
          integration_name: integration.name,
          status: errors.length > 0 ? 'partial' : 'success',
          leads_created: leadsCreated,
          leads_updated: leadsUpdated,
          errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
        });
      } catch (error) {
        // Update integration with error
        await supabase
          .from('platform_integrations')
          .update({
            sync_status: 'error',
            error_message: error instanceof Error ? error.message : 'Unknown error',
          })
          .eq('id', integration.id);

        results.push({
          integration_id: integration.id,
          integration_name: integration.name,
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: integrations.length,
      results,
    });
  } catch (error) {
    console.error('Polling service error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Allow GET for manual triggering (with proper auth)
export async function GET(request: NextRequest) {
  return POST(request);
}

