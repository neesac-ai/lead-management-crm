'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Target,
  CalendarDays,
  CreditCard,
  FileText,
  Settings,
  Building2,
  BarChart3,
  Zap,
  LogOut,
  ChevronDown,
  Bell,
  Upload,
  Loader2,
  Menu,
  Package,
} from 'lucide-react'
import type { AuthUser, UserRole } from '@/types'

interface NavItem {
  title: string
  href: string
  icon: React.ReactNode
  badge?: string | number
}

interface SidebarProps {
  orgSlug?: string
}

export function Sidebar({ orgSlug }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [mounted, setMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
    
    const fetchUser = async () => {
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      
      if (authUser) {
        const { data: profile } = await supabase
          .from('users')
          .select('id, email, name, avatar_url, role, org_id, is_approved, organizations(slug)')
          .eq('auth_id', authUser.id)
          .single()

        if (profile) {
          const p = profile as {
            id: string
            email: string
            name: string
            avatar_url: string | null
            role: string
            org_id: string | null
            is_approved: boolean
            organizations: { slug: string } | null
          }
          setUser({
            id: p.id,
            email: p.email,
            name: p.name,
            avatar_url: p.avatar_url,
            role: p.role as UserRole,
            org_id: p.org_id,
            org_slug: p.organizations?.slug || null,
            is_approved: p.is_approved,
          })
        }
      }
      setIsLoading(false)
    }

    fetchUser()
  }, [])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const baseUrl = orgSlug ? `/${orgSlug}` : '/super-admin'

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Navigation items based on role
  const getNavItems = (): NavItem[] => {
    if (user?.role === 'super_admin' && !orgSlug) {
      return [
        { title: 'Dashboard', href: '/super-admin', icon: <LayoutDashboard className="w-5 h-5" /> },
        { title: 'Organizations', href: '/super-admin/organizations', icon: <Building2 className="w-5 h-5" /> },
        { title: 'Subscriptions', href: '/super-admin/subscriptions', icon: <CreditCard className="w-5 h-5" /> },
        { title: 'All Users', href: '/super-admin/users', icon: <Users className="w-5 h-5" /> },
        { title: 'Analytics', href: '/super-admin/analytics', icon: <BarChart3 className="w-5 h-5" /> },
        { title: 'Settings', href: '/super-admin/settings', icon: <Settings className="w-5 h-5" /> },
      ]
    }

    // Default org-level navigation
    const items: NavItem[] = [
      { title: 'Dashboard', href: `${baseUrl}/dashboard`, icon: <LayoutDashboard className="w-5 h-5" /> },
    ]

    if (user?.role === 'admin' || user?.role === 'sales' || user?.role === 'super_admin') {
      items.push(
        { title: 'Leads', href: `${baseUrl}/leads`, icon: <Target className="w-5 h-5" /> },
        { title: 'Follow-ups', href: `${baseUrl}/follow-ups`, icon: <CalendarDays className="w-5 h-5" /> },
        { title: 'Demos', href: `${baseUrl}/demos`, icon: <Zap className="w-5 h-5" /> },
        { title: 'Products', href: `${baseUrl}/products`, icon: <Package className="w-5 h-5" /> },
        { title: 'Analytics', href: `${baseUrl}/analytics`, icon: <BarChart3 className="w-5 h-5" /> },
      )
    }

    if (user?.role === 'admin' || user?.role === 'super_admin') {
      items.push(
        { title: 'Import Leads', href: `${baseUrl}/import`, icon: <Upload className="w-5 h-5" /> },
        { title: 'Team', href: `${baseUrl}/team`, icon: <Users className="w-5 h-5" /> },
        { title: 'Lead Assignment', href: `${baseUrl}/assignment`, icon: <UserPlus className="w-5 h-5" /> },
      )
    }

    items.push(
      { title: 'Subscriptions', href: `${baseUrl}/subscriptions`, icon: <CreditCard className="w-5 h-5" /> },
    )

    if (user?.role === 'accountant' || user?.role === 'admin' || user?.role === 'super_admin') {
      items.push(
        { title: 'Payments', href: `${baseUrl}/payments`, icon: <CreditCard className="w-5 h-5" /> },
        { title: 'Invoices', href: `${baseUrl}/invoices`, icon: <FileText className="w-5 h-5" /> },
      )
    }

    if (user?.role === 'admin' || user?.role === 'super_admin') {
      items.push(
        { title: 'Settings', href: `${baseUrl}/settings`, icon: <Settings className="w-5 h-5" /> },
      )
    }

    return items
  }

  const navItems = getNavItems()

  // Sidebar content - shared between desktop and mobile
  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b px-6">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <Zap className="w-5 h-5 text-primary-foreground" />
        </div>
        <span className="text-xl font-bold">LeadFlow</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {item.icon}
              <span>{item.title}</span>
              {item.badge && (
                <Badge 
                  variant={isActive ? 'secondary' : 'outline'} 
                  className="ml-auto"
                >
                  {item.badge}
                </Badge>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User menu */}
      <div className="border-t p-4">
        {mounted && user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-3 h-auto py-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {user.name?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user.role?.replace('_', ' ')}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Bell className="mr-2 h-4 w-4" />
                Notifications
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-3 py-2 px-2">
            <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-24 bg-muted rounded animate-pulse" />
              <div className="h-3 w-16 bg-muted rounded animate-pulse" />
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // Show loading skeleton
  if (isLoading) {
    return (
      <>
        {/* Mobile Header */}
        <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b bg-card lg:hidden">
          <div className="flex h-full items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold">LeadFlow</span>
            </div>
            <div className="w-10 h-10 rounded bg-muted animate-pulse" />
          </div>
        </header>

        {/* Desktop Sidebar */}
        <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-card hidden lg:block">
          <div className="flex h-full flex-col">
            <div className="flex h-16 items-center gap-3 border-b px-6">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">LeadFlow</span>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          </div>
        </aside>
      </>
    )
  }

  return (
    <>
      {/* Mobile Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b bg-card lg:hidden">
        <div className="flex h-full items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold">LeadFlow</span>
          </div>
          
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-6 w-6" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <SidebarContent />
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-card hidden lg:block">
        <SidebarContent />
      </aside>
    </>
  )
}
