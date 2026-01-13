'use client'

import { useMemo } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

type Profile = {
  id: string
  name: string
  email: string
  role: string
  org_id: string
} | null

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

export default function TeamLocationMap({
  locations,
  center,
  zoom,
  profile,
}: {
  locations: TeamLocation[]
  center: [number, number]
  zoom: number
  profile: Profile
}) {
  // Group markers that share the exact same coordinates (or extremely close)
  // so tooltips don't overlap and names don't "fight" each other visually.
  const grouped = useMemo(() => {
    const keyOf = (lat: number, lng: number) => `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`
    const map = new Map<string, TeamLocation[]>()
    for (const l of locations) {
      const key = keyOf(l.latitude, l.longitude)
      const arr = map.get(key) || []
      arr.push(l)
      map.set(key, arr)
    }

    return Array.from(map.entries()).map(([key, items]) => {
      // stable ordering so label doesn't flicker between members
      const sorted = [...items].sort((a, b) => {
        const an = (a.users?.name || '').toLowerCase()
        const bn = (b.users?.name || '').toLowerCase()
        if (an < bn) return -1
        if (an > bn) return 1
        return a.id.localeCompare(b.id)
      })

      const first = sorted[0]
      const [latStr, lngStr] = key.split(',')
      return {
        key,
        latitude: Number(latStr),
        longitude: Number(lngStr),
        items: sorted,
        first,
      }
    })
  }, [locations])

  return (
    <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {grouped.map((g) => {
        const primary = g.first
        const labelName = primary.users?.name || (profile?.id === primary.user_id ? profile?.name : 'Team member')
        const labelEmail = primary.users?.email || (profile?.id === primary.user_id ? profile?.email : '')
        const lastAt = primary.recorded_at ? new Date(primary.recorded_at).toLocaleString() : '--'
        const acc = primary.accuracy ? `±${Math.round(Number(primary.accuracy))}m` : null
        const count = g.items.length
        const label = count > 1 ? `${labelName || 'Team member'} (+${count - 1})` : (labelName || 'Team member')

        return (
          <CircleMarker
            key={g.key}
            center={[g.latitude, g.longitude]}
            radius={10}
            pathOptions={{ color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 0.35 }}
          >
            <Tooltip
              permanent
              direction="top"
              offset={[0, -10]}
              opacity={1}
              className="leaflet-name-tooltip"
            >
              <span className="text-xs font-medium">{label}</span>
            </Tooltip>
            <Popup>
              <div className="space-y-1">
                {count === 1 ? (
                  <>
                    <div className="font-medium">{labelName}</div>
                    {labelEmail ? <div className="text-xs text-muted-foreground">{labelEmail}</div> : null}
                    <div className="text-xs">Last updated: {lastAt}</div>
                    {acc ? <div className="text-xs">Accuracy: {acc}</div> : null}
                    {primary.address ? <div className="text-xs">{primary.address}</div> : null}
                  </>
                ) : (
                  <>
                    <div className="font-medium">{count} members here</div>
                    <div className="space-y-1">
                      {g.items.map((m) => {
                        const n = m.users?.name || (profile?.id === m.user_id ? profile?.name : 'Team member')
                        const e = m.users?.email || (profile?.id === m.user_id ? profile?.email : '')
                        const t = m.recorded_at ? new Date(m.recorded_at).toLocaleString() : '--'
                        return (
                          <div key={m.id} className="text-xs">
                            <span className="font-medium">{n}</span>
                            {e ? <span className="text-muted-foreground"> ({e})</span> : null}
                            <div className="text-muted-foreground">Last updated: {t}</div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
                <div className="text-xs">
                  {g.latitude.toFixed(6)}, {g.longitude.toFixed(6)}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}


