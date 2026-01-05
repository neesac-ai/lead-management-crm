'use client'

import { useState, useEffect } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { isNativeApp, getNativeBridge, setupNativeEventListener, parseNativeResponse } from '@/lib/native-bridge'
import type { LocationData } from '@/types/native-bridge.types'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

interface CheckInButtonProps {
  leadId: string
  leadName?: string
  onCheckInComplete?: () => void
}

export function CheckInButton({ leadId, leadName, onCheckInComplete }: CheckInButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [isCheckingIn, setIsCheckingIn] = useState(false)
  const [isNative, setIsNative] = useState(false)

  useEffect(() => {
    setIsNative(isNativeApp())

    if (isNativeApp()) {
      // Setup native event listener for check-in completion
      const cleanup = setupNativeEventListener((event) => {
        if (event.type === 'CHECKIN_COMPLETE') {
          setIsCheckingIn(false)
          setIsDialogOpen(false)
          setNotes('')
          toast.success('Check-in completed successfully!')
          onCheckInComplete?.()
        } else if (event.type === 'LOCATION_ERROR') {
          setIsCheckingIn(false)
          toast.error(`Check-in failed: ${event.data.error || 'Unknown error'}`)
        }
      })

      return cleanup
    }
  }, [onCheckInComplete])

  const handleCheckIn = async () => {
    if (!leadId) {
      toast.error('Lead ID is required')
      return
    }

    setIsCheckingIn(true)

    if (isNative) {
      // Use native bridge
      const bridge = getNativeBridge()
      if (bridge?.checkIn) {
        try {
          bridge.checkIn(leadId, notes)
          // Event listener will handle completion
        } catch (error) {
          console.error('Error checking in via native bridge:', error)
          toast.error('Failed to check in')
          setIsCheckingIn(false)
        }
      } else {
        toast.error('Native bridge not available')
        setIsCheckingIn(false)
      }
    } else {
      // Browser fallback - get location and send to API
      try {
        if (!navigator.geolocation) {
          toast.error('Geolocation is not supported by your browser')
          setIsCheckingIn(false)
          return
        }

        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude, accuracy } = position.coords

            // Reverse geocode (optional - can be done on backend)
            const supabase = createClient()
            const response = await fetch(`/api/locations/checkin`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lead_id: leadId,
                latitude,
                longitude,
                accuracy,
                notes: notes || null,
              }),
            })

            if (!response.ok) {
              const data = await response.json()
              throw new Error(data.error || 'Failed to check in')
            }

            setIsCheckingIn(false)
            setIsDialogOpen(false)
            setNotes('')
            toast.success('Check-in completed successfully!')
            onCheckInComplete?.()
          },
          (error) => {
            console.error('Geolocation error:', error)
            toast.error(`Failed to get location: ${error.message}`)
            setIsCheckingIn(false)
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          }
        )
      } catch (error) {
        console.error('Check-in error:', error)
        toast.error(error instanceof Error ? error.message : 'Failed to check in')
        setIsCheckingIn(false)
      }
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsDialogOpen(true)}
        className="bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20 text-blue-600"
      >
        <MapPin className="h-4 w-4 mr-2" />
        Check In
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check In</DialogTitle>
            <DialogDescription>
              Record your location for {leadName || 'this lead'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="checkin-notes">Notes (optional)</Label>
              <Textarea
                id="checkin-notes"
                placeholder="Add any notes about this visit..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            {isNative && (
              <p className="text-sm text-muted-foreground">
                Using native GPS for accurate location tracking
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false)
                setNotes('')
              }}
              disabled={isCheckingIn}
            >
              Cancel
            </Button>
            <Button onClick={handleCheckIn} disabled={isCheckingIn}>
              {isCheckingIn ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Checking In...
                </>
              ) : (
                'Check In'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

