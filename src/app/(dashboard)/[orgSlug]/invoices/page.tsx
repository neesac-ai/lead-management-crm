import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, Plus } from 'lucide-react'

export default function InvoicesPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title="Invoices" 
        description="Create and manage invoices"
      />
      
      <div className="flex-1 p-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>All Invoices</CardTitle>
              <CardDescription>Manage your invoices</CardDescription>
            </div>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Invoice
            </Button>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No invoices yet</p>
              <p className="text-sm">Create invoices for customer subscriptions</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


