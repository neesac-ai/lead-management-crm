import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              // More permissive settings for mobile/PWA
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
            })
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/register', '/forgot-password', '/reset-password', '/verify']
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

  // API routes
  const isApiRoute = pathname.startsWith('/api')

  // Static assets
  const isStaticAsset = pathname.startsWith('/_next') || 
                        pathname.startsWith('/favicon') || 
                        pathname.includes('.')

  if (isStaticAsset || isApiRoute) {
    return supabaseResponse
  }

  // If user is not logged in and trying to access protected route
  if (!user && !isPublicRoute && pathname !== '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // If user is logged in
  if (user) {
    // Get user profile to determine redirect
    const { data: profile } = await supabase
      .from('users')
      .select('role, org_id, is_approved, is_active, organizations(slug)')
      .eq('auth_id', user.id)
      .single()

    if (profile) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = profile as any
      const role = p.role as string
      const org_id = p.org_id as string | null
      const is_approved = p.is_approved as boolean
      const is_active = p.is_active as boolean
      const organizations = p.organizations as { slug: string } | { slug: string }[] | null
      const orgSlug = Array.isArray(organizations) ? organizations[0]?.slug : organizations?.slug

      // Check if user is inactive (not super_admin)
      if (role !== 'super_admin' && !is_active && !isPublicRoute) {
        // Sign out the user and redirect to login with message
        await supabase.auth.signOut()
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        url.searchParams.set('error', 'account_deactivated')
        return NextResponse.redirect(url)
      }

      // If trying to access auth pages while logged in
      if (isPublicRoute) {
        const url = request.nextUrl.clone()
        
        if (role === 'super_admin') {
          url.pathname = '/super-admin'
        } else if (org_id && is_approved) {
          url.pathname = `/${orgSlug}/dashboard`
        } else {
          url.pathname = '/pending-approval'
        }
        return NextResponse.redirect(url)
      }
    }
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}

