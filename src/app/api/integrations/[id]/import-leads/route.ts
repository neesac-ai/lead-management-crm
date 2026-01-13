/**
 * Import selected preview leads into CRM leads table.
 * - Enforces phone is required (per BharatCRM lead format requirement)
 * - Dedupe by external_id (org scoped)
 * - Assigns using lead_form_assignments (via integration_metadata.form_id)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mapLeadData, getSourceFromPlatform, validateMappedLead } from '@/lib/integrations/mapper';
import { assignLead } from '@/lib/integrations/assignment';
import type { LeadData } from '@/lib/integrations/base';

type ImportLead = {
  external_id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  form_id?: string | null;
  created_at?: string | null;
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

    const body = (await request.json().catch(() => ({}))) as { leads?: ImportLead[] };
    const leads = Array.isArray(body.leads) ? body.leads : [];
    if (leads.length === 0) {
      return NextResponse.json({ error: 'leads is required' }, { status: 400 });
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
      return NextResponse.json({ error: 'Integration is not active' }, { status: 400 });
    }

    const source = getSourceFromPlatform(integration.platform);

    let created = 0;
    let skippedDuplicates = 0;
    let skippedMissingPhone = 0;
    const errors: string[] = [];

    for (const l of leads) {
      try {
        if (!l?.external_id) continue;

        // Phone required (business rule for Leads tab)
        const phone = (l.phone || '').trim();
        if (!phone) {
          skippedMissingPhone++;
          continue;
        }

        // Dedupe by external_id
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .eq('org_id', integration.org_id)
          .eq('external_id', l.external_id)
          .single();

        if (existingLead) {
          skippedDuplicates++;
          continue;
        }

        const leadData: LeadData = {
          name: (l.name || 'Unknown').toString(),
          phone,
          email: l.email ? l.email.toString() : undefined,
          company: l.company ? l.company.toString() : undefined,
          external_id: l.external_id,
          metadata: {
            form_id: l.form_id || undefined,
          },
          created_at: l.created_at || undefined,
        };

        const mappedLead = mapLeadData(leadData, integration.org_id, integration.id);
        mappedLead.source = source;

        const validation = validateMappedLead(mappedLead);
        if (!validation.valid) {
          errors.push(`Lead ${l.external_id}: ${validation.errors.join(', ')}`);
          continue;
        }

        const assignment = await assignLead(mappedLead, integration.org_id);
        mappedLead.assigned_to = assignment.assigned_to;
        mappedLead.created_by = assignment.created_by;

        // Important for Leads tab visibility:
        // Sales users only see unassigned leads if created_by is set to themselves.
        // For integration backfills that end up unassigned, set created_by to the importer (admin).
        if (!mappedLead.assigned_to) {
          mappedLead.created_by = profile.id;
        }

        const { error: createError } = await supabase
          .from('leads')
          .insert(mappedLead);

        if (createError) {
          errors.push(`Lead ${l.external_id}: ${createError.message}`);
          continue;
        }

        created++;
      } catch (e) {
        errors.push(`Lead ${l.external_id}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      created,
      skipped_duplicates: skippedDuplicates,
      skipped_missing_phone: skippedMissingPhone,
      errors: errors.length > 0 ? errors.slice(0, 50) : undefined,
    });
  } catch (error) {
    console.error('Error importing leads:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

