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

    // Sign up the user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          role,
          org_code: orgCode,
        },
      },
    })

    if (authError) {
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

