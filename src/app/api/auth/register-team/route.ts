import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { name, email, password, orgCode, role } = await request.json()

    if (!name || !email || !password || !orgCode || !role) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      )
    }

    if (!['sales', 'accountant'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be sales or accountant.' },
        { status: 400 }
      )
    }

    // Use service role key for registration (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single()

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 400 }
      )
    }

    // Find organization by org_code
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, status')
      .eq('org_code', orgCode.toUpperCase())
      .single()

    if (orgError || !org) {
      return NextResponse.json(
        { error: 'Invalid organization code. Please check with your admin.' },
        { status: 400 }
      )
    }

    if (org.status !== 'active') {
      return NextResponse.json(
        { error: 'This organization is not active yet. Please contact your admin.' },
        { status: 400 }
      )
    }

    // Check quota for this role
    const { data: quotaResult, error: quotaError } = await supabase
      .rpc('check_org_quota', { p_org_id: org.id, p_role: role })

    if (quotaError) {
      console.error('Quota check error:', quotaError)
      // If the function doesn't exist yet, continue with registration
      if (!quotaError.message.includes('does not exist')) {
        return NextResponse.json(
          { error: 'Failed to check organization quota' },
          { status: 500 }
        )
      }
    } else if (quotaResult && quotaResult.length > 0) {
      const quota = quotaResult[0]
      if (!quota.allowed) {
        const roleLabel = role === 'sales' ? 'Sales Rep' : 'Accountant'
        return NextResponse.json(
          { 
            error: `${roleLabel} quota is full for this organization. Current: ${quota.current_count}/${quota.quota}. Please contact your admin to increase the quota.` 
          },
          { status: 400 }
        )
      }
    }

    // Create user with admin API (more reliable, auto-confirms email)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        name,
        role,
        org_code: orgCode,
      },
    })

    if (authError) {
      console.error('Auth error:', authError)
      
      // Check for duplicate user
      if (authError.message.includes('already') || 
          authError.message.includes('exists') ||
          authError.message.includes('duplicate')) {
        return NextResponse.json(
          { error: 'This email is already registered. Please try logging in.' },
          { status: 400 }
        )
      }
      
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      )
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      )
    }

    // Create the user profile linked to the org
    const { error: userError } = await supabase
      .from('users')
      .insert({
        auth_id: authData.user.id,
        email,
        name,
        role: role as 'sales' | 'accountant',
        org_id: org.id,
        is_approved: false, // Needs admin approval
      })

    if (userError) {
      console.error('Error creating user profile:', userError)
      return NextResponse.json(
        { error: 'Failed to create user profile' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Account created successfully. Please wait for your admin to approve.',
      organizationName: org.name,
    })
  } catch (error) {
    console.error('Team registration error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
