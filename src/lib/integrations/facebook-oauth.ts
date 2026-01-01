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
    'business_management'
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
}>> {
  const response = await fetch(
    `https://graph.facebook.com/v18.0/me/adaccounts?` +
    `fields=id,name,account_id&` +
    `access_token=${accessToken}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to fetch ad accounts');
  }

  const data = await response.json();
  return data.data || [];
}

