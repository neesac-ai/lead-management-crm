'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Download,
  Smartphone,
  MapPin,
  Phone,
  Mic,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react'
import { isNativeApp } from '@/lib/native-bridge'

export default function DownloadPage() {
  const [isAndroid, setIsAndroid] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userAgent = window.navigator.userAgent.toLowerCase()
      setIsAndroid(userAgent.includes('android'))
      setIsIOS(userAgent.includes('iphone') || userAgent.includes('ipad'))
    }
  }, [])

  const handleDownload = () => {
    // TODO: Replace with actual APK download URL
    const apkUrl = '/downloads/bharatcrm-v1.0.0.apk'
    window.open(apkUrl, '_blank')
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold">Download BharatCRM App</h1>
            <p className="text-muted-foreground">
              Native Android app with advanced call tracking, recording, and location features
            </p>
          </div>

          {/* Already using app */}
          {isNativeApp() && (
            <Card className="border-green-500/20 bg-green-500/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium">You're already using the native app!</p>
                    <p className="text-sm text-muted-foreground">
                      All native features are available.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Features */}
          <Card>
            <CardHeader>
              <CardTitle>Native App Features</CardTitle>
              <CardDescription>
                Enhanced capabilities not available in the web version
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-start gap-3 p-4 border rounded-lg">
                  <Phone className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm mb-1">Exact Call Tracking</p>
                    <p className="text-xs text-muted-foreground">
                      Track exact call duration and status from device call logs
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 border rounded-lg">
                  <Mic className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm mb-1">Automatic Recording</p>
                    <p className="text-xs text-muted-foreground">
                      Record calls automatically and upload for AI analysis
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 border rounded-lg">
                  <MapPin className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm mb-1">Location Tracking</p>
                    <p className="text-xs text-muted-foreground">
                      GPS tracking, check-ins, and geofencing for automatic check-ins
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 border rounded-lg">
                  <Smartphone className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm mb-1">Offline Support</p>
                    <p className="text-xs text-muted-foreground">
                      Works offline and syncs when connection is available
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Download Section */}
          {isAndroid && !isNativeApp() && (
            <Card>
              <CardHeader>
                <CardTitle>Download for Android</CardTitle>
                <CardDescription>
                  Install the APK file on your Android device
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button onClick={handleDownload} size="lg" className="w-full">
                  <Download className="h-5 w-5 mr-2" />
                  Download APK (v1.0.0)
                </Button>

                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-sm text-yellow-600 mb-2">
                        Installation Instructions
                      </p>
                      <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                        <li>Download the APK file</li>
                        <li>Enable "Install from Unknown Sources" in Android settings</li>
                        <li>Open the downloaded APK file</li>
                        <li>Follow the installation prompts</li>
                        <li>Grant required permissions when prompted</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {isIOS && (
            <Card>
              <CardHeader>
                <CardTitle>iOS Support</CardTitle>
                <CardDescription>
                  iOS app coming soon
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  We're working on an iOS version. For now, you can use the web app which works great on iOS Safari.
                </p>
              </CardContent>
            </Card>
          )}

          {!isAndroid && !isIOS && (
            <Card>
              <CardHeader>
                <CardTitle>Desktop/Other Devices</CardTitle>
                <CardDescription>
                  Use the web app on desktop and other devices
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  The native app is currently available for Android only. You can use the web app which provides most features.
                </p>
                <Button asChild variant="outline">
                  <a href="/">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Go to Web App
                  </a>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Requirements */}
          <Card>
            <CardHeader>
              <CardTitle>Requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Android 5.0 (API 21) or higher</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Internet connection for syncing data</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Permissions: Location, Phone, Microphone (for recording)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}


