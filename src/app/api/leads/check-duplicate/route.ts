import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// Normalize phone number for comparison
function normalizePhone(phone: string): string {
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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (!authUser) {
      console.log('[DUPLICATE API] ❌ Unauthorized - no auth user')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile to check role and org
    const { data: profile } = await supabase
      .from('users')
      .select('id, org_id, role')
      .eq('auth_id', authUser.id)
      .single()

    if (!profile || !profile.org_id) {
      console.log('[DUPLICATE API] ❌ User profile not found. Profile:', profile)
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    const { phone } = await request.json()

    if (!phone) {
      console.log('[DUPLICATE API] ❌ Phone number is required')
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }

    console.log('[DUPLICATE API] Checking duplicate for phone:', phone, 'orgId:', profile.org_id)

    // Use admin client to bypass RLS and check for duplicates across ALL leads in the org
    // This ensures sales users can detect duplicates even if they're assigned to others
    const adminClient = await createAdminClient()
    const normalizedPhone = normalizePhone(phone)
    
    console.log('[DUPLICATE API] Normalized phone:', normalizedPhone, 'Original:', phone)

    // Fetch ALL leads with phones for this org and filter in JavaScript
    // This is more reliable than ILIKE queries which can miss matches due to formatting
    console.log('[DUPLICATE API] Fetching all leads with phones for org:', profile.org_id)
    
    // Fetch in batches to handle large datasets (Supabase has default limits)
    let allLeads: any[] = []
    let hasMore = true
    let offset = 0
    const batchSize = 1000
    
    while (hasMore) {
      const { data: batch, error: queryError } = await adminClient
        .from('leads')
        .select('id, name, phone, assigned_to')
        .eq('org_id', profile.org_id)
        .not('phone', 'is', null)
        .range(offset, offset + batchSize - 1)
        .order('created_at', { ascending: false })
      
      if (queryError) {
        console.error('[DUPLICATE API] ❌ Query error:', queryError)
        return NextResponse.json({ error: 'Database query failed' }, { status: 500 })
      }
      
      if (batch && batch.length > 0) {
        allLeads = allLeads.concat(batch)
        console.log('[DUPLICATE API] Fetched batch:', batch.length, 'leads (total so far:', allLeads.length, ')')
        offset += batchSize
        hasMore = batch.length === batchSize
      } else {
        hasMore = false
      }
    }
    
    const queryError = null // No error if we got here

    if (queryError) {
      console.error('[DUPLICATE API] ❌ Query error:', queryError)
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 })
    }

    console.log('[DUPLICATE API] Fetched', allLeads?.length || 0, 'leads with phones')

    if (!allLeads || allLeads.length === 0) {
      console.log('[DUPLICATE API] ✅ No leads with phones found')
      return NextResponse.json({ duplicate: null })
    }

    // Find exact match by normalizing all phones and comparing
    // Also log all phones that are close matches for debugging
    console.log('[DUPLICATE API] Checking against', allLeads.length, 'leads. Looking for normalized:', normalizedPhone)
    
    const closeMatches: Array<{ phone: string; normalized: string; id: string }> = []
    const match = allLeads.find(lead => {
      if (!lead.phone) return false
      const leadNormalized = normalizePhone(lead.phone)
      
      // Check if last 10 digits match (for debugging)
      const checkingLast10 = normalizedPhone.replace(/[^\d]/g, '').slice(-10)
      const leadLast10 = leadNormalized.replace(/[^\d]/g, '').slice(-10)
      if (checkingLast10 === leadLast10 && leadNormalized !== normalizedPhone) {
        closeMatches.push({ phone: lead.phone, normalized: leadNormalized, id: lead.id })
      }
      
      const isMatch = leadNormalized === normalizedPhone
      if (isMatch) {
        console.log('[DUPLICATE API] ⚠️ EXACT MATCH FOUND:', {
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
      console.log('[DUPLICATE API] ✅ No exact match after normalization')
      console.log('[DUPLICATE API] Checking phone:', phone, 'Normalized:', normalizedPhone)
      
      // Check if there are any leads with the same last 10 digits
      const checkingLast10 = normalizedPhone.replace(/[^\d]/g, '').slice(-10)
      console.log('[DUPLICATE API] Checking last 10 digits:', checkingLast10)
      
      const leadsWithSameLast10 = allLeads.filter(l => {
        if (!l.phone) return false
        const leadLast10 = normalizePhone(l.phone).replace(/[^\d]/g, '').slice(-10)
        return leadLast10 === checkingLast10
      })
      
      if (leadsWithSameLast10.length > 0) {
        console.log('[DUPLICATE API] ⚠️ Found', leadsWithSameLast10.length, 'leads with same last 10 digits:', checkingLast10)
        console.log('[DUPLICATE API] These leads:', leadsWithSameLast10.map(l => ({
          id: l.id,
          phone: l.phone,
          normalized: normalizePhone(l.phone || ''),
          normalizedLast10: normalizePhone(l.phone || '').replace(/[^\d]/g, '').slice(-10),
          exactMatch: normalizePhone(l.phone || '') === normalizedPhone
        })))
        console.log('[DUPLICATE API] Why they don\'t match exactly:')
        leadsWithSameLast10.forEach(l => {
          const leadNorm = normalizePhone(l.phone || '')
          console.log(`  - Lead ${l.id}: "${l.phone}" -> "${leadNorm}" vs checking "${normalizedPhone}" -> Match: ${leadNorm === normalizedPhone}`)
        })
        
        // If we found leads with same last 10 digits, return the first one as a duplicate
        // This handles cases where normalization might have slight differences
        const firstMatch = leadsWithSameLast10[0]
        console.log('[DUPLICATE API] ⚠️ Returning first lead with matching last 10 digits as duplicate:', firstMatch.id)
        
        let assigneeName = null
        if (firstMatch.assigned_to) {
          const { data: assigneeData } = await adminClient
            .from('users')
            .select('name, email')
            .eq('id', firstMatch.assigned_to)
            .single()
          assigneeName = assigneeData ? `${assigneeData.name} (${assigneeData.email})` : null
        }
        
        return NextResponse.json({
          duplicate: {
            id: firstMatch.id,
            name: firstMatch.name,
            phone: firstMatch.phone,
            assigned_to: firstMatch.assigned_to,
            assignee_name: assigneeName,
          }
        })
      }
      
      // Search for phone containing the digits (fuzzy match for debugging)
      const phoneDigits = phone.replace(/[^\d]/g, '')
      const leadsWithSimilarPhone = allLeads.filter(l => {
        if (!l.phone) return false
        const leadDigits = l.phone.replace(/[^\d]/g, '')
        return leadDigits.includes(phoneDigits) || phoneDigits.includes(leadDigits)
      })
      
      if (leadsWithSimilarPhone.length > 0 && leadsWithSimilarPhone.length < 10) {
        console.log('[DUPLICATE API] Found', leadsWithSimilarPhone.length, 'leads with similar phone digits:')
        leadsWithSimilarPhone.forEach(l => {
          console.log(`  - Lead ${l.id}: "${l.phone}" (digits: ${l.phone?.replace(/[^\d]/g, '')})`)
        })
      }
      
      console.log('[DUPLICATE API] Sample of existing phones (first 10):', 
        allLeads.slice(0, 10).map(l => ({ 
          id: l.id,
          phone: l.phone, 
          normalized: normalizePhone(l.phone || ''),
          last10: normalizePhone(l.phone || '').replace(/[^\d]/g, '').slice(-10)
        }))
      )
      
      return NextResponse.json({ duplicate: null })
    }

    // Fetch assignee name separately if needed
    let assigneeName = null
    if (match.assigned_to) {
      const { data: assigneeData } = await adminClient
        .from('users')
        .select('name, email')
        .eq('id', match.assigned_to)
        .single()
      assigneeName = assigneeData ? `${assigneeData.name} (${assigneeData.email})` : null
    }

    console.log('[DUPLICATE API] ⚠️ Returning duplicate:', {
      id: match.id,
      name: match.name,
      phone: match.phone,
      assigned_to: match.assigned_to
    })

    return NextResponse.json({
      duplicate: {
        id: match.id,
        name: match.name,
        phone: match.phone,
        assigned_to: match.assigned_to,
        assignee_name: assigneeName,
      }
    })
  } catch (error) {
    console.error('[DUPLICATE API] ❌ Exception:', error)
    return NextResponse.json(
      { error: 'Failed to check for duplicate lead' },
      { status: 500 }
    )
  }
}
