'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Target,
  CalendarDays,
  Zap,
  BarChart3,
} from 'lucide-react'

interface BottomNavProps {
  orgSlug: string
}

export function BottomNav({ orgSlug }: BottomNavProps) {
  const pathname = usePathname()

  const navItems = [
    {
      title: 'Dashboard',
      href: `/${orgSlug}/dashboard`,
      icon: LayoutDashboard,
    },
    {
      title: 'Leads',
      href: `/${orgSlug}/leads`,
      icon: Target,
    },
    {
      title: 'Follow ups',
      href: `/${orgSlug}/follow-ups`,
      icon: CalendarDays,
    },
    {
      title: 'Meetings',
      href: `/${orgSlug}/meetings`,
      icon: Zap,
    },
    {
      title: 'Analytics',
      href: `/${orgSlug}/analytics`,
      icon: BarChart3,
    },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:hidden">
      <div className="grid grid-cols-5 h-16 gap-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-1 sm:px-2 py-1.5 transition-colors',
                isActive
                  ? 'text-primary bg-primary/5'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="text-[10px] font-medium leading-tight text-center whitespace-nowrap">{item.title === 'Follow ups' ? 'Follow-ups' : item.title}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

