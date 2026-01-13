/**
 * Lead assignment logic with campaign-based priority
 * Handles assignment of leads from integrations and manual creation
 */

import type { Database } from '@/types/database.types';
import { createClient } from '@/lib/supabase/server';

type LeadInsert = Database['public']['Tables']['leads']['Insert'];
type User = Database['public']['Tables']['users']['Row'];

export interface AssignmentResult {
  assigned_to: string | null;
  created_by: string | null;
  assignment_method: 'form' | 'campaign' | 'sales_auto' | 'percentage' | 'round_robin' | 'unassigned';
}

/**
 * Assign lead based on campaign, then fallback to existing logic
 */
export async function assignLead(
  lead: LeadInsert,
  orgId: string,
  createdByUserId?: string | null
): Promise<AssignmentResult> {
  const supabase = await createClient();

  // Priority 1: Form-based assignment (only for integration leads)
  // For Meta Instant Forms, form_id is the most reliable routing key.
  if (lead.integration_id && lead.integration_metadata) {
    const formId = (lead.integration_metadata as { form_id?: string })?.form_id;

    // IMPORTANT BUSINESS RULE:
    // If this is an integration lead with a form_id but there is NO active form assignment,
    // we intentionally keep the lead UNASSIGNED (do NOT fall back to round-robin/percentage/campaign).
    if (formId) {
      const formAssignment = await getLeadFormAssignment(orgId, lead.integration_id, formId);
      if (formAssignment) {
        return {
          assigned_to: formAssignment.assigned_to,
          created_by: formAssignment.assigned_to,
          assignment_method: 'form',
        };
      }

      return {
        assigned_to: null,
        created_by: createdByUserId || null,
        assignment_method: 'unassigned',
      };
    }
  }

  // Priority 2: Campaign-based assignment (only for integration leads)
  if (lead.integration_id && lead.integration_metadata) {
    const campaignId = (lead.integration_metadata as { campaign_id?: string })?.campaign_id;

    if (campaignId) {
      const campaignAssignment = await getCampaignAssignment(
        orgId,
        lead.integration_id,
        campaignId
      );

      if (campaignAssignment) {
        return {
          assigned_to: campaignAssignment.assigned_to,
          created_by: campaignAssignment.assigned_to, // Use assigned user as created_by
          assignment_method: 'campaign',
        };
      }
    }
  }

  // Priority 3: Sales auto-assign (only for manual creation by sales users)
  if (createdByUserId) {
    const creator = await getUserById(createdByUserId);
    if (creator && creator.role === 'sales' && creator.org_id === orgId) {
      return {
        assigned_to: creator.id,
        created_by: creator.id,
        assignment_method: 'sales_auto',
      };
    }
  }

  // Priority 4: Percentage-based assignment
  const percentageAssignment = await getPercentageBasedAssignment(orgId);
  if (percentageAssignment) {
    return {
      assigned_to: percentageAssignment.userId,
      created_by: createdByUserId || null,
      assignment_method: 'percentage',
    };
  }

  // Priority 5: Round-robin assignment
  const roundRobinAssignment = await getRoundRobinAssignment(orgId);
  if (roundRobinAssignment) {
    return {
      assigned_to: roundRobinAssignment.userId,
      created_by: createdByUserId || null,
      assignment_method: 'round_robin',
    };
  }

  // Priority 6: Unassigned (fallback)
  return {
    assigned_to: null,
    created_by: createdByUserId || null,
    assignment_method: 'unassigned',
  };
}

/**
 * Get lead form assignment for a specific form_id
 */
async function getLeadFormAssignment(
  orgId: string,
  integrationId: string,
  formId: string
): Promise<{ assigned_to: string } | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('lead_form_assignments')
    .select('assigned_to')
    .eq('org_id', orgId)
    .eq('integration_id', integrationId)
    .eq('form_id', formId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return null;
  }

  return { assigned_to: data.assigned_to };
}

/**
 * Get campaign assignment for a specific campaign
 */
