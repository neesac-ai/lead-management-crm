'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, MapPin, Users as UsersIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import dynamic from 'next/dynamic'
import { getMenuNames, getMenuLabel } from '@/lib/menu-names'

const TeamLocationMap = dynamic(() => import('@/components/locations/team-location-map'), { ssr: false })

type Profile = {
  id: string
  name: string
  email: string
  role: string
  org_id: string
}

type TeamLocation = {
  id: string
  user_id: string
  org_id: string
  latitude: number
  longitude: number
  accuracy: number | null
  address: string | null
  recorded_at: string
  users?: { id: string; name: string; email: string } | null
}

export default function LocationsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)
  const [isLoadingLocations, setIsLoadingLocations] = useState(true)
  const [isRefreshingLocations, setIsRefreshingLocations] = useState(false)
  const [locations, setLocations] = useState<TeamLocation[]>([])
  const [menuNames, setMenuNames] = useState<Record<string, string>>({})
  const hasLoadedOnceRef = useRef(false)

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  useEffect(() => {
    const run = async () => {
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        setIsLoadingProfile(false)
        return
      }

      const { data: p } = await supabase
        .from('users')
        .select('id, name, email, role, org_id')
        .eq('auth_id', authUser.id)
        .single()

      if (p) setProfile(p as Profile)
      setIsLoadingProfile(false)
    }
    run()
    fetchMenuNames()
  }, [])

  // Fetch menu names
  const fetchMenuNames = async () => {
    try {
      const names = await getMenuNames()
      setMenuNames(names)
    } catch (error) {
      console.error('Error fetching menu names:', error)
    }
  }

  // Listen for menu name updates
  useEffect(() => {
    const handleMenuNamesUpdate = () => {
      fetchMenuNames()
    }
    window.addEventListener('menu-names-updated', handleMenuNamesUpdate)
    return () => {
      window.removeEventListener('menu-names-updated', handleMenuNamesUpdate)
    }
  }, [])

  useEffect(() => {
    if (!profile) return

    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const fetchLocations = async () => {
      try {
        if (!hasLoadedOnceRef.current) {
          setIsLoadingLocations(true)
        } else {
          setIsRefreshingLocations(true)
        }
        if (isAdmin) {
          const res = await fetch('/api/locations/team?limit=500', { cache: 'no-store' })
          const data = await res.json()
          if (!cancelled) setLocations((data?.locations || []) as TeamLocation[])
        } else {
          const res = await fetch('/api/locations/me', { cache: 'no-store' })
          const data = await res.json()
          const loc = data?.location
          if (!cancelled) setLocations(loc ? [loc as TeamLocation] : [])
        }
      } catch (e) {
        console.error('Error fetching locations:', e)
        if (!cancelled) setLocations([])
      } finally {
        if (!cancelled) {
          if (!hasLoadedOnceRef.current) {
            hasLoadedOnceRef.current = true
            setIsLoadingLocations(false)
          }
          setIsRefreshingLocations(false)
        }
      }
    }

    fetchLocations()
    timer = setInterval(fetchLocations, 5000)

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [profile, isAdmin])

  const center = useMemo<[number, number]>(() => {
    if (locations.length > 0) {
      const lat = locations.reduce((s, l) => s + Number(l.latitude), 0) / locations.length
      const lng = locations.reduce((s, l) => s + Number(l.longitude), 0) / locations.length
      return [lat, lng]
    }
    // Default: India center
    return [20.5937, 78.9629]
  }, [locations])

  const zoom = locations.length > 0 ? 12 : 5

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title={getMenuLabel(menuNames, 'locations', 'Locations')}
        description={isAdmin ? 'Live team locations (updates every 5 seconds)' : 'Your live location (updates every 5 seconds)'}
      />

      <div className="flex-1 p-4 lg:p-6 space-y-4 lg:space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                <CardTitle>Live Map</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                {isRefreshingLocations ? (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Updating…
                  </Badge>
                ) : null}
                <Badge variant="secondary" className="flex items-center gap-1">
                  <UsersIcon className="h-3.5 w-3.5" />
                  {locations.length}
                </Badge>
              </div>
            </div>
            <CardDescription>
              Tracking works only while the app is open (foreground).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingProfile || isLoadingLocations ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="h-[520px] w-full overflow-hidden rounded-lg border">
                <TeamLocationMap
                  locations={locations}
                  center={center}
                  zoom={zoom}
                  profile={profile}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


