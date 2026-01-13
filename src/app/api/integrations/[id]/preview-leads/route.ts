/**
 * Preview/Backfill Meta leads for selected Instant Forms.
 * - Reads from Meta API (via integration fetchLeads)
 * - Does NOT insert into CRM leads table
 * - Groups results by assigned sales rep (lead_form_assignments)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { FacebookIntegration } from '@/lib/integrations/facebook';
import { InstagramIntegration } from '@/lib/integrations/instagram';
import type { LeadData } from '@/lib/integrations/base';

type PreviewLead = {
  external_id: string;
  created_at?: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  source: 'facebook' | 'instagram';
  form_id?: string | null;
};

type AssignmentRow = {
  form_id: string;
  assigned_to: string;
  is_active: boolean;
  assigned_user: { id: string; name: string; email: string } | null;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, role, org_id')
      .eq('auth_id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      form_ids?: string[];
      backfill_days?: number; // recommended: 7/30/90
      since_iso?: string; // optional override
      limit?: number; // max leads returned
    };

    const formIds = Array.isArray(body.form_ids) ? body.form_ids.filter(Boolean) : [];
    if (formIds.length === 0) {
      return NextResponse.json({ error: 'form_ids is required' }, { status: 400 });
    }

    const limit =
      typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 2000) : 500;

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
      return NextResponse.json({ error: 'Integration is not active' }, { status: 400 });
    }

    const platform = integration.platform as 'facebook' | 'instagram' | string;
    if (platform !== 'facebook' && platform !== 'instagram') {
      return NextResponse.json(
        { error: `Lead preview not implemented for ${integration.platform}` },
        { status: 501 }
      );
    }

    // Determine since (optional)
    let since: Date | undefined;
    if (typeof body.since_iso === 'string') {
      const d = new Date(body.since_iso);
      if (!Number.isNaN(d.getTime())) since = d;
    } else if (typeof body.backfill_days === 'number' && body.backfill_days > 0) {
      since = new Date();
      since.setDate(since.getDate() - body.backfill_days);
    }

    // Integration instance
    const integrationInstance =
      platform === 'facebook' ? new FacebookIntegration() : new InstagramIntegration();

    // Load assignments for grouping (only for these forms)
    const { data: assignmentRows } = await supabase
      .from('lead_form_assignments')
      .select(
        'form_id, assigned_to, is_active, assigned_user:users!lead_form_assignments_assigned_to_fkey(id, name, email)'
      )
      .eq('integration_id', id)
      .eq('org_id', integration.org_id)
      .in('form_id', formIds)
      .eq('is_active', true);

    const assignmentByFormId: Record<string, AssignmentRow> = {};
    for (const row of (assignmentRows || []) as unknown as AssignmentRow[]) {
      if (row?.form_id) assignmentByFormId[row.form_id] = row;
    }

    // Fetch leads from Meta (no insert)
    const cfg = { ...(integration.config as Record<string, unknown>), selected_forms: formIds };
    const leadDataRows = (await integrationInstance.fetchLeads(
      integration.credentials as Record<string, unknown>,
      cfg,
      since
    )) as LeadData[];

    const leads: PreviewLead[] = [];
    for (const ld of leadDataRows || []) {
      if (!ld?.external_id) continue;
      const formId =
        (ld.metadata as { form_id?: string } | undefined)?.form_id ||
        (ld.campaign_data as { form_id?: string } | undefined)?.form_id ||
        undefined;

      leads.push({
        external_id: ld.external_id,
        created_at: ld.created_at,
        name: ld.name || 'Unknown',
        phone: ld.phone ?? null,
        email: ld.email ?? null,
        company: ld.company ?? null,
        source: platform,
        form_id: formId || null,
      });

      if (leads.length >= limit) break;
    }

    // Group by assigned rep (based on form assignment)
    type Group = {
      assigned_to: string | null;
      assigned_user: { id: string; name: string; email: string } | null;
      leads: PreviewLead[];
    };

    const groupsMap = new Map<string, Group>();
    const unassignedKey = '__unassigned__';

    for (const l of leads) {
      const formId = l.form_id || '';
      const assignment = formId ? assignmentByFormId[formId] : undefined;
      const key = assignment?.assigned_to || unassignedKey;
      const existing = groupsMap.get(key);
      if (existing) {
        existing.leads.push(l);
      } else {
        groupsMap.set(key, {
          assigned_to: assignment?.assigned_to || null,
          assigned_user: assignment?.assigned_user || null,
          leads: [l],
        });
      }
    }

    const groups = Array.from(groupsMap.values()).sort((a, b) => {
      if (a.assigned_to && !b.assigned_to) return -1;
      if (!a.assigned_to && b.assigned_to) return 1;
      const an = a.assigned_user?.name || 'Unassigned';
      const bn = b.assigned_user?.name || 'Unassigned';
      return an.localeCompare(bn);
    });

    return NextResponse.json({
      form_ids: formIds,
      since: since?.toISOString() || null,
      limit,
      groups,
    });
  } catch (error) {
    console.error('Error previewing leads:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

