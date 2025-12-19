import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Settings, Palette, Bell, Shield } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title="Platform Settings" 
        description="Configure global platform settings"
      />
      
      <div className="flex-1 p-6 space-y-6">
        {/* Branding */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              <CardTitle>Branding</CardTitle>
            </div>
            <CardDescription>Customize the platform appearance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Platform Name</Label>
                <Input defaultValue="LeadFlow" />
              </div>
              <div className="space-y-2">
                <Label>Support Email</Label>
                <Input type="email" defaultValue="support@leadflow.com" />
              </div>
            </div>
            <Button>Save Branding</Button>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              <CardTitle>Notifications</CardTitle>
            </div>
            <CardDescription>Configure email and notification settings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Notification settings coming soon</p>
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <CardTitle>Security</CardTitle>
            </div>
            <CardDescription>Platform security settings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Security settings coming soon</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}



