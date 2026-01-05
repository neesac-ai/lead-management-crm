'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Bell, Moon, Sun, RefreshCw } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useOrg } from '@/contexts/org-context'

interface HeaderProps {
  title?: string
  description?: string
  onRefresh?: () => void
  isRefreshing?: boolean
}

export function Header({ title, description, onRefresh, isRefreshing = false }: HeaderProps) {
  // Get org info from context (null if not available, e.g., super admin pages)
  const orgContext = useOrg()
  const orgName = orgContext?.orgName
  const orgCode = orgContext?.orgCode
  const router = useRouter()

  const [mounted, setMounted] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const [isRefreshingState, setIsRefreshingState] = useState(false)

  useEffect(() => {
    setMounted(true)
    const isDarkMode = document.documentElement.classList.contains('dark')
    setIsDark(isDarkMode)
  }, [])

  const toggleTheme = () => {
    document.documentElement.classList.toggle('dark')
    setIsDark(!isDark)
  }

  const handleRefresh = async () => {
    if (onRefresh) {
      // Use provided refresh callback
      onRefresh()
    } else {
      // Use router.refresh() for server components
      setIsRefreshingState(true)
      router.refresh()
      // Reset after a short delay
      setTimeout(() => setIsRefreshingState(false), 1000)
    }
  }

  const refreshing = isRefreshing || isRefreshingState

  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-3 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        {/* Title section */}
        <div className="flex-1 min-w-0">
          {/* Org Info */}
          {(orgName || orgCode) && (
            <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
              {orgName && (
                <span className="text-[10px] sm:text-xs font-medium text-primary truncate">{orgName}</span>
              )}
              {orgCode && (
                <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0 h-4 sm:h-5">
                  {orgCode}
                </Badge>
              )}
            </div>
          )}
          {title && (
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base lg:text-lg font-semibold truncate">{title}</h1>
              {description && (
                <p className="text-xs sm:text-sm text-muted-foreground break-words line-clamp-2">{description}</p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0" suppressHydrationWarning>
          {/* Refresh button - always show */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-7 w-7 sm:h-8 sm:w-8 lg:h-9 lg:w-9"
            title="Refresh page"
          >
            <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-5 lg:w-5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>

          {/* Theme toggle */}
          <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-7 w-7 sm:h-8 sm:w-8 lg:h-9 lg:w-9">
            {mounted ? (isDark ? <Sun className="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-5 lg:w-5" /> : <Moon className="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-5 lg:w-5" />) : <Moon className="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-5 lg:w-5" />}
          </Button>

          {/* Notifications */}
          {mounted && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-7 w-7 sm:h-8 sm:w-8 lg:h-9 lg:w-9">
                  <Bell className="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-5 lg:w-5" />
                  <Badge className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 h-4 w-4 sm:h-5 sm:w-5 p-0 flex items-center justify-center text-[10px] sm:text-xs">
                    0
                  </Badge>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <div className="p-4 text-center text-sm text-muted-foreground">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No new notifications</p>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  )
}
