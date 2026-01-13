/**
 * Facebook OAuth Utility Functions
 * Handles OAuth flow for Facebook Lead Ads integration
 * Supports per-integration App ID and App Secret (multi-tenant)
 */

export function getFacebookAuthUrl(
  integrationId: string,
  redirectUri: string,
  appId: string
): string {
  if (!appId) {
    throw new Error('Facebook App ID is required');
  }

  const scopes = [
    'leads_retrieval',
    'ads_read',
    'ads_management',
    'business_management',
    // Needed to list Pages and their Leadgen Forms (Instant Forms)
    'pages_show_list',
    'pages_read_engagement',
    // Required by Meta to access /{page_id}/leadgen_forms for many pages
    'pages_manage_ads'
  ].join(',');

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: scopes,
    state: integrationId, // Pass integration ID in state
    response_type: 'code',
  });

  return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  appId: string,
  appSecret: string
): Promise<{
  access_token: string;
  token_type: string;
  expires_in?: number;
}> {
  if (!appId || !appSecret) {
    throw new Error('Facebook App ID and App Secret are required');
  }

  const response = await fetch(
    `https://graph.facebook.com/v18.0/oauth/access_token?` +
    `client_id=${appId}&` +
    `client_secret=${appSecret}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `code=${code}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to exchange code for token');
  }

  return await response.json();
}

export async function getLongLivedToken(
  shortLivedToken: string,
  appId: string,
  appSecret: string
): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
}> {
  if (!appId || !appSecret) {
    throw new Error('Facebook App ID and App Secret are required');
  }

  const response = await fetch(
    `https://graph.facebook.com/v18.0/oauth/access_token?` +
    `grant_type=fb_exchange_token&` +
    `client_id=${appId}&` +
    `client_secret=${appSecret}&` +
    `fb_exchange_token=${shortLivedToken}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to get long-lived token');
  }

  return await response.json();
}

export async function getUserAdAccounts(accessToken: string): Promise<Array<{
  id: string;
  name: string;
  account_id: string;
  business?: { id: string; name: string } | null;
}>> {
  // Meta paginates /me/adaccounts. If we only fetch the first page,
  // CRM may show only a subset of accounts the user can access.
  const results: Array<{
    id: string;
    name: string;
    account_id: string;
    business?: { id: string; name: string } | null;
  }> = [];
  const seen = new Set<string>();

  let nextUrl =
    `https://graph.facebook.com/v18.0/me/adaccounts?` +
    // Include owning business (when available) so we can show portfolio context in the UI.
    `fields=id,name,account_id,business{id,name}&` +
    `limit=200&` +
    `access_token=${accessToken}`;

  // Safety cap to avoid infinite loops if Meta returns a bad paging cursor.
  const maxPages = 50;
  let pageCount = 0;

  while (nextUrl && pageCount < maxPages) {
    pageCount += 1;

    const response = await fetch(nextUrl);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        (error as any)?.error?.message || 'Failed to fetch ad accounts'
      );
    }

    const data = await response.json();
    const items = (data?.data || []) as Array<{
      id: string;
      name: string;
      account_id: string;
      business?: { id: string; name: string } | null;
    }>;

    for (const item of items) {
      if (!item?.id) continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      results.push(item);
    }

    nextUrl = (data?.paging?.next as string) || '';
  }

  return results;
}

