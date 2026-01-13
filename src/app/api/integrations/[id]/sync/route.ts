/**
 * Manual Sync Trigger API
 * Manually triggers a sync of leads from the platform
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { FacebookIntegration } from '@/lib/integrations/facebook';
import { InstagramIntegration } from '@/lib/integrations/instagram';
import { GoogleSheetsIntegration } from '@/lib/integrations/google-sheets';
import { mapLeadData, validateMappedLead, getSourceFromPlatform } from '@/lib/integrations/mapper';
import { assignLead } from '@/lib/integrations/assignment';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const adminClient = await createAdminClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Check permissions (admin only)
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch integration
    let query = supabase
      .from('platform_integrations')
      .select('*')
      .eq('id', id);

    if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }

    const { data: integration, error: fetchError } = await query.single();

    if (fetchError || !integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    if (!integration.is_active) {
      return NextResponse.json(
        { error: 'Integration is not active' },
        { status: 400 }
      );
    }

    // Get integration instance based on platform
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
        return NextResponse.json(
          { error: `Manual sync not yet implemented for ${integration.platform}` },
          { status: 501 }
        );
    }

    // Update sync status
    await supabase
      .from('platform_integrations')
      .update({ sync_status: 'syncing' })
      .eq('id', id);

    // Determine since date:
    // - default: last_sync_at or 24h
    // - override: backfill_days or since_iso (request body)
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const backfillDays = typeof body?.backfill_days === 'number' ? body.backfill_days : undefined;
    const sinceIso = typeof body?.since_iso === 'string' ? body.since_iso : undefined;
    const fullSync = Boolean(body?.full_sync);
    const sheetAssignedToOverride =
      body?.sheet_assigned_to === null
        ? null
        : (typeof body?.sheet_assigned_to === 'string' ? body.sheet_assigned_to : undefined);
    const forceUnassign = Boolean(body?.force_unassign);

    console.log('[SYNC] start', {
      integrationId: id,
      fullSync,
      sheet_assigned_to: body?.sheet_assigned_to ?? undefined,
      forceUnassign,
    });

    let since: Date | undefined;
    if (sinceIso) {
      const d = new Date(sinceIso);
      if (!Number.isNaN(d.getTime())) since = d;
    } else if (backfillDays && backfillDays > 0) {
      since = new Date();
      since.setDate(since.getDate() - backfillDays);
    } else if (integration.last_sync_at) {
      since = new Date(integration.last_sync_at);
    } else {
      since = new Date();
      since.setHours(since.getHours() - 24);
    }

    // For Google Sheets: validate sheet config directly (no forms needed)
    const config = (integration.config as Record<string, unknown>) || {};
    let effectiveConfig = config;

    if (integration.platform === 'google_sheets') {
      // Validate required Google Sheets config
      if (!config.sheet_url || !config.sheet_tab_name) {
        return NextResponse.json(
          {
            error: 'Google Sheets not configured',
            details: 'Please configure the Google Sheet URL and tab name in the integration settings.',
          },
          { status: 400 }
        );
      }

      // Manual "Sync Now" should be able to fetch ALL rows (preview + assignment use-case).
      // We do this by resetting cursor to row 1 for this run only; cursor will re-advance at the end.
      if (fullSync) {
        effectiveConfig = { ...config, cursor_last_row: 1 };
      }
    } else {
      // Meta platforms: fall back to assigned forms if none selected
      const selectedForms = config.selected_forms as string[] | undefined;
      if (!Array.isArray(selectedForms) || selectedForms.length === 0) {
        const { data: assignments, error: assignError } = await supabase
          .from('lead_form_assignments')
          .select('form_id')
          .eq('integration_id', id)
          .eq('org_id', integration.org_id)
          .eq('is_active', true);

        if (assignError) {
          return NextResponse.json(
            { error: 'Failed to read lead form assignments', details: assignError },
            { status: 500 }
          );
        }

        const formIds = (assignments || []).map((a) => a.form_id).filter(Boolean);
        if (formIds.length === 0) {
          return NextResponse.json(
            {
              error: 'No lead forms configured',
              details: 'Fetch lead forms and assign at least one form to a sales rep before syncing.',
            },
            { status: 400 }
          );
        }

        effectiveConfig = { ...config, selected_forms: formIds };
      }
    }

    // Fetch leads from platform
    const leadsData = await integrationInstance.fetchLeads(
      integration.credentials as Record<string, unknown>,
      effectiveConfig,
      since
    );
    console.log('[SYNC] fetched leadsData', { integrationId: id, count: Array.isArray(leadsData) ? leadsData.length : 0 });

    let leadsCreated = 0;
    let leadsUpdated = 0; // for Google Sheets: number of rows updated (existing external_id)
    const errors: string[] = [];
    let maxSheetRowSeen: number | null = null;
    const syncedLeads: Array<Record<string, unknown>> = [];
    const sheetAssignedTo = integration.platform === 'google_sheets'
      ? (
          sheetAssignedToOverride === undefined
            ? ((config as any).sheet_assigned_to as string | undefined)
            : (sheetAssignedToOverride as string | null)
        )
      : undefined;
    const shouldApplySheetAssignment =
      integration.platform === 'google_sheets' && sheetAssignedToOverride !== undefined;

    if (integration.platform === 'google_sheets') {
      try {
        const { count: existingCount } = await adminClient
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', integration.org_id)
          .eq('integration_id', id);
        console.log('[SYNC][GSHEETS] leads before', {
          orgId: integration.org_id,
          integrationId: id,
          count: existingCount ?? null,
        });
      } catch (e) {
        console.log('[SYNC][GSHEETS] failed to count leads before', e);
      }
    }

    // Process each lead
    for (const leadData of leadsData) {
      try {
        // Check for duplicate
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id, name, phone, email, assigned_to, created_by, created_at, external_id, custom_fields, source')
          .eq('org_id', integration.org_id)
          .eq('external_id', leadData.external_id)
          .maybeSingle();

        if (existingLead) {
          // For Google Sheets: update existing lead fields based on latest mapping (so reruns refresh data)
          if (integration.platform === 'google_sheets') {
            const mappedLead = mapLeadData(leadData, integration.org_id, integration.id);
            const rowSource = (leadData.metadata as { source?: string } | undefined)?.source;
            mappedLead.source = rowSource || getSourceFromPlatform(integration.platform);

            const validation = validateMappedLead(mappedLead);
            if (!validation.valid) {
              errors.push(`Lead ${leadData.external_id}: ${validation.errors.join(', ')}`);
              continue;
            }

            const updatePatch: Record<string, unknown> = {
              updated_at: new Date().toISOString(),
            };

            // Only overwrite when we have a meaningful value
            if (mappedLead.name && mappedLead.name.trim()) updatePatch.name = mappedLead.name.trim();
            if (mappedLead.phone) updatePatch.phone = mappedLead.phone;
            if (mappedLead.email !== undefined) updatePatch.email = mappedLead.email;
            if (mappedLead.source) updatePatch.source = mappedLead.source;
            if (mappedLead.custom_fields) updatePatch.custom_fields = mappedLead.custom_fields;

            // If sheet-level assignee is configured, enforce it for existing leads too.
            // If forced unassign is requested, explicitly clear assignment.
            if (sheetAssignedTo) {
              updatePatch.assigned_to = sheetAssignedTo;
            } else if (forceUnassign) {
              updatePatch.assigned_to = null;
            }

            const { data: updatedLead, error: updateError } = await supabase
              .from('leads')
              .update(updatePatch)
              .eq('id', (existingLead as any).id)
              .select('id, name, phone, email, assigned_to, created_by, created_at, external_id, custom_fields, source')
              .single();

            if (updateError) {
              errors.push(`Lead ${leadData.external_id}: ${updateError.message}`);
            } else {
              leadsUpdated++;
              const company = (updatedLead as any)?.custom_fields?.company ?? null;
              syncedLeads.push({ ...(updatedLead as any), company, was_created: false, was_updated: true });
            }
          } else {
            // Other platforms: keep existing behavior (skip duplicates)
            leadsUpdated++;
            syncedLeads.push({ ...(existingLead as any), was_created: false });
          }
          continue;
        }

        // Map lead data
        const mappedLead = mapLeadData(leadData, integration.org_id, integration.id);
        // Allow source override from Google Sheets row when present
        const rowSource = (leadData.metadata as { source?: string } | undefined)?.source;
        mappedLead.source = rowSource || getSourceFromPlatform(integration.platform);

        // Validate
        const validation = validateMappedLead(mappedLead);
        if (!validation.valid) {
          errors.push(`Lead ${leadData.external_id}: ${validation.errors.join(', ')}`);
          continue;
        }

        // Assignment:
        // - Google Sheets supports sheet-level assignee (all current + future rows assigned to one rep)
        // - Otherwise keep unassigned but visible by setting created_by to the importer
        if (integration.platform === 'google_sheets') {
          if (sheetAssignedTo) {
            mappedLead.assigned_to = sheetAssignedTo;
            // IMPORTANT: Keep created_by as the importing admin.
            // Some org RLS policies may reject inserts/updates when created_by is set to a different user.
            // Sales visibility is driven by assigned_to anyway.
            mappedLead.created_by = profile.id;
          } else {
            mappedLead.assigned_to = null;
            mappedLead.created_by = profile.id;
          }
        } else {
          const assignment = await assignLead(mappedLead, integration.org_id);
          mappedLead.assigned_to = assignment.assigned_to;
          mappedLead.created_by = assignment.created_by;

          // Keep unassigned leads visible in Leads tab (sales RLS):
          // When a lead ends up unassigned, set created_by to the importing admin user.
          if (!mappedLead.assigned_to) {
            mappedLead.created_by = profile.id;
          }
        }

        // Create lead
        const { data: createdLead, error: createError } = await supabase
          .from('leads')
          .insert(mappedLead)
          .select('id, name, phone, email, assigned_to, created_by, created_at, external_id, custom_fields, source')
          .single();

        if (createError) {
          errors.push(`Lead ${leadData.external_id}: ${createError.message}`);
        } else {
          leadsCreated++;
          if (createdLead) {
            const company = (createdLead as any)?.custom_fields?.company ?? null;
            syncedLeads.push({ ...(createdLead as any), company, was_created: true });
          }
        }

        // Track cursor for Google Sheets
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

    // If this sync request explicitly provided a sheet assignment override (Assign button flow),
    // enforce the assignment on ALL leads belonging to this Google Sheets integration.
    // This makes assignment deterministic even if cursor/dedupe logic skips some rows.
    if (shouldApplySheetAssignment) {
      const assignedTo = sheetAssignedTo || null;
      console.log('[SYNC][GSHEETS] applying bulk assignment', { integrationId: id, assignedTo });

      // Use service role to bypass any RLS issues (this endpoint is admin-only anyway).
      const { error: bulkAssignError } = await adminClient
        .from('leads')
        .update({ assigned_to: assignedTo, updated_at: new Date().toISOString() })
        .eq('org_id', integration.org_id)
        .eq('integration_id', id);

      if (bulkAssignError) {
        console.log('[SYNC][GSHEETS] bulk assignment ERROR', bulkAssignError);
        errors.push(`Bulk assignment failed: ${bulkAssignError.message}`);
      } else {
        try {
          const { count: assignedCount } = await adminClient
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('org_id', integration.org_id)
            .eq('integration_id', id)
            .is('assigned_to', assignedTo);
          console.log('[SYNC][GSHEETS] bulk assignment done', {
            integrationId: id,
            assignedTo,
            assignedCount: assignedCount ?? null,
          });
        } catch (e) {
          console.log('[SYNC][GSHEETS] failed to count assigned leads after bulk assignment', e);
        }
      }
    }

    // For Google Sheets, advance cursor_last_row if we saw any rows.
    // Cursor is stored in integration.config so subsequent polls only read new rows.
    if (integration.platform === 'google_sheets' && typeof maxSheetRowSeen === 'number') {
      const existingConfig = (integration.config as Record<string, unknown>) || {};
      const prev = typeof (existingConfig as any).cursor_last_row === 'number' ? (existingConfig as any).cursor_last_row : 1;
      const next = Math.max(prev, maxSheetRowSeen);
      effectiveConfig = { ...existingConfig, cursor_last_row: next };
    }

        // Update integration
        await supabase
          .from('platform_integrations')
          .update({
            sync_status: errors.length > 0 ? 'error' : 'idle',
            last_sync_at: new Date().toISOString(),
            error_message: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
            ...(integration.platform === 'google_sheets' ? { config: effectiveConfig } : {}),
          })
          .eq('id', id);

        // Log sync operation
        await supabase.from('integration_sync_logs').insert({
          integration_id: id,
      sync_type: 'manual',
      status: errors.length > 0 ? 'partial' : 'success',
      leads_created: leadsCreated,
      leads_updated: leadsUpdated,
      error_message: errors.length > 0 ? errors.join('; ') : null,
    });

    return NextResponse.json({
      success: true,
      leads_created: leadsCreated,
      leads_updated: leadsUpdated,
      synced_leads: integration.platform === 'google_sheets' ? syncedLeads : undefined,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error syncing integration:', error);

    // Update integration status
    const supabase = await createClient();
    await supabase
      .from('platform_integrations')
      .update({
        sync_status: 'error',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', id);

    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

