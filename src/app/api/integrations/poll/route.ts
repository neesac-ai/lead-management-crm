/**
 * Polling Service API
 * Scheduled job endpoint for fetching leads from all active integrations
 * Can be called via cron job or manually
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { FacebookIntegration } from '@/lib/integrations/facebook';
import { InstagramIntegration } from '@/lib/integrations/instagram';
import { GoogleSheetsIntegration } from '@/lib/integrations/google-sheets';
import { mapLeadData, validateMappedLead, getSourceFromPlatform } from '@/lib/integrations/mapper';
import { assignLead } from '@/lib/integrations/assignment';

// Verify this is called from a trusted source (cron job, admin, etc.)
const POLLING_SECRET = process.env.POLLING_SECRET || '';
const DEFAULT_POLL_INTERVAL_SECONDS = 180; // 3 minutes

export async function POST(request: NextRequest) {
  try {
    // Verify polling secret if provided
    const authHeader = request.headers.get('authorization');
    if (POLLING_SECRET && authHeader !== `Bearer ${POLLING_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Polling is a server-to-server job and must bypass RLS (no end-user session cookies).
    const supabase = await createAdminClient();

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
    const nowMs = Date.now();
    let dueCount = 0;
    let skippedNotDue = 0;

    // Process each integration
    for (const integration of integrations) {
      try {
        // Due polling:
        // Each integration can define poll interval in config.poll_interval_seconds.
        // If not set, we use DEFAULT_POLL_INTERVAL_SECONDS.
        const cfg = (integration.config || {}) as any;
        const pollIntervalSeconds =
          typeof cfg.poll_interval_seconds === 'number' && Number.isFinite(cfg.poll_interval_seconds)
            ? Math.max(30, Math.min(cfg.poll_interval_seconds, 3600))
            : DEFAULT_POLL_INTERVAL_SECONDS;

        const lastSyncAt = integration.last_sync_at ? new Date(integration.last_sync_at).getTime() : null;
        const isDue = lastSyncAt === null ? true : nowMs - lastSyncAt >= pollIntervalSeconds * 1000;

        if (!isDue) {
          skippedNotDue++;
          results.push({
            integration_id: integration.id,
            integration_name: integration.name,
            status: 'skipped',
            message: `Not due yet (poll every ${pollIntervalSeconds}s)`,
          });
          continue;
        }

        dueCount++;

        // Get integration instance
        let integrationInstance;
        switch (integration.platform) {
          case 'facebook':
            integrationInstance = new FacebookIntegration();
            break;
          case 'instagram':
            integrationInstance = new InstagramIntegration();
            break;
          case 'google_sheets':
            integrationInstance = new GoogleSheetsIntegration();
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
        let maxSheetRowSeen: number | null = null;
        let orgAdminUserId: string | null = null;

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
            const rowSource = (leadData.metadata as { source?: string } | undefined)?.source;
            mappedLead.source = rowSource || getSourceFromPlatform(integration.platform);

            const validation = validateMappedLead(mappedLead);
            if (!validation.valid) {
              errors.push(`Lead ${leadData.external_id}: ${validation.errors.join(', ')}`);
              continue;
            }

            // Assignment rules:
            // - Google Sheets: if sheet_assigned_to is configured, always assign to that rep.
            //   If not configured, keep unassigned (and set created_by to an admin for visibility).
            if (integration.platform === 'google_sheets') {
              const cfg = (integration.config || {}) as any;
              const sheetAssignedTo = (cfg.sheet_assigned_to as string | undefined) || null;
              if (sheetAssignedTo) {
                mappedLead.assigned_to = sheetAssignedTo;
                mappedLead.created_by = sheetAssignedTo;
              } else {
                mappedLead.assigned_to = null;
                // created_by will be set below to an org admin user (for unassigned visibility)
              }
            } else {
              const assignment = await assignLead(mappedLead, integration.org_id);
              mappedLead.assigned_to = assignment.assigned_to;
              mappedLead.created_by = assignment.created_by;
            }

            // Keep unassigned leads visible in Leads tab (sales RLS):
            // When a lead ends up unassigned, set created_by to an org admin user.
            if (!mappedLead.assigned_to && !mappedLead.created_by) {
              if (!orgAdminUserId) {
                const { data: adminUser } = await supabase
                  .from('users')
                  .select('id')
                  .eq('org_id', integration.org_id)
                  .in('role', ['admin', 'super_admin'])
                  .eq('is_active', true)
                  .eq('is_approved', true)
                  .order('created_at', { ascending: true })
                  .limit(1)
                  .single();
                orgAdminUserId = adminUser?.id || null;
              }
              if (orgAdminUserId) {
                mappedLead.created_by = orgAdminUserId;
              }
            }

            // Create lead
            const { error: createError } = await supabase
              .from('leads')
              .insert(mappedLead);

            if (createError) {
              errors.push(`Lead ${leadData.external_id}: ${createError.message}`);
            } else {
              leadsCreated++;
            }

            if (integration.platform === 'google_sheets') {
              const row = (leadData.metadata as { gsheets_row?: number } | undefined)?.gsheets_row;
              if (typeof row === 'number') {
                maxSheetRowSeen = maxSheetRowSeen === null ? row : Math.max(maxSheetRowSeen, row);
              }
            }
          } catch (error) {
            errors.push(`Lead ${leadData.external_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        // Advance cursor for Google Sheets (store in config)
        let updatedConfig: Record<string, unknown> | null = null;
        if (integration.platform === 'google_sheets' && typeof maxSheetRowSeen === 'number') {
          const existingConfig = (integration.config as Record<string, unknown>) || {};
          const prev = typeof (existingConfig as any).cursor_last_row === 'number' ? (existingConfig as any).cursor_last_row : 1;
          const next = Math.max(prev, maxSheetRowSeen);
          updatedConfig = { ...existingConfig, cursor_last_row: next };
        }

        // Update integration
        await supabase
          .from('platform_integrations')
          .update({
            sync_status: errors.length > 0 ? 'error' : 'idle',
            last_sync_at: new Date().toISOString(),
            error_message: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
            ...(updatedConfig ? { config: updatedConfig } : {}),
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
      due: dueCount,
      skipped_not_due: skippedNotDue,
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

