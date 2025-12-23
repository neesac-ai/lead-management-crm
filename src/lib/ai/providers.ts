// AI Provider Abstraction Layer
// Supports multiple AI providers for transcription and summarization

import type { 
  AIProvider, 
  AIProviderInterface, 
  TranscriptionResult, 
  CallSummary 
} from '@/types/ai.types'

// Base class for AI providers
export abstract class BaseAIProvider implements AIProviderInterface {
  abstract name: AIProvider
  protected apiKey: string
  protected model: string

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey
    this.model = model
  }

  abstract transcribe(audioUrl: string): Promise<TranscriptionResult>
  abstract summarize(transcript: string, context?: string): Promise<CallSummary>
  abstract testConnection(): Promise<boolean>

  protected getSummaryPrompt(transcript: string, context?: string): string {
    return `Analyze this sales call transcript and provide a comprehensive assessment.

${context ? `Context: ${context}\n` : ''}
Transcript:
${transcript}

Provide the following in JSON format:
{
  "summary": "A 2-3 sentence summary of the call",
  "sentiment": "positive" | "neutral" | "negative",
  "sentiment_reasoning": "Brief explanation of why you classified the sentiment this way",
  "key_points": ["Array of key discussion points"],
  "action_items": ["Array of action items or follow-ups needed"],
  "next_steps": "Recommended next steps for the sales rep",
  "call_quality": {
    "overall_score": 7,
    "communication_clarity": 8,
    "product_knowledge": 7,
    "objection_handling": 6,
    "rapport_building": 7,
    "closing_technique": 5,
    "strengths": ["Array of things the sales rep did well"],
    "areas_of_improvement": ["Array of areas where the sales rep can improve"]
  }
}

For call_quality scores, use 1-10 scale where:
- 1-3: Poor
- 4-6: Average  
- 7-8: Good
- 9-10: Excellent

Only respond with valid JSON, no additional text.`
  }

  protected parseSummaryResponse(response: string): CallSummary {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          summary: parsed.summary || '',
          sentiment: parsed.sentiment || 'neutral',
          sentiment_reasoning: parsed.sentiment_reasoning || '',
          key_points: Array.isArray(parsed.key_points) ? parsed.key_points : [],
          action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
          next_steps: parsed.next_steps || null,
          call_quality: parsed.call_quality ? {
            overall_score: parsed.call_quality.overall_score || 5,
            communication_clarity: parsed.call_quality.communication_clarity || 5,
            product_knowledge: parsed.call_quality.product_knowledge || 5,
            objection_handling: parsed.call_quality.objection_handling || 5,
            rapport_building: parsed.call_quality.rapport_building || 5,
            closing_technique: parsed.call_quality.closing_technique || 5,
            strengths: Array.isArray(parsed.call_quality.strengths) ? parsed.call_quality.strengths : [],
            areas_of_improvement: Array.isArray(parsed.call_quality.areas_of_improvement) ? parsed.call_quality.areas_of_improvement : [],
          } : undefined
        }
      }
    } catch {
      // If parsing fails, return basic structure
    }
    
    return {
      summary: response.slice(0, 500),
      sentiment: 'neutral',
      sentiment_reasoning: '',
      key_points: [],
      action_items: [],
      next_steps: null,
      call_quality: undefined
    }
  }
}

// OpenAI Provider
export class OpenAIProvider extends BaseAIProvider {
  name: AIProvider = 'openai'

  async transcribe(audioUrl: string): Promise<TranscriptionResult> {
    // Fetch the audio file
    const audioResponse = await fetch(audioUrl)
    const audioBlob = await audioResponse.blob()
    
    const formData = new FormData()
    formData.append('file', audioBlob, 'recording.mp3')
    formData.append('model', 'whisper-1')
    formData.append('response_format', 'verbose_json')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI transcription failed: ${error}`)
    }

    const data = await response.json()
    
    return {
      text: data.text,
      duration_seconds: Math.round(data.duration || 0),
      language: data.language,
      confidence: undefined
    }
  }

  async summarize(transcript: string, context?: string): Promise<CallSummary> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a sales call analyzer. Analyze call transcripts and provide structured insights.'
          },
          {
            role: 'user',
            content: this.getSummaryPrompt(transcript, context)
          }
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI summary failed: ${error}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content || ''
    
    return this.parseSummaryResponse(content)
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      })
      return response.ok
    } catch {
      return false
    }
  }
}

// Google Gemini Provider
export class GeminiProvider extends BaseAIProvider {
  name: AIProvider = 'gemini'

  async transcribe(): Promise<TranscriptionResult> {
    // Gemini doesn't have native transcription API
    // This provider should only be used for summarization
    throw new Error('Gemini does not support transcription. Use OpenAI or Groq for transcription.')
  }

  async summarize(transcript: string, context?: string): Promise<CallSummary> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model || 'gemini-1.5-flash'}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: this.getSummaryPrompt(transcript, context)
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1000,
          }
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Gemini summary failed: ${error}`)
    }

    const data = await response.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    
    return this.parseSummaryResponse(content)
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`
      )
      return response.ok
    } catch {
      return false
    }
  }
}

// Groq Provider
export class GroqProvider extends BaseAIProvider {
  name: AIProvider = 'groq'

  async transcribe(audioUrl: string): Promise<TranscriptionResult> {
    // Fetch the audio file
    const audioResponse = await fetch(audioUrl)
    const audioBlob = await audioResponse.blob()
    
    const formData = new FormData()
    formData.append('file', audioBlob, 'recording.mp3')
    formData.append('model', 'whisper-large-v3')
    formData.append('response_format', 'verbose_json')

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Groq transcription failed: ${error}`)
    }

    const data = await response.json()
    
    return {
      text: data.text,
      duration_seconds: Math.round(data.duration || 0),
      language: data.language,
      confidence: undefined
    }
  }

  async summarize(transcript: string, context?: string): Promise<CallSummary> {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model || 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a sales call analyzer. Analyze call transcripts and provide structured insights.'
          },
          {
            role: 'user',
            content: this.getSummaryPrompt(transcript, context)
          }
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Groq summary failed: ${error}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content || ''
    
    return this.parseSummaryResponse(content)
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      })
      return response.ok
    } catch {
      return false
    }
  }
}

// Factory function to create provider instance
export function createAIProvider(
  provider: AIProvider, 
  apiKey: string, 
  model?: string
): AIProviderInterface {
  switch (provider) {
    case 'openai':
      return new OpenAIProvider(apiKey, model || 'gpt-4o-mini')
    case 'gemini':
      return new GeminiProvider(apiKey, model || 'gemini-1.5-flash')
    case 'groq':
      return new GroqProvider(apiKey, model || 'llama-3.3-70b-versatile')
    default:
      throw new Error(`Unknown AI provider: ${provider}`)
  }
}

// Get provider that supports transcription
export function getTranscriptionProvider(
  configs: { provider: AIProvider; apiKey: string; model?: string }[]
): AIProviderInterface | null {
  // Prioritize: Groq (free) > OpenAI
  const groqConfig = configs.find(c => c.provider === 'groq')
  if (groqConfig) {
    return createAIProvider('groq', groqConfig.apiKey, 'whisper-large-v3')
  }
  
  const openaiConfig = configs.find(c => c.provider === 'openai')
  if (openaiConfig) {
    return createAIProvider('openai', openaiConfig.apiKey, 'whisper-1')
  }
  
  return null
}


