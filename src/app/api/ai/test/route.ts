import { NextRequest, NextResponse } from 'next/server'
import { createAIProvider } from '@/lib/ai/providers'
import type { AIProvider } from '@/types/ai.types'

export async function POST(request: NextRequest) {
  try {
    const { provider, apiKey } = await request.json()

    if (!provider || !apiKey) {
      return NextResponse.json(
        { success: false, error: 'Provider and API key are required' },
        { status: 400 }
      )
    }

    const aiProvider = createAIProvider(provider as AIProvider, apiKey)
    const connected = await aiProvider.testConnection()

    if (connected) {
      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json(
        { success: false, error: 'Could not connect to provider' },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('AI test connection error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}



