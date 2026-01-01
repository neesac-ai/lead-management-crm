/**
 * Lead data transformation utilities
 * Maps platform-specific lead data to CRM lead structure
 */

import type { LeadData, IntegrationMetadata } from './base';
import type { Database } from '@/types/database.types';

type LeadInsert = Database['public']['Tables']['leads']['Insert'];

export interface MappedLead extends Omit<LeadInsert, 'id' | 'created_at' | 'updated_at'> {
  integration_metadata?: IntegrationMetadata;
}

/**
 * Map platform lead data to CRM lead structure
 */
export function mapLeadData(
  leadData: LeadData,
  orgId: string,
  integrationId: string
): MappedLead {
  // Extract campaign data
  const campaignData = leadData.campaign_data;
  
  // Build integration metadata
  const integrationMetadata: IntegrationMetadata = {};
  
  if (campaignData) {
    if (campaignData.campaign_id) {
      integrationMetadata.campaign_id = campaignData.campaign_id;
    }
    if (campaignData.campaign_name) {
      integrationMetadata.campaign_name = campaignData.campaign_name;
    }
    if (campaignData.ad_set_id) {
      integrationMetadata.ad_set_id = campaignData.ad_set_id;
    }
    if (campaignData.ad_id) {
      integrationMetadata.ad_id = campaignData.ad_id;
    }
    if (campaignData.creative_id) {
      integrationMetadata.creative_id = campaignData.creative_id;
    }
  }
  
  // Add any additional metadata from leadData.metadata
  if (leadData.metadata) {
    Object.assign(integrationMetadata, leadData.metadata);
  }

  // Build custom_fields (preserve existing structure)
  const customFields: Record<string, unknown> = {};
  if (leadData.company) {
    customFields.company = leadData.company;
  }

  // Map to CRM lead structure
  const mappedLead: MappedLead = {
    org_id: orgId,
    integration_id: integrationId,
    external_id: leadData.external_id,
    name: leadData.name.trim(),
    email: leadData.email?.trim() || null,
    phone: leadData.phone?.trim() || null,
    source: 'manual', // Will be set based on platform
    status: 'new',
    custom_fields: Object.keys(customFields).length > 0 ? customFields : {},
    integration_metadata: Object.keys(integrationMetadata).length > 0 ? integrationMetadata : undefined,
    // assigned_to will be set by assignment logic
    // created_by will be set by assignment logic or remain null
  };

  return mappedLead;
}

/**
 * Determine source string from platform
 */
export function getSourceFromPlatform(platform: string): string {
  const sourceMap: Record<string, string> = {
    facebook: 'facebook',
    whatsapp: 'whatsapp',
    linkedin: 'linkedin',
    instagram: 'instagram',
  };
  
  return sourceMap[platform.toLowerCase()] || 'manual';
}

/**
 * Validate mapped lead data
 */
export function validateMappedLead(lead: MappedLead): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!lead.name || lead.name.trim().length === 0) {
    errors.push('Lead name is required');
  }

  if (!lead.email && !lead.phone) {
    errors.push('Lead must have either email or phone');
  }

  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    errors.push('Invalid email format');
  }

  if (!lead.org_id) {
    errors.push('Organization ID is required');
  }

  if (!lead.integration_id) {
    errors.push('Integration ID is required');
  }

  if (!lead.external_id) {
    errors.push('External ID is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

