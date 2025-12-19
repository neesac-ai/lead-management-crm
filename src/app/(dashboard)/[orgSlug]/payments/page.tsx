import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CreditCard } from 'lucide-react'

export default function PaymentsPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title="Payments" 
        description="Track and manage payments"
      />
      
      <div className="flex-1 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
            <CardDescription>All payment transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No payments recorded</p>
              <p className="text-sm">Payments will appear here when customers pay</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


