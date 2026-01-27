import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

type LeadProduct = { product_id: string; product_name: string }

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('id, org_id')
      .eq('auth_id', authUser.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const leadIds: string[] = Array.isArray(body?.leadIds) ? body.leadIds : []

    if (leadIds.length === 0) {
      return NextResponse.json({ leadProducts: {} as Record<string, LeadProduct> })
    }

    const admin = await createAdminClient()

    // Validate lead IDs belong to this org (and shrink query size)
    const leadIdBatchSize = 300
    const validLeadIds = new Set<string>()
    for (let i = 0; i < leadIds.length; i += leadIdBatchSize) {
      const batch = leadIds.slice(i, i + leadIdBatchSize)
      const { data: leadsBatch, error: leadsError } = await admin
        .from('leads')
        .select('id')
        .eq('org_id', profile.org_id)
        .in('id', batch)

      if (leadsError) {
        console.error('[PRODUCTS-BY-LEAD-IDS] Error validating lead IDs:', leadsError)
        return NextResponse.json({ error: 'Failed to validate lead IDs' }, { status: 500 })
      }

      for (const l of leadsBatch || []) {
        validLeadIds.add((l as any).id)
      }
    }

    if (validLeadIds.size === 0) {
      return NextResponse.json({ leadProducts: {} as Record<string, LeadProduct> })
    }

    const leadToProductId: Record<string, string> = {}
    const productIds = new Set<string>()

    // Fetch activities in small chunks to avoid giant IN(...) URLs (which caused UND_ERR_HEADERS_OVERFLOW).
    const activityBatchSize = 100
    const validLeadIdList = Array.from(validLeadIds)
    for (let i = 0; i < validLeadIdList.length; i += activityBatchSize) {
      const batch = validLeadIdList.slice(i, i + activityBatchSize)

      const { data: activities, error: activitiesError } = await admin
        .from('lead_activities')
        .select('lead_id, product_id, created_at')
        .in('lead_id', batch)
        .not('product_id', 'is', null)
        .order('created_at', { ascending: false })

      if (activitiesError) {
        console.error('[PRODUCTS-BY-LEAD-IDS] Error fetching activities:', activitiesError)
        return NextResponse.json({ error: 'Failed to fetch lead activities' }, { status: 500 })
      }

      for (const a of activities || []) {
        const leadId = (a as any).lead_id as string | undefined
        const productId = (a as any).product_id as string | undefined
        if (!leadId || !productId) continue
        if (leadToProductId[leadId]) continue // already have latest due to ordering
        leadToProductId[leadId] = productId
        productIds.add(productId)
      }
    }

    if (productIds.size === 0) {
      return NextResponse.json({ leadProducts: {} as Record<string, LeadProduct> })
    }

    const { data: products, error: productsError } = await admin
      .from('products')
      .select('id, name')
      .eq('org_id', profile.org_id)
      .in('id', Array.from(productIds))

    if (productsError) {
      console.error('[PRODUCTS-BY-LEAD-IDS] Error fetching products:', productsError)
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
    }

    const productNameById: Record<string, string> = {}
    for (const p of products || []) {
      productNameById[(p as any).id] = (p as any).name
    }

    const leadProducts: Record<string, LeadProduct> = {}
    for (const [leadId, productId] of Object.entries(leadToProductId)) {
      const name = productNameById[productId]
      if (!name) continue
      leadProducts[leadId] = { product_id: productId, product_name: name }
    }

    return NextResponse.json({ leadProducts })
  } catch (err) {
    console.error('[PRODUCTS-BY-LEAD-IDS] Exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

