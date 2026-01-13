/**
 * Check whether a list of Meta Instant Form IDs have leads (within a time window).
 * Intended for UX: help users quickly find which forms actually have leads to test import/backfill.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type ReqBody = {
  form_ids?: string[];
  backfill_days?: number; // default 30
};

type LeadPresenceResult = {
  form_id: string;
  has_leads: boolean;
  status: number;
  error?: unknown;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length) as R[];
  let idx = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const current = idx++;
      if (current >= items.length) break;
      // eslint-disable-next-line no-await-in-loop
      results[current] = await mapper(items[current]);
    }
  });

  await Promise.all(workers);
  return results;
}

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

    const body = (await request.json().catch(() => ({}))) as ReqBody;
    const formIds = Array.isArray(body.form_ids) ? body.form_ids.filter(Boolean) : [];
    if (formIds.length === 0) {
      return NextResponse.json({ error: 'form_ids is required' }, { status: 400 });
    }

    const backfillDays =
      typeof body.backfill_days === 'number' && body.backfill_days > 0 ? body.backfill_days : 30;
    const since = new Date();
    since.setDate(since.getDate() - backfillDays);
    const sinceTs = Math.floor(since.getTime() / 1000);

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

    const accessToken = (integration.credentials as any)?.access_token as string | undefined;
    if (!accessToken) {
      return NextResponse.json({ error: 'Integration not connected (missing access token)' }, { status: 400 });
    }

    // Check presence by fetching 1 lead per form. Concurrency kept conservative.
    const results = await mapWithConcurrency(
      formIds,
      8,
      async (formId): Promise<LeadPresenceResult> => {
        const url =
          `https://graph.facebook.com/v18.0/${encodeURIComponent(formId)}/leads?` +
          `fields=id&limit=1&since=${sinceTs}&access_token=${encodeURIComponent(accessToken)}`;
        try {
          const res = await fetch(url);
          const status = res.status;
          const json = await res.json().catch(() => ({})) as any;
          if (!res.ok) {
            return { form_id: formId, has_leads: false, status, error: json?.error || json };
          }
          const hasLeads = Array.isArray(json?.data) && json.data.length > 0;
          return { form_id: formId, has_leads: hasLeads, status };
        } catch (e) {
          return { form_id: formId, has_leads: false, status: 0, error: e instanceof Error ? e.message : e };
        }
      }
    );

    const withLeads = results.filter((r) => r.has_leads).map((r) => r.form_id);
    const failures = results.filter((r) => r.status === 0 || (r.status >= 400 && !r.has_leads));

    return NextResponse.json({
      form_ids: formIds,
      backfill_days: backfillDays,
      since: since.toISOString(),
      with_leads: withLeads,
      results,
      failures_count: failures.length,
    });
  } catch (error) {
    console.error('Error checking lead presence:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

