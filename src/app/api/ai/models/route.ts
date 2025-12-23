import { NextRequest, NextResponse } from 'next/server'

interface ModelInfo {
  id: string
  name: string
  type: 'transcription' | 'summary' | 'both'
}

// Fetch available models from OpenAI
async function fetchOpenAIModels(apiKey: string): Promise<ModelInfo[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    
    if (!response.ok) return []
    
    const data = await response.json()
    const models: ModelInfo[] = []
    
    // Filter relevant models
    for (const model of data.data || []) {
      if (model.id === 'whisper-1') {
        models.push({ id: model.id, name: 'Whisper', type: 'transcription' })
      } else if (model.id.startsWith('gpt-4') || model.id.startsWith('gpt-3.5')) {
        // Only include chat models, not fine-tuned or deprecated
        if (!model.id.includes('instruct') && !model.id.includes('0301') && !model.id.includes('0314')) {
          models.push({ id: model.id, name: model.id, type: 'summary' })
        }
      }
    }
    
    return models
  } catch (error) {
    console.error('Error fetching OpenAI models:', error)
    return []
  }
}

// Fetch available models from Groq
async function fetchGroqModels(apiKey: string): Promise<ModelInfo[]> {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    
    if (!response.ok) return []
    
    const data = await response.json()
    const models: ModelInfo[] = []
    
    for (const model of data.data || []) {
      // Whisper models for transcription
      if (model.id.includes('whisper')) {
        models.push({ id: model.id, name: model.id, type: 'transcription' })
      }
      // LLM models for summarization
      else if (
        model.id.includes('llama') || 
        model.id.includes('mixtral') || 
        model.id.includes('gemma')
      ) {
        // Skip deprecated models
        if (!model.id.includes('tool-use') && model.active !== false) {
          models.push({ id: model.id, name: model.id, type: 'summary' })
        }
      }
    }
    
    return models
  } catch (error) {
    console.error('Error fetching Groq models:', error)
    return []
  }
}

// Gemini models (Google doesn't have a public models list API, use known models)
function getGeminiModels(): ModelInfo[] {
  return [
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', type: 'summary' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', type: 'summary' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', type: 'summary' },
  ]
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const provider = searchParams.get('provider')
  const apiKey = searchParams.get('apiKey')

  if (!provider) {
    return NextResponse.json({ error: 'Provider required' }, { status: 400 })
  }

  let models: ModelInfo[] = []

  switch (provider) {
    case 'openai':
      if (apiKey) {
        models = await fetchOpenAIModels(apiKey)
      }
      // Fallback to defaults if no API key or fetch failed
      if (models.length === 0) {
        models = [
          { id: 'whisper-1', name: 'Whisper', type: 'transcription' },
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini', type: 'summary' },
          { id: 'gpt-4o', name: 'GPT-4o', type: 'summary' },
          { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', type: 'summary' },
          { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', type: 'summary' },
        ]
      }
      break

    case 'groq':
      if (apiKey) {
        models = await fetchGroqModels(apiKey)
      }
      // Fallback to defaults if no API key or fetch failed
      if (models.length === 0) {
        models = [
          { id: 'whisper-large-v3', name: 'Whisper Large V3', type: 'transcription' },
          { id: 'whisper-large-v3-turbo', name: 'Whisper Large V3 Turbo', type: 'transcription' },
          { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', type: 'summary' },
          { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', type: 'summary' },
          { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', type: 'summary' },
          { id: 'gemma2-9b-it', name: 'Gemma 2 9B', type: 'summary' },
        ]
      }
      break

    case 'gemini':
      models = getGeminiModels()
      break

    default:
      return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
  }

  // Separate by type
  const transcriptionModels = models.filter(m => m.type === 'transcription' || m.type === 'both')
  const summaryModels = models.filter(m => m.type === 'summary' || m.type === 'both')

  return NextResponse.json({
    provider,
    transcription: transcriptionModels,
    summary: summaryModels,
    fetched: !!apiKey,
  })
}


