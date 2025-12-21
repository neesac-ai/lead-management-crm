import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Settings, Building2, Bell, Users } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title="Settings" 
        description="Manage organization settings"
      />
      
      <div className="flex-1 p-4 lg:p-6 space-y-4 lg:space-y-6">
        <Card>
          <CardHeader className="px-4 lg:px-6">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              <CardTitle>Organization</CardTitle>
            </div>
            <CardDescription>Basic organization information</CardDescription>
          </CardHeader>
          <CardContent className="px-4 lg:px-6 space-y-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Organization Name</Label>
                <Input placeholder="Your Organization" />
              </div>
              <div className="space-y-2">
                <Label>Contact Email</Label>
                <Input type="email" placeholder="contact@example.com" />
              </div>
            </div>
            <Button>Save Changes</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              <CardTitle>Notifications</CardTitle>
            </div>
            <CardDescription>Configure notification preferences</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Notification settings coming soon</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <CardTitle>Integrations</CardTitle>
            </div>
            <CardDescription>Connect external services</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Integration settings coming soon</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}



