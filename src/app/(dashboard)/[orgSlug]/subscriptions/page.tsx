import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CreditCard } from 'lucide-react'

export default function SubscriptionsPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title="Subscriptions" 
        description="Manage customer subscriptions"
      />
      
      <div className="flex-1 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Active Subscriptions</CardTitle>
            <CardDescription>Customers with active deals</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No subscriptions yet</p>
              <p className="text-sm">Win deals to create customer subscriptions</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


