import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { generateOrgCode, generateSlug } from '@/lib/utils/org-code'

export async function POST(request: Request) {
  try {
    const { name, email, password, organizationName } = await request.json()

    if (!name || !email || !password || !organizationName) {
      return NextResponse.json(
        { error: 'All fields are required' },
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

    // Generate unique org code and slug
    const orgCode = generateOrgCode(organizationName)
    const slug = generateSlug(organizationName)

    // Check if slug already exists, append number if needed
    let finalSlug = slug
    let slugCounter = 1
    while (true) {
      const { data: existingOrg } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', finalSlug)
        .single()

      if (!existingOrg) break
      finalSlug = `${slug}-${slugCounter}`
      slugCounter++
    }

    // Create user with admin API (more reliable, auto-confirms email)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        name,
        organization_name: organizationName,
      },
    })

    if (authError) {
      console.error('Auth error:', authError)
      
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

    // Create the organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: organizationName,
        slug: finalSlug,
        org_code: orgCode,
        status: 'pending', // Needs super admin approval
      })
      .select()
      .single()

    if (orgError) {
      console.error('Error creating organization:', orgError)
      return NextResponse.json(
        { error: 'Failed to create organization' },
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
        role: 'admin',
        org_id: org.id,
        is_approved: false, // Needs super admin approval
      })

    if (userError) {
      console.error('Error creating user profile:', userError)
      // Try to clean up the org if user creation fails
      await supabase.from('organizations').delete().eq('id', org.id)
      return NextResponse.json(
        { error: 'Failed to create user profile' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Account created successfully. Please wait for admin approval.',
      orgCode: orgCode,
    })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

