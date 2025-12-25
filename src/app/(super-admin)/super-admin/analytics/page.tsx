import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3 } from 'lucide-react'

export default function AnalyticsPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header 
        title="Analytics" 
        description="Platform-wide analytics and insights"
      />
      
      <div className="flex-1 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Platform Analytics</CardTitle>
            <CardDescription>Coming soon - detailed analytics and reports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Analytics Coming Soon</p>
              <p className="text-sm max-w-md mx-auto mt-2">
                We&apos;re building comprehensive analytics including user growth, 
                lead conversion rates, revenue trends, and more.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}












