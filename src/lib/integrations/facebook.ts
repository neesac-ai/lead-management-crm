/**
 * Facebook Lead Ads Integration
 * Handles OAuth, webhooks, and API polling for Facebook Lead Ads
 */

import crypto from 'crypto';
import { BaseIntegrationClass, type LeadData, type IntegrationCredentials, type IntegrationConfig } from './base';

export class FacebookIntegration extends BaseIntegrationClass {
  platform = 'facebook' as const;
  name = 'Facebook Lead Ads';

  /**
   * Verify Facebook webhook signature
   * Facebook uses HMAC SHA256 with the app secret
   */
  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): boolean {
    try {
      const payloadString = typeof payload === 'string' ? payload : payload.toString('utf-8');
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex');
      
      // Facebook sends signature as 'sha256=<hash>'
      const receivedHash = signature.replace('sha256=', '');
      
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(receivedHash)
      );
    } catch (error) {
      console.error('Error verifying Facebook webhook signature:', error);
      return false;
    }
  }

  /**
   * Extract lead data from Facebook webhook payload
   * Facebook webhook format: https://developers.facebook.com/docs/graph-api/webhooks/reference/leadgen
   */
  extractLeadFromWebhook(payload: unknown): LeadData | null {
    try {
      // Facebook webhook structure
      const webhook = payload as {
        entry?: Array<{
          changes?: Array<{
            value?: {
              leadgen_id?: string;
              form_id?: string;
              page_id?: string;
              adgroup_id?: string;
              ad_id?: string;
              created_time?: number;
              field_data?: Array<{
                name?: string;
                values?: string[];
              }>;
            };
          }>;
        }>;
      };

      if (!webhook.entry || webhook.entry.length === 0) {
        return null;
      }

      const entry = webhook.entry[0];
      if (!entry.changes || entry.changes.length === 0) {
        return null;
      }

      const change = entry.changes[0];
      const value = change.value;
      if (!value || !value.leadgen_id) {
        return null;
      }

      // Extract field data
      const fieldData: Record<string, string> = {};
      if (value.field_data) {
        for (const field of value.field_data) {
          if (field.name && field.values && field.values.length > 0) {
            fieldData[field.name] = field.values[0];
          }
        }
      }

      // Map common Facebook fields
      const name = fieldData.full_name || fieldData.first_name || fieldData.name || '';
      const email = fieldData.email || '';
      const phone = fieldData.phone_number || fieldData.phone || '';
      const company = fieldData.company_name || fieldData.company || '';

      // Build campaign data
      const campaignData = {
        campaign_id: value.adgroup_id || '',
        ad_set_id: value.adgroup_id || '',
        ad_id: value.ad_id || '',
        form_id: value.form_id || '',
        page_id: value.page_id || '',
      };

      return {
        name: name.trim() || 'Unknown',
        email: this.normalizeEmail(email) || undefined,
        phone: this.normalizePhone(phone) || undefined,
        company: company || undefined,
        external_id: value.leadgen_id,
        campaign_data: campaignData,
        metadata: {
          form_id: value.form_id,
          page_id: value.page_id,
          created_time: value.created_time,
          field_data: fieldData,
        },
        created_at: value.created_time ? new Date(value.created_time * 1000).toISOString() : undefined,
      };
    } catch (error) {
      console.error('Error extracting lead from Facebook webhook:', error);
      return null;
    }
  }

  /**
   * Fetch leads from Facebook Graph API
   * API: GET /{form-id}/leads
   */
  async fetchLeads(
    credentials: IntegrationCredentials,
    config: IntegrationConfig,
    since?: Date
  ): Promise<LeadData[]> {
    try {
      const accessToken = credentials.access_token as string;
      const formId = config.form_id as string;

      if (!accessToken || !formId) {
        throw new Error('Missing access_token or form_id in credentials/config');
      }

      const leads: LeadData[] = [];
      let url = `https://graph.facebook.com/v18.0/${formId}/leads?access_token=${accessToken}`;

      // Add since parameter if provided
      if (since) {
        const sinceTimestamp = Math.floor(since.getTime() / 1000);
        url += `&since=${sinceTimestamp}`;
      }

      // Fetch leads (handle pagination if needed)
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Facebook API error: ${response.statusText}`);
      }

      const data = await response.json() as {
        data?: Array<{
          id: string;
          created_time: string;
          field_data?: Array<{
            name: string;
            values: string[];
          }>;
          ad_id?: string;
          ad_name?: string;
          adset_id?: string;
          adset_name?: string;
          campaign_id?: string;
          campaign_name?: string;
        }>;
        paging?: {
          next?: string;
        };
      };

      if (!data.data) {
        return leads;
      }

      // Transform Facebook leads to LeadData
      for (const fbLead of data.data) {
        const fieldData: Record<string, string> = {};
        if (fbLead.field_data) {
          for (const field of fbLead.field_data) {
            if (field.values && field.values.length > 0) {
              fieldData[field.name] = field.values[0];
            }
          }
        }

        const name = fieldData.full_name || fieldData.first_name || fieldData.name || '';
        const email = fieldData.email || '';
        const phone = fieldData.phone_number || fieldData.phone || '';
        const company = fieldData.company_name || fieldData.company || '';

        leads.push({
          name: name.trim() || 'Unknown',
          email: this.normalizeEmail(email) || undefined,
          phone: this.normalizePhone(phone) || undefined,
          company: company || undefined,
          external_id: fbLead.id,
          campaign_data: {
            campaign_id: fbLead.campaign_id || fbLead.adset_id || '',
            campaign_name: fbLead.campaign_name || fbLead.adset_name || '',
            ad_set_id: fbLead.adset_id || '',
            ad_id: fbLead.ad_id || '',
          },
          metadata: {
            ad_name: fbLead.ad_name,
            form_id: formId,
            field_data: fieldData,
          },
          created_at: fbLead.created_time,
        });
      }

      return leads;
    } catch (error) {
      console.error('Error fetching leads from Facebook:', error);
      throw error;
    }
  }

  /**
   * Fetch campaigns from Facebook Graph API
   * API: GET /{ad-account-id}/campaigns
   */
  async fetchCampaigns(
    credentials: IntegrationCredentials,
    config: IntegrationConfig
  ): Promise<Array<{ id: string; name: string; [key: string]: unknown }>> {
    try {
      const accessToken = credentials.access_token as string;
      const adAccountId = config.ad_account_id as string;

      if (!accessToken || !adAccountId) {
        throw new Error('Missing access_token or ad_account_id in credentials/config');
      }

      const url = `https://graph.facebook.com/v18.0/${adAccountId}/campaigns?fields=id,name,status&access_token=${accessToken}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Facebook API error: ${response.statusText}`);
      }

      const data = await response.json() as {
        data?: Array<{
          id: string;
          name: string;
          status?: string;
        }>;
      };

      if (!data.data) {
        return [];
      }

      return data.data.map(campaign => ({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
      }));
    } catch (error) {
      console.error('Error fetching campaigns from Facebook:', error);
      throw error;
    }
  }

  /**
   * Test connection to Facebook Graph API
   */
  async testConnection(
    credentials: IntegrationCredentials,
    config: IntegrationConfig
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const accessToken = credentials.access_token as string;

      if (!accessToken) {
        return { success: false, message: 'Missing access_token' };
      }

      // Test by fetching user info
      const url = `https://graph.facebook.com/v18.0/me?access_token=${accessToken}`;
      const response = await fetch(url);

      if (!response.ok) {
        const error = await response.json() as { error?: { message?: string } };
        return {
          success: false,
          message: error.error?.message || 'Failed to connect to Facebook API',
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

