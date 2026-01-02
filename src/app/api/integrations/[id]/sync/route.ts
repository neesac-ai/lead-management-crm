/**
 * Manual Sync Trigger API
 * Manually triggers a sync of leads from the platform
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { FacebookIntegration } from '@/lib/integrations/facebook';
import { mapLeadData, validateMappedLead, getSourceFromPlatform } from '@/lib/integrations/mapper';
import { assignLead } from '@/lib/integrations/assignment';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

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

    // Determine since date (last sync or 24 hours ago)
    let since: Date | undefined;
    if (integration.last_sync_at) {
      since = new Date(integration.last_sync_at);
    } else {
      since = new Date();
      since.setHours(since.getHours() - 24);
    }

    // Fetch leads from platform
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
          continue; // Skip duplicates
        }

        // Map lead data
        const mappedLead = mapLeadData(leadData, integration.org_id, integration.id);
        mappedLead.source = getSourceFromPlatform(integration.platform);

        // Validate
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

