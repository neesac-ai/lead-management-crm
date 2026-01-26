import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

// Normalize phone number for comparison
export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '')
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    return '+91' + cleaned
  }
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return '+' + cleaned
  }
  if (!cleaned.startsWith('+') && cleaned.length > 10) {
    return '+' + cleaned
  }
  return cleaned
}

// Check for duplicate lead by phone number
// Uses admin client to bypass RLS and check across ALL leads in the org
export async function checkDuplicateByPhone(
  supabase: SupabaseClient<Database>,
  adminSupabase: SupabaseClient<Database>,
  phone: string,
  orgId: string
): Promise<{ id: string; name: string; phone: string } | null> {
  if (!phone || !orgId) {
    console.log('[DUPLICATE-CHECK] Skipping - missing phone or orgId')
    return null
  }

  console.log('[DUPLICATE-CHECK] Checking phone:', phone, 'orgId:', orgId)
  const normalizedPhone = normalizePhone(phone)
  console.log('[DUPLICATE-CHECK] Normalized phone:', normalizedPhone, 'from original:', phone)

  // Fetch ALL leads with phones for this org and filter in JavaScript
  // This is more reliable than ILIKE queries which can miss matches due to formatting
  console.log('[DUPLICATE-CHECK] Fetching all leads with phones for org:', orgId)
  
  // Fetch in batches to handle large datasets (Supabase has default limits)
  let allLeads: any[] = []
  let hasMore = true
  let offset = 0
  const batchSize = 1000
  
  while (hasMore) {
    const { data: batch, error: queryError } = await adminSupabase
      .from('leads')
      .select('id, name, phone')
      .eq('org_id', orgId)
      .not('phone', 'is', null)
      .range(offset, offset + batchSize - 1)
      .order('created_at', { ascending: false })
    
    if (queryError) {
      console.error('[DUPLICATE-CHECK] ❌ Query error:', queryError)
      return null
    }
    
    if (batch && batch.length > 0) {
      allLeads = allLeads.concat(batch)
      console.log('[DUPLICATE-CHECK] Fetched batch:', batch.length, 'leads (total so far:', allLeads.length, ')')
      offset += batchSize
      hasMore = batch.length === batchSize
    } else {
      hasMore = false
    }
  }
  
  const queryError = null // No error if we got here

  if (queryError) {
    console.error('[DUPLICATE-CHECK] ❌ Query error:', queryError)
    return null
  }

  console.log('[DUPLICATE-CHECK] Fetched', allLeads?.length || 0, 'leads with phones')

  if (!allLeads || allLeads.length === 0) {
    console.log('[DUPLICATE-CHECK] ✅ No leads with phones found')
    return null
  }

  // Find exact match by normalizing all phones and comparing
  // Also check for leads with same last 10 digits for debugging
  console.log('[DUPLICATE-CHECK] Checking against', allLeads.length, 'leads. Looking for normalized:', normalizedPhone)
  
  const checkingLast10 = normalizedPhone.replace(/[^\d]/g, '').slice(-10)
  console.log('[DUPLICATE-CHECK] Checking last 10 digits:', checkingLast10)
  
  const match = allLeads.find(lead => {
    if (!lead.phone) return false
    const leadNormalized = normalizePhone(lead.phone)
    const isMatch = leadNormalized === normalizedPhone
    if (isMatch) {
      console.log('[DUPLICATE-CHECK] ⚠️ EXACT MATCH:', {
        leadId: lead.id,
        leadPhone: lead.phone,
        leadNormalized,
        checkingNormalized: normalizedPhone,
        checkingOriginal: phone
      })
    }
    return isMatch
  })

  if (!match) {
    console.log('[DUPLICATE-CHECK] ✅ No exact match after normalization')
    console.log('[DUPLICATE-CHECK] Checking phone:', phone, 'Normalized:', normalizedPhone)
    
    // Check if there are any leads with the same last 10 digits
    const leadsWithSameLast10 = allLeads.filter(l => {
      if (!l.phone) return false
      const leadLast10 = normalizePhone(l.phone).replace(/[^\d]/g, '').slice(-10)
      return leadLast10 === checkingLast10
    })
    
    if (leadsWithSameLast10.length > 0) {
      console.log('[DUPLICATE-CHECK] ⚠️ Found', leadsWithSameLast10.length, 'leads with same last 10 digits:', checkingLast10)
      console.log('[DUPLICATE-CHECK] These leads:', leadsWithSameLast10.map(l => ({
        id: l.id,
        phone: l.phone,
        normalized: normalizePhone(l.phone || ''),
        normalizedLast10: normalizePhone(l.phone || '').replace(/[^\d]/g, '').slice(-10),
        exactMatch: normalizePhone(l.phone || '') === normalizedPhone
      })))
      console.log('[DUPLICATE-CHECK] Why they don\'t match exactly:')
      leadsWithSameLast10.forEach(l => {
        const leadNorm = normalizePhone(l.phone || '')
        console.log(`  - Lead ${l.id}: "${l.phone}" -> "${leadNorm}" vs checking "${normalizedPhone}" -> Match: ${leadNorm === normalizedPhone}`)
      })
      
      // If we found leads with same last 10 digits, return the first one as a duplicate
      // This handles cases where normalization might have slight differences
      const firstMatch = leadsWithSameLast10[0]
      console.log('[DUPLICATE-CHECK] ⚠️ Returning first lead with matching last 10 digits as duplicate:', firstMatch.id)
      
      return {
        id: firstMatch.id,
        name: firstMatch.name,
        phone: firstMatch.phone,
      }
    }
    
    console.log('[DUPLICATE-CHECK] Sample of existing phones (first 10):', 
      allLeads.slice(0, 10).map(l => ({ 
        id: l.id,
        phone: l.phone, 
        normalized: normalizePhone(l.phone || ''),
        last10: normalizePhone(l.phone || '').replace(/[^\d]/g, '').slice(-10)
      }))
    )
    return null
  }

  console.log('[DUPLICATE-CHECK] ⚠️ Returning duplicate:', {
    id: match.id,
    name: match.name,
    phone: match.phone
  })

  return {
    id: match.id,
    name: match.name,
    phone: match.phone,
  }
}
