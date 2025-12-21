import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "LeadFlow CRM - Modern Lead Management",
  description: "A powerful multi-tenant CRM for lead management, sales pipeline, and customer subscriptions.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Lead CRM",
  },
  formatDetection: {
    telephone: true,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* PWA Meta Tags for iOS */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Lead CRM" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        
        {/* Splash screens for iOS */}
        <link rel="apple-touch-startup-image" href="/icons/icon-512x512.png" />
      </head>
      <body className={`${outfit.variable} font-sans antialiased`}>
        {children}
        <Toaster position="top-right" richColors />
        <ServiceWorkerRegistration />
        <InstallPrompt />
      </body>
    </html>
  );
}
