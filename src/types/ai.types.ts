// AI Provider Types

export type AIProvider = 'openai' | 'gemini' | 'groq'

export interface AIConfig {
  id: string
  org_id: string
  provider: AIProvider
  model_name: string
  api_key: string | null
  is_active: boolean
  is_default_transcription: boolean
  is_default_summary: boolean
  config: Record<string, unknown>
  total_requests: number
  total_tokens_used: number
  last_used_at: string | null
  created_at: string
  updated_at: string
}

export interface CallRecording {
  id: string
  org_id: string
  lead_id: string | null
  user_id: string | null
  phone_number: string
  call_direction: 'inbound' | 'outbound'
  duration_seconds: number | null
  recording_date: string
  drive_file_id: string | null
  drive_file_url: string | null
  drive_file_name: string | null
  file_size_bytes: number | null
  transcript: string | null
  summary: string | null
  sentiment: 'positive' | 'neutral' | 'negative' | null
  sentiment_reasoning: string | null
  key_points: string[]
  action_items: string[]
  next_steps: string | null
  call_quality: CallQualityMetrics | null
  ai_model_used: string | null
  transcription_model: string | null
  processing_status: 'pending' | 'processing' | 'completed' | 'failed'
  processing_error: string | null
  processed_at: string | null
  created_at: string
  updated_at: string
  // Joined data
  leads?: {
    id: string
    name: string
    phone: string | null
  }
  users?: {
    id: string
    name: string
  }
}

export interface DriveSyncSettings {
  id: string
  user_id: string
  org_id: string
  folder_id: string | null
  folder_name: string
  is_enabled: boolean
  last_sync_at: string | null
  last_sync_file_count: number
  sync_error: string | null
  created_at: string
  updated_at: string
}

// AI Processing Types

export interface TranscriptionResult {
  text: string
  duration_seconds: number
  language?: string
  confidence?: number
}

export interface CallQualityMetrics {
  overall_score: number // 1-10
  communication_clarity: number // 1-10
  product_knowledge: number // 1-10
  objection_handling: number // 1-10
  rapport_building: number // 1-10
  closing_technique: number // 1-10
  areas_of_improvement: string[]
  strengths: string[]
}

export interface CallSummary {
  summary: string
  sentiment: 'positive' | 'neutral' | 'negative'
  sentiment_reasoning: string
  key_points: string[]
  action_items: string[]
  next_steps: string | null
  call_quality?: CallQualityMetrics
}

export interface AIProviderInterface {
  name: AIProvider
  transcribe(audioUrl: string): Promise<TranscriptionResult>
  summarize(transcript: string, context?: string): Promise<CallSummary>
  testConnection(): Promise<boolean>
}

// Drive API Types

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size: string
  createdTime: string
  modifiedTime: string
  webViewLink?: string
  webContentLink?: string
}

export interface DriveSyncResult {
  success: boolean
  files_found: number
  files_matched: number
  files_imported: number
  errors: string[]
}

// Analytics Types

export interface CallAnalytics {
  total_calls: number
  total_duration_minutes: number
  average_duration_minutes: number
  calls_by_sentiment: {
    positive: number
    neutral: number
    negative: number
  }
  calls_by_status: {
    pending: number
    processing: number
    completed: number
    failed: number
  }
  calls_by_date: {
    date: string
    count: number
  }[]
  top_callers: {
    user_id: string
    user_name: string
    call_count: number
    total_duration: number
  }[]
}

// Default model options (fallback when API fetch fails)
// These should be updated periodically as providers change their models
export const AI_MODELS = {
  openai: {
    transcription: ['whisper-1'],
    summary: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo']
  },
  gemini: {
    transcription: [], // Gemini doesn't have native transcription
    summary: ['gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro']
  },
  groq: {
    transcription: ['whisper-large-v3', 'whisper-large-v3-turbo'],
    summary: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it']
  }
} as const

export const PROVIDER_INFO = {
  openai: {
    name: 'OpenAI',
    description: 'GPT models and Whisper transcription',
    website: 'https://platform.openai.com',
    pricing: 'Pay per token/minute'
  },
  gemini: {
    name: 'Google Gemini',
    description: 'Google AI models for summarization',
    website: 'https://ai.google.dev',
    pricing: 'Free tier available'
  },
  groq: {
    name: 'Groq',
    description: 'Fast inference with Llama and Whisper',
    website: 'https://groq.com',
    pricing: 'Free tier with rate limits'
  }
} as const


