import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { FileText, Clock } from 'lucide-react'

export default function InvoicesPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="Invoices"
        description="Create and manage invoices"
      />

      <div className="flex-1 p-4 lg:p-6">
        <Card>
          <CardContent>
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-6">
                <Clock className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Coming Soon</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                The Invoices feature is currently under development. You'll be able to create and manage invoices for customer subscriptions here soon.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}



