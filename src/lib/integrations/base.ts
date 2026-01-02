/**
 * Base integration interface and types
 * All platform integrations must implement this interface
 */

export type Platform = 'facebook' | 'whatsapp' | 'linkedin' | 'instagram';

export type SyncType = 'webhook' | 'manual' | 'scheduled';

export type SyncStatus = 'idle' | 'syncing' | 'error';

export interface IntegrationCredentials {
  [key: string]: unknown;
  // Platform-specific credentials (access tokens, API keys, etc.)
}

export interface IntegrationConfig {
  [key: string]: unknown;
  // Platform-specific configuration
}

export interface CampaignData {
  campaign_id: string;
  campaign_name?: string;
  ad_set_id?: string;
  ad_id?: string;
  creative_id?: string;
  [key: string]: unknown; // Additional platform-specific fields
}

export interface LeadData {
  // Core lead fields
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  
  // Integration-specific fields
  external_id: string; // Platform-specific lead ID
  campaign_data?: CampaignData;
  metadata?: Record<string, unknown>; // Additional platform-specific data
  
  // Timestamps
  created_at?: string;
}

export interface IntegrationMetadata {
  campaign_id?: string;
  campaign_name?: string;
  ad_set_id?: string;
  ad_id?: string;
  creative_id?: string;
  [key: string]: unknown;
}

/**
 * Base interface that all platform integrations must implement
 */
export interface BaseIntegration {
  /**
   * Platform identifier
   */
  platform: Platform;

  /**
   * Integration name/display name
   */
  name: string;

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): boolean;

  /**
   * Extract lead data from webhook payload
   */
  extractLeadFromWebhook(payload: unknown): LeadData | null;

  /**
   * Fetch leads from platform API (for polling)
   */
  fetchLeads(
    credentials: IntegrationCredentials,
    config: IntegrationConfig,
    since?: Date
  ): Promise<LeadData[]>;

  /**
   * Fetch campaigns from platform
   */
  fetchCampaigns(
    credentials: IntegrationCredentials,
    config: IntegrationConfig
  ): Promise<Array<{ id: string; name: string; [key: string]: unknown }>>;

  /**
   * Test connection to platform
   */
  testConnection(
    credentials: IntegrationCredentials,
    config: IntegrationConfig
  ): Promise<{ success: boolean; message?: string }>;
}

/**
 * Base integration class with common functionality
 */
export abstract class BaseIntegrationClass implements BaseIntegration {
  abstract platform: Platform;
  abstract name: string;

  /**
   * Verify webhook signature (platform-specific implementation required)
   */
  abstract verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): boolean;

  /**
   * Extract lead data from webhook payload (platform-specific implementation required)
   */
  abstract extractLeadFromWebhook(payload: unknown): LeadData | null;

  /**
   * Fetch leads from platform API (platform-specific implementation required)
   */
  abstract fetchLeads(
    credentials: IntegrationCredentials,
    config: IntegrationConfig,
    since?: Date
  ): Promise<LeadData[]>;

  /**
   * Fetch campaigns from platform (platform-specific implementation required)
   */
  abstract fetchCampaigns(
    credentials: IntegrationCredentials,
    config: IntegrationConfig
  ): Promise<Array<{ id: string; name: string; [key: string]: unknown }>>;

  /**
   * Test connection to platform (platform-specific implementation required)
   */
  abstract testConnection(
    credentials: IntegrationCredentials,
    config: IntegrationConfig
  ): Promise<{ success: boolean; message?: string }>;

  /**
   * Normalize phone number format
   */
  protected normalizePhone(phone: string | undefined): string | undefined {
    if (!phone) return undefined;
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    // Return if empty
    if (!digits) return undefined;
    return digits;
  }

  /**
   * Normalize email format
   */
  protected normalizeEmail(email: string | undefined): string | undefined {
    if (!email) return undefined;
    const trimmed = email.trim().toLowerCase();
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return undefined;
    return trimmed;
  }

  /**
   * Extract campaign data from lead data
   */
  protected extractCampaignData(leadData: LeadData): CampaignData | undefined {
    return leadData.campaign_data;
  }
}

