/**
 * Fetch Meta Lead Forms (Instant Forms) available to the connected account.
 * Returns a flattened list of leadgen forms across pages the user can access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type MetaPage = { id: string; name?: string; access_token?: string };
type MetaForm = { id: string; name?: string; status?: string };
type MetaAd = {
  id: string;
  campaign_id?: string;
  creative?: {
    object_story_spec?: unknown;
    asset_feed_spec?: unknown;
  };
};

async function fetchAllPages(accessToken: string): Promise<MetaPage[]> {
  const pages: MetaPage[] = [];
  let url =
    `https://graph.facebook.com/v18.0/me/accounts?` +
    `fields=id,name,access_token&limit=100&access_token=${accessToken}`;

  for (let i = 0; i < 20 && url; i++) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch pages: ${res.status}`);
    }
    const json = (await res.json()) as { data?: MetaPage[]; paging?: { next?: string } };
    pages.push(...(json.data || []));
    url = json.paging?.next || '';
  }

  return pages;
}

function extractLeadGenFormIdsFromCreativePayload(payload: unknown): string[] {
  // Lead form IDs can appear in multiple places depending on creative type.
  // We defensively scan common paths used by Lead Ads creatives.
  const ids = new Set<string>();
  const p = payload as any;

  const maybeAdd = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) ids.add(v.trim());
  };

  // Common: object_story_spec.link_data.call_to_action.value.lead_gen_form_id
  maybeAdd(p?.link_data?.call_to_action?.value?.lead_gen_form_id);
  // Sometimes: object_story_spec.video_data.call_to_action.value.lead_gen_form_id
  maybeAdd(p?.video_data?.call_to_action?.value?.lead_gen_form_id);
  // Sometimes: object_story_spec.template_data.call_to_action.value.lead_gen_form_id
  maybeAdd(p?.template_data?.call_to_action?.value?.lead_gen_form_id);

  // Some feeds can embed call_to_action in multiple child attachments
  const attachments = p?.link_data?.child_attachments;
  if (Array.isArray(attachments)) {
    for (const a of attachments) {
      maybeAdd(a?.call_to_action?.value?.lead_gen_form_id);
    }
  }

  // Asset feed spec can contain call_to_action values too
  const assetCtas = p?.call_to_action_types;
  if (Array.isArray(assetCtas)) {
    // no-op (types only)
  }
  const assetLinks = p?.link_urls;
  if (Array.isArray(assetLinks)) {
    for (const l of assetLinks) {
      maybeAdd(l?.call_to_action?.value?.lead_gen_form_id);
    }
  }

  return Array.from(ids);
}

async function fetchLeadGenFormIdsUsedByAdAccount(accessToken: string, adAccountId: string): Promise<string[]> {
  // Ad Account IDs may be in either "act_<id>" form or raw numeric string.
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const formIds = new Set<string>();

  let url =
    `https://graph.facebook.com/v18.0/${actId}/ads?` +
    `fields=id,creative{object_story_spec,asset_feed_spec}&limit=100&access_token=${accessToken}`;

  for (let i = 0; i < 20 && url; i++) {
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any)?.error?.message || `Failed to fetch ads for ${actId}`);
    }
    const json = (await res.json()) as { data?: MetaAd[]; paging?: { next?: string } };
    const ads = json.data || [];

    for (const ad of ads) {
      const objectStory = (ad as any)?.creative?.object_story_spec;
      const assetFeed = (ad as any)?.creative?.asset_feed_spec;
      for (const id of extractLeadGenFormIdsFromCreativePayload(objectStory)) formIds.add(id);
      for (const id of extractLeadGenFormIdsFromCreativePayload(assetFeed)) formIds.add(id);
    }

    url = json.paging?.next || '';
  }

  return Array.from(formIds);
}

async function fetchCampaignNames(
  accessToken: string,
  campaignIds: string[]
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const ids = Array.from(new Set(campaignIds)).filter(Boolean);
  const chunkSize = 50;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const url =
      `https://graph.facebook.com/v18.0/?` +
      `ids=${encodeURIComponent(chunk.join(','))}&` +
      `fields=name&` +
      `access_token=${accessToken}`;
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(url);
    if (!res.ok) {
      // Best-effort: don't fail the whole forms fetch if campaign names can't be resolved.
      // eslint-disable-next-line no-continue
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const json = await res.json() as Record<string, { name?: string }>;
    for (const [id, obj] of Object.entries(json)) {
      if (obj?.name) out[id] = obj.name;
    }
  }

  return out;
}

async function fetchLeadGenFormUsageByAdAccount(
  accessToken: string,
  adAccountId: string
): Promise<{
  formIds: Set<string>;
  campaignIdsByFormId: Record<string, Set<string>>;
}> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const formIds = new Set<string>();
  const campaignIdsByFormId: Record<string, Set<string>> = {};

  let url =
    `https://graph.facebook.com/v18.0/${actId}/ads?` +
    `fields=id,campaign_id,creative{object_story_spec,asset_feed_spec}&limit=100&access_token=${accessToken}`;

  for (let i = 0; i < 20 && url; i++) {
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any)?.error?.message || `Failed to fetch ads for ${actId}`);
    }
    const json = (await res.json()) as { data?: MetaAd[]; paging?: { next?: string } };
    const ads = json.data || [];

    for (const ad of ads) {
      const campaignId = (ad as any)?.campaign_id as string | undefined;
      const objectStory = (ad as any)?.creative?.object_story_spec;
      const assetFeed = (ad as any)?.creative?.asset_feed_spec;
      const ids = [
        ...extractLeadGenFormIdsFromCreativePayload(objectStory),
        ...extractLeadGenFormIdsFromCreativePayload(assetFeed),
      ];
      for (const id of ids) {
        formIds.add(id);
        if (campaignId) {
          if (!campaignIdsByFormId[id]) campaignIdsByFormId[id] = new Set<string>();
          campaignIdsByFormId[id].add(campaignId);
        }
      }
    }

    url = json.paging?.next || '';
  }

  return { formIds, campaignIdsByFormId };
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];
      // eslint-disable-next-line no-await-in-loop
      const r = await worker(item);
      results[currentIndex] = r;
    }
  });

  await Promise.all(runners);
  return results;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const debugFormId = request.nextUrl.searchParams.get('debug_form_id') || undefined;
    const adAccountIdFilter = request.nextUrl.searchParams.get('ad_account_id') || undefined;
    const includeCampaigns = request.nextUrl.searchParams.get('include_campaigns') !== '0';

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

    if (integration.platform !== 'facebook' && integration.platform !== 'instagram') {
      return NextResponse.json(
        { error: `Lead form fetching not supported for ${integration.platform}` },
        { status: 501 }
      );
    }

    const accessToken = (integration.credentials as Record<string, unknown>)?.access_token as string | undefined;
    if (!accessToken) {
      return NextResponse.json({ error: 'Integration not connected (missing access token)' }, { status: 400 });
    }

    // Debug helper: resolve which Page owns a given lead form ID.
    // Meta UI often hides the owning page, but Graph can return it.
    if (debugFormId) {
      // Attempt 1: direct lookup (may fail if token lacks permission to read the form object)
      const directRes = await fetch(
        `https://graph.facebook.com/v18.0/${encodeURIComponent(debugFormId)}?` +
          `fields=id,name,status,page{id,name}&access_token=${accessToken}`
      );

      if (directRes.ok) {
        const json = await directRes.json();
        return NextResponse.json({
          form: {
            id: json?.id,
            name: json?.name,
            status: json?.status,
          },
          page: json?.page ? { id: json.page.id, name: json.page.name } : null,
          resolved_via: 'direct',
        });
      }

      const directErr = await directRes.json().catch(() => ({}));

      // Attempt 2: scan accessible Pages and their leadgen forms using Page tokens.
      // This works in cases where the user token can't read the form object, but can list forms on a Page.
      let pages: MetaPage[] = [];
      try {
        pages = await fetchAllPages(accessToken);
      } catch (e) {
        return NextResponse.json(
          {
            error: 'Failed to resolve form owner page',
            status: directRes.status,
            details: directErr,
            page_scan_error: e instanceof Error ? e.message : 'Unknown error',
          },
          { status: 502 }
        );
      }

      const scanWarnings: Array<{ page_id: string; page_name: string; status?: number; details?: unknown }> = [];
      let resolved:
        | { page: { id: string; name: string }; form: { id: string; name?: string; status?: string } }
        | null = null;

      await runWithConcurrency(pages, 6, async (page) => {
        if (resolved) return null;
        const pageId = page.id;
        const pageName = page.name || pageId;
        const pageToken = page.access_token;

        if (!pageToken) {
          return null;
        }

        const formsRes = await fetch(
          `https://graph.facebook.com/v18.0/${pageId}/leadgen_forms?fields=id,name,status&limit=200&access_token=${pageToken}`
        );
        if (!formsRes.ok) {
          const err = await formsRes.json().catch(() => ({}));
          scanWarnings.push({ page_id: pageId, page_name: pageName, status: formsRes.status, details: err });
          return null;
        }

        const formsJson = (await formsRes.json()) as { data?: MetaForm[] };
        const forms = formsJson.data || [];
        const match = forms.find((f) => f.id === debugFormId);
        if (match) {
          resolved = {
            page: { id: pageId, name: pageName },
            form: { id: match.id, name: match.name, status: match.status },
          };
        }

        return null;
      });

      if (resolved) {
        return NextResponse.json({
          ...resolved,
          resolved_via: 'page_scan',
          direct_lookup_error: directErr,
        });
      }

      return NextResponse.json(
        {
          error: 'Failed to resolve form owner page',
          status: directRes.status,
          details: directErr,
          pages_total: pages.length,
          pages_with_token: pages.filter((p) => Boolean(p.access_token)).length,
          warnings: scanWarnings.slice(0, 10),
        },
        { status: 502 }
      );
    }

    // Optional: filter to only forms used by ads in a specific ad account.
    // Note: Forms are still Page-owned; this is derived by scanning ad creatives for lead_gen_form_id.
    let adAccountFormIds: Set<string> | undefined;
    let adAccountFormIdsCount: number | undefined;
    let adAccountFilterWarning: string | undefined;
    let adAccountCampaignIdsByFormId: Record<string, Set<string>> | undefined;
    let adAccountCampaignNameById: Record<string, string> | undefined;
    if (adAccountIdFilter) {
      try {
        const usage = await fetchLeadGenFormUsageByAdAccount(accessToken, adAccountIdFilter);
        adAccountFormIds = usage.formIds;
        adAccountCampaignIdsByFormId = usage.campaignIdsByFormId;
        adAccountFormIdsCount = usage.formIds.size;

        if (includeCampaigns) {
          const campaignIds = Object.values(usage.campaignIdsByFormId).flatMap((s) => Array.from(s));
          adAccountCampaignNameById = await fetchCampaignNames(accessToken, campaignIds);
        }

        if (usage.formIds.size === 0) {
          adAccountFilterWarning =
            'No lead form IDs were discovered from ads in this ad account. Showing 0 forms for this filter.';
        }
      } catch (e) {
        adAccountFilterWarning = e instanceof Error ? e.message : 'Failed to derive forms from ad account ads';
      }
    }

    // Get pages the user can access (paginated)
    let pages: MetaPage[] = [];
    try {
      pages = await fetchAllPages(accessToken);
    } catch (e) {
      return NextResponse.json(
        { error: 'Failed to fetch pages', details: e instanceof Error ? e.message : 'Unknown error' },
        { status: 502 }
      );
    }

    const formsMap = new Map<
      string,
      {
        id: string;
        name: string;
        status?: string;
        page?: { id: string; name: string };
        campaigns?: Array<{ id: string; name?: string }>;
      }
    >();
    const warnings: Array<{ page_id: string; page_name: string; status?: number; details?: unknown }> = [];
    const pagesMissingToken: Array<{ page_id: string; page_name: string }> = [];

    // Fetch leadgen forms for each page (parallel, limited concurrency)
    await runWithConcurrency(pages, 6, async (page) => {
      const pageId = page.id;
      const pageName = page.name || pageId;
      const pageToken = page.access_token;

      if (!pageToken) {
        warnings.push({ page_id: pageId, page_name: pageName, details: 'Missing page access token' });
        pagesMissingToken.push({ page_id: pageId, page_name: pageName });
        return null;
      }

      const formsRes = await fetch(
        `https://graph.facebook.com/v18.0/${pageId}/leadgen_forms?fields=id,name,status&access_token=${pageToken}`
      );

      if (!formsRes.ok) {
        const err = await formsRes.json().catch(() => ({}));
        warnings.push({ page_id: pageId, page_name: pageName, status: formsRes.status, details: err });
        return null;
      }

      const formsJson = (await formsRes.json()) as { data?: MetaForm[] };
      const forms = formsJson.data || [];

      for (const f of forms) {
        if (!f.id) continue;
        if (adAccountFormIds && !adAccountFormIds.has(f.id)) continue;
        const name = (f.name || f.id).trim();
        const displayName = pages.length > 1 ? `${name} — ${pageName}` : name;
        const campaigns = (() => {
          if (!adAccountIdFilter || !includeCampaigns) return undefined;
          const ids = adAccountCampaignIdsByFormId?.[f.id];
          if (!ids || ids.size === 0) return [];
          return Array.from(ids).map((cid) => ({
            id: cid,
            name: adAccountCampaignNameById?.[cid],
          }));
        })();

        formsMap.set(f.id, {
          id: f.id,
          name: displayName,
          status: f.status,
          page: { id: pageId, name: pageName },
          campaigns,
        });
      }

      return null;
    });

    const forms = Array.from(formsMap.values());
    forms.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      forms,
      pages_total: pages.length,
      pages_failed: warnings.length,
      pages_with_token: pages.length - pagesMissingToken.length,
      pages_missing_token: pagesMissingToken.length,
      ad_account_id: adAccountIdFilter,
      ad_account_form_ids_count: adAccountFormIdsCount,
      ad_account_filter_warning: adAccountFilterWarning,
      include_campaigns: includeCampaigns,
      // Helpful for debugging "0 forms found" cases without dumping huge payloads
      pages_sample: pages.slice(0, 10).map((p) => ({
        id: p.id,
        name: p.name,
        has_access_token: Boolean(p.access_token),
      })),
      warnings: warnings.length > 0 ? warnings.slice(0, 10) : undefined,
    });
  } catch (error) {
    console.error('Error fetching lead forms:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


