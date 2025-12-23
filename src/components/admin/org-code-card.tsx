'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Copy, Hash, Check } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface OrgCodeCardProps {
  orgCode: string
}

export function OrgCodeCard({ orgCode }: OrgCodeCardProps) {
  const [copied, setCopied] = useState(false)

  const copyCode = () => {
    navigator.clipboard.writeText(orgCode)
    setCopied(true)
    toast.success('Organization code copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="bg-primary/5 border-primary/20">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Hash className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Your Organization Code</p>
              <code className="text-xl font-mono font-bold tracking-wider">{orgCode}</code>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={copyCode}>
            {copied ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Copy
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Share this code with your team members so they can register and join your organization
        </p>
      </CardContent>
    </Card>
  )
}








