'use client'

import { Phone, MessageCircle, Mail, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface ContactActionsProps {
  phone?: string | null
  email?: string | null
  name?: string
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
  variant = 'default',
  className = ''
}: ContactActionsProps) {
  const hasPhone = phone && phone.trim() !== ''
  const hasEmail = email && email.trim() !== ''

  if (!hasPhone && !hasEmail) {
    return (
      <p className="text-sm text-muted-foreground">No contact info available</p>
    )
  }

  const buttonSize = variant === 'compact' ? 'sm' : 'default'
  const iconSize = variant === 'compact' ? 'h-4 w-4' : 'h-5 w-5'

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
                asChild
                className="bg-green-500/10 border-green-500/20 hover:bg-green-500/20 text-green-600"
              >
                <a href={`tel:${formatPhoneForLink(phone!)}`}>
                  <Phone className={iconSize} />
                  {variant !== 'compact' && <span className="ml-2">Call</span>}
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Call {phone}</p>
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










