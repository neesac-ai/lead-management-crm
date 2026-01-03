'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', {
          // Force fresh service worker to avoid location-specific cache issues
          updateViaCache: 'none'
        })
        .then((registration) => {
          console.log('Service Worker registered with scope:', registration.scope)

          // Force immediate update check to handle location-specific cache issues
          registration.update()

          // Listen for service worker updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New service worker available - reload to activate
                  console.log('New Service Worker available, reloading page...')
                  window.location.reload()
                }
              })
            }
          })

          // Check for updates more frequently to catch location-specific issues
          setInterval(() => {
            registration.update()
          }, 10 * 60 * 1000) // Check every 10 minutes (more frequent than hourly)
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error)
        })
    }
  }, [])

  return null
}










