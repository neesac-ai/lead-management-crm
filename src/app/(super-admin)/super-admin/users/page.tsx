import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { 
  Users,
  Plus,
  MoreHorizontal,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type User = {
  id: string
  name: string
  email: string
  avatar_url: string | null
  role: string
  is_approved: boolean
  created_at: string
  organizations: { name: string } | null
}

export default async function UsersPage() {
  const supabase = await createClient()

  const { data: users } = await supabase
    .from('users')
    .select('id, name, email, avatar_url, role, is_approved, created_at, organizations(name)')
    .neq('role', 'super_admin')
    .order('created_at', { ascending: false })

  const allUsers = (users || []) as User[]

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin': return <Badge className="bg-purple-500">Admin</Badge>
      case 'sales': return <Badge className="bg-blue-500">Sales</Badge>
      case 'accountant': return <Badge className="bg-green-500">Accountant</Badge>
      default: return <Badge variant="secondary">{role}</Badge>
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title="All Users" 
        description="Manage users across all organizations"
      />
      
      <div className="flex-1 p-4 lg:p-6 space-y-4 lg:space-y-6">
        {/* Stats */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{allUsers.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Admins</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-500">
                {allUsers.filter(u => u.role === 'admin').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-500">
                {allUsers.filter(u => u.role === 'sales').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approval</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-500">
                {allUsers.filter(u => !u.is_approved).length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users List */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 lg:px-6">
            <div>
              <CardTitle>All Users</CardTitle>
              <CardDescription>View and manage platform users</CardDescription>
            </div>
            <Button size="sm" className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </CardHeader>
          <CardContent className="px-4 lg:px-6">
            {allUsers.length > 0 ? (
              <div className="space-y-3">
                {allUsers.map((user) => (
                  <div 
                    key={user.id} 
                    className="p-4 rounded-lg border bg-card"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {user.name?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold truncate">{user.name}</p>
                          {user.is_approved ? (
                            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-yellow-500 shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {user.organizations?.name || 'No organization'} • {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t">
                      {getRoleBadge(user.role)}
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No users yet</p>
                <p className="text-sm">Users will appear here when they register</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}




