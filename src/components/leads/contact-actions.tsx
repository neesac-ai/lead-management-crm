'use client'

import { useState, useEffect } from 'react'
import { Phone, MessageCircle, Mail, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { isNativeApp, getNativeBridge, setupNativeEventListener, parseNativeResponse } from '@/lib/native-bridge'
import type { CallStatus } from '@/types/native-bridge.types'
import { toast } from 'sonner'

interface ContactActionsProps {
  phone?: string | null
  email?: string | null
  name?: string
  leadId?: string
  variant?: 'default' | 'compact'
  className?: string
}

// Format phone number for tel: link (remove spaces, keep + and digits)
function formatPhoneForLink(phone: string): string {
  return phone.replace(/[^\d+]/g, '')
}

// Format phone number for WhatsApp (needs country code without +)
function formatPhoneForWhatsApp(phone: string): string {
  let formatted = phone.replace(/[^\d+]/g, '')
  // Remove leading + for WhatsApp
  if (formatted.startsWith('+')) {
    formatted = formatted.slice(1)
  }
  // Add India country code if not present (assuming Indian numbers)
  if (!formatted.startsWith('91') && formatted.length === 10) {
    formatted = '91' + formatted
  }
  return formatted
}

export function ContactActions({
  phone,
  email,
  name = 'Lead',
  leadId,
  variant = 'default',
  className = ''
}: ContactActionsProps) {
  const [isNative, setIsNative] = useState(false)
  const [callStatus, setCallStatus] = useState<CallStatus | null>(null)
  const hasPhone = phone && phone.trim() !== ''
  const hasEmail = email && email.trim() !== ''

  useEffect(() => {
    // Check if native bridge is available
    setIsNative(isNativeApp())

    if (isNativeApp()) {
      // Setup native event listener
      const cleanup = setupNativeEventListener((event) => {
        if (event.type === 'CALL_ENDED' || event.type === 'CALL_CONNECTED' || event.type === 'CALL_RINGING') {
          // Update call status
          const bridge = getNativeBridge()
          if (bridge?.getLastCallStatus) {
            const statusStr = bridge.getLastCallStatus()
            const status = parseNativeResponse<CallStatus>(statusStr)
            if (status) {
              setCallStatus(status)
            }
          }
        }
      })

      return cleanup
    }
  }, [])

  const handleCall = (e: React.MouseEvent) => {
    e.preventDefault()

    if (!hasPhone || !phone) return

    if (isNative && leadId) {
      // Use native bridge for call tracking
      const bridge = getNativeBridge()
      if (bridge?.initiateCall) {
        try {
          bridge.initiateCall(leadId, phone)
          toast.info('Opening dialer and starting call tracking...')
        } catch (error) {
          console.error('Error initiating call via native bridge:', error)
          toast.error('Failed to initiate call tracking')
          // Fallback to tel: link
          window.location.href = `tel:${formatPhoneForLink(phone)}`
        }
      } else {
        // Fallback to tel: link
        window.location.href = `tel:${formatPhoneForLink(phone)}`
      }
    } else {
      // Regular browser - use tel: link
      window.location.href = `tel:${formatPhoneForLink(phone)}`
    }
  }

  if (!hasPhone && !hasEmail) {
    return (
      <p className="text-sm text-muted-foreground">No contact info available</p>
    )
  }

  const buttonSize = variant === 'compact' ? 'sm' : 'default'
  const iconSize = variant === 'compact' ? 'h-4 w-4' : 'h-5 w-5'
  const isInCall = callStatus?.isInCall

  return (
    <TooltipProvider>
      <div className={`flex items-center gap-2 ${className}`}>
        {/* Click to Call */}
        {hasPhone && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size={buttonSize}
                onClick={handleCall}
                disabled={isInCall}
                className={`${
                  isInCall
                    ? 'bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/20 text-yellow-600'
                    : 'bg-green-500/10 border-green-500/20 hover:bg-green-500/20 text-green-600'
                }`}
              >
                <Phone className={iconSize} />
                {variant !== 'compact' && (
                  <span className="ml-2">
                    {isInCall ? `In Call (${callStatus?.duration}s)` : 'Call'}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {isInCall
                  ? `Call in progress - ${callStatus?.duration}s`
                  : `Call ${phone}${isNative ? ' (with tracking)' : ''}`
                }
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* WhatsApp */}
        {hasPhone && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size={buttonSize}
                asChild
                className="bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-600"
              >
                <a
                  href={`https://wa.me/${formatPhoneForWhatsApp(phone!)}?text=${encodeURIComponent(`Hi ${name}, `)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className={iconSize} />
                  {variant !== 'compact' && <span className="ml-2">WhatsApp</span>}
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>WhatsApp {phone}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Email */}
        {hasEmail && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size={buttonSize}
                asChild
                className="bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20 text-blue-600"
              >
                <a href={`mailto:${email}?subject=Following up&body=Hi ${name},%0A%0A`}>
                  <Mail className={iconSize} />
                  {variant !== 'compact' && <span className="ml-2">Email</span>}
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Email {email}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}

// Compact version for use in tables/lists
export function ContactActionsCompact(props: Omit<ContactActionsProps, 'variant'>) {
  return <ContactActions {...props} variant="compact" />
}
