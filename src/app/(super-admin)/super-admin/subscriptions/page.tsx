import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  CreditCard,
  Building2,
  Calendar,
  DollarSign,
  Plus,
} from 'lucide-react'
import { format } from 'date-fns'

type OrgSubscription = {
  id: string
  status: string
  billing_cycle: string
  start_date: string
  end_date: string | null
  organizations: { name: string } | null
  platform_plans: { name: string; price_monthly: number } | null
}

export default async function SuperAdminSubscriptionsPage() {
  const supabase = await createClient()

  // Fetch all organization subscriptions
  const { data: subscriptions } = await supabase
    .from('org_subscriptions')
    .select(`
      id,
      status,
      billing_cycle,
      start_date,
      end_date,
      organizations(name),
      platform_plans(name, price_monthly)
    `)
    .order('created_at', { ascending: false })

  const subs = (subscriptions || []) as OrgSubscription[]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500'
      case 'trialing': return 'bg-blue-500'
      case 'past_due': return 'bg-yellow-500'
      case 'canceled': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title="Platform Subscriptions" 
        description="Manage all organization subscriptions"
      />
      
      <div className="flex-1 p-6 space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Subscriptions
              </CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{subs.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active
              </CardTitle>
              <Building2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {subs.filter(s => s.status === 'active').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Trialing
              </CardTitle>
              <Calendar className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {subs.filter(s => s.status === 'trialing').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Monthly Revenue
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${subs.filter(s => s.status === 'active').reduce((sum, s) => sum + (s.platform_plans?.price_monthly || 0), 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Subscriptions List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>All Subscriptions</CardTitle>
              <CardDescription>View and manage organization subscriptions</CardDescription>
            </div>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Subscription
            </Button>
          </CardHeader>
          <CardContent>
            {subs.length > 0 ? (
              <div className="space-y-4">
                {subs.map((sub) => (
                  <div 
                    key={sub.id} 
                    className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{sub.organizations?.name || 'Unknown Organization'}</p>
                      <p className="text-sm text-muted-foreground">
                        {sub.platform_plans?.name || 'No Plan'} • {sub.billing_cycle}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        ${sub.platform_plans?.price_monthly || 0}/mo
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Started {format(new Date(sub.start_date), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <Badge className={getStatusColor(sub.status)}>
                      {sub.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No subscriptions yet</p>
                <p className="text-sm">Subscriptions will appear here when organizations sign up</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}



