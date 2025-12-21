import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { OrgActions } from '@/components/super-admin/org-actions'
import { 
  Building2,
  CheckCircle,
  XCircle,
  Clock,
  Hash,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type Organization = {
  id: string
  name: string
  slug: string
  org_code: string
  status: string
  created_at: string
  users: { id: string; name: string; email: string; role: string }[]
}

export default async function OrganizationsPage() {
  const supabase = await createClient()

  const { data: organizations } = await supabase
    .from('organizations')
    .select('id, name, slug, org_code, status, created_at, users(id, name, email, role)')
    .order('created_at', { ascending: false })

  const orgs = (organizations || []) as Organization[]

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'suspended': return <XCircle className="h-4 w-4 text-red-500" />
      default: return <Clock className="h-4 w-4 text-yellow-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge className="bg-green-500 hover:bg-green-600">Active</Badge>
      case 'suspended': return <Badge variant="destructive">Suspended</Badge>
      case 'deleted': return <Badge variant="outline" className="text-muted-foreground">Deleted</Badge>
      default: return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">Pending Approval</Badge>
    }
  }

  const getAdminInfo = (users: Organization['users']) => {
    const admin = users?.find(u => u.role === 'admin')
    return admin ? `${admin.name} (${admin.email})` : 'No admin'
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title="Organizations" 
        description="Manage all organizations on the platform"
      />
      
      <div className="flex-1 p-4 lg:p-6 space-y-4 lg:space-y-6">
        {/* Stats */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{orgs.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">
                {orgs.filter(o => o.status === 'active').length}
              </div>
            </CardContent>
          </Card>
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-yellow-600">Pending Approval</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {orgs.filter(o => o.status === 'pending').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Suspended</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">
                {orgs.filter(o => o.status === 'suspended').length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pending Organizations - Highlighted */}
        {orgs.filter(o => o.status === 'pending').length > 0 && (
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-600">
                <Clock className="h-5 w-5" />
                Pending Approvals
              </CardTitle>
              <CardDescription>These organizations are waiting for your approval</CardDescription>
            </CardHeader>
            <CardContent className="px-4 lg:px-6">
              <div className="space-y-3">
                {orgs.filter(o => o.status === 'pending').map((org) => (
                  <div 
                    key={org.id} 
                    className="p-4 rounded-lg border border-yellow-500/30 bg-background"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{org.name}</p>
                        <p className="text-sm text-muted-foreground truncate mt-1">
                          Admin: {getAdminInfo(org.users)}
                        </p>
                      </div>
                      {getStatusBadge(org.status)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                      <Hash className="h-3 w-3" />
                      <code className="font-mono">{org.org_code}</code>
                      <span>•</span>
                      <span>{formatDistanceToNow(new Date(org.created_at), { addSuffix: true })}</span>
                    </div>
                    <OrgActions 
                      orgId={org.id} 
                      orgName={org.name} 
                      orgCode={org.org_code}
                      status={org.status} 
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* All Organizations List */}
        <Card>
          <CardHeader>
            <CardTitle>All Organizations</CardTitle>
            <CardDescription>View and manage client organizations</CardDescription>
          </CardHeader>
          <CardContent className="px-4 lg:px-6">
            {orgs.length > 0 ? (
              <div className="space-y-3">
                {orgs.filter(o => o.status !== 'pending').map((org) => (
                  <div 
                    key={org.id} 
                    className="p-4 rounded-lg border bg-card"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold truncate">{org.name}</p>
                          {getStatusIcon(org.status)}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {org.users?.length || 0} users • /{org.slug}
                        </p>
                      </div>
                      {getStatusBadge(org.status)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                      <Hash className="h-3 w-3" />
                      <code className="font-mono">{org.org_code}</code>
                      <span>•</span>
                      <span>{formatDistanceToNow(new Date(org.created_at), { addSuffix: true })}</span>
                    </div>
                    <OrgActions 
                      orgId={org.id} 
                      orgName={org.name} 
                      orgCode={org.org_code}
                      status={org.status} 
                    />
                  </div>
                ))}
                {orgs.filter(o => o.status !== 'pending').length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No active or suspended organizations</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No organizations yet</p>
                <p className="text-sm">Organizations will appear here when clients sign up</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
