import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FileQuestion } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen gradient-mesh flex items-center justify-center p-6">
      <div className="text-center space-y-6 animate-fade-in">
        <div className="mx-auto w-20 h-20 rounded-full bg-muted flex items-center justify-center">
          <FileQuestion className="w-10 h-10 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-bold">404</h1>
          <h2 className="text-xl font-semibold">Page not found</h2>
          <p className="text-muted-foreground max-w-md">
            Sorry, we couldn&apos;t find the page you&apos;re looking for. 
            It might have been moved or doesn&apos;t exist.
          </p>
        </div>
        <div className="flex gap-4 justify-center">
          <Link href="/">
            <Button>Go Home</Button>
          </Link>
          <Link href="/login">
            <Button variant="outline">Sign In</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}