async function getCampaignAssignment(
  orgId: string,
  integrationId: string,
  campaignId: string
): Promise<{ assigned_to: string } | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('campaign_assignments')
    .select('assigned_to')
    .eq('org_id', orgId)
    .eq('integration_id', integrationId)
    .eq('campaign_id', campaignId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return null;
  }

  return { assigned_to: data.assigned_to };
}

/**
 * Get user by ID
 */
async function getUserById(userId: string): Promise<User | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * Get percentage-based assignment
 * Returns a user if allocation percentages are configured and sum to 100%
 */
async function getPercentageBasedAssignment(
  orgId: string
): Promise<{ userId: string } | null> {
  const supabase = await createClient();

  // Get all active sales team members with allocation percentages
  const { data: salesTeam, error } = await supabase
    .from('users')
    .select('id, lead_allocation_percent')
    .eq('org_id', orgId)
    .eq('role', 'sales')
    .eq('is_approved', true)
    .eq('is_active', true)
    .not('lead_allocation_percent', 'is', null)
    .order('lead_allocation_percent', { ascending: false });

  if (error || !salesTeam || salesTeam.length === 0) {
    return null;
  }

  // Check if percentages sum to 100%
  const totalPercent = salesTeam.reduce(
    (sum, user) => sum + (user.lead_allocation_percent || 0),
    0
  );

  if (totalPercent !== 100) {
    return null; // Percentages don't sum to 100%, use round-robin instead
  }

  // Get count of unassigned leads for this org
  const { count: unassignedCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .is('assigned_to', null);

  if (unassignedCount === null || unassignedCount === 0) {
    // First lead, assign to highest percentage
    return { userId: salesTeam[0].id };
  }

  // Calculate which sales rep should get this lead based on current distribution
  // This is a simplified version - in production, you might want more sophisticated logic
  const assignedCounts = await getAssignedLeadCounts(orgId, salesTeam.map(u => u.id));

  // Find the sales rep who is furthest below their target allocation
  let minRatio = Infinity;
  let selectedUserId: string | null = null;

  for (const user of salesTeam) {
    const assigned = assignedCounts[user.id] || 0;
    const targetPercent = user.lead_allocation_percent || 0;
    const targetCount = Math.floor((unassignedCount + 1) * targetPercent / 100);
    const ratio = targetCount > 0 ? assigned / targetCount : Infinity;

    if (ratio < minRatio) {
      minRatio = ratio;
      selectedUserId = user.id;
    }
  }

  return selectedUserId ? { userId: selectedUserId } : null;
}

/**
 * Get round-robin assignment
 * Returns the next user in rotation
 */
async function getRoundRobinAssignment(
  orgId: string
): Promise<{ userId: string } | null> {
  const supabase = await createClient();

  // Get all active sales team members
  const { data: salesTeam, error } = await supabase
    .from('users')
    .select('id')
    .eq('org_id', orgId)
    .eq('role', 'sales')
    .eq('is_approved', true)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error || !salesTeam || salesTeam.length === 0) {
    return null;
  }

  // Get count of assigned leads per user
  const assignedCounts = await getAssignedLeadCounts(orgId, salesTeam.map(u => u.id));

  // Find user with least assigned leads (round-robin)
  let minCount = Infinity;
  let selectedUserId: string | null = null;

  for (const user of salesTeam) {
    const count = assignedCounts[user.id] || 0;
    if (count < minCount) {
      minCount = count;
      selectedUserId = user.id;
    }
  }

  return selectedUserId ? { userId: selectedUserId } : null;
}

/**
 * Get assigned lead counts for multiple users
 */
async function getAssignedLeadCounts(
  orgId: string,
  userIds: string[]
): Promise<Record<string, number>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('leads')
    .select('assigned_to')
    .eq('org_id', orgId)
    .in('assigned_to', userIds)
    .not('assigned_to', 'is', null);

  if (error || !data) {
    return {};
  }

  const counts: Record<string, number> = {};
  for (const userId of userIds) {
    counts[userId] = 0;
  }

  for (const lead of data) {
    if (lead.assigned_to) {
      counts[lead.assigned_to] = (counts[lead.assigned_to] || 0) + 1;
    }
  }

  return counts;
}

