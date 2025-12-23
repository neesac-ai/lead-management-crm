'use client'

import { useEffect, useState, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  Plus,
  Settings,
  Key,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  ExternalLink,
  Sparkles,
  Mic,
  Brain,
} from 'lucide-react'
import { AI_MODELS, PROVIDER_INFO } from '@/types/ai.types'
import type { AIConfig, AIProvider } from '@/types/ai.types'

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

export default function AISettingsPage({ params }: PageProps) {
  const { orgSlug } = use(params)
  const [configs, setConfigs] = useState<AIConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [savingProvider, setSavingProvider] = useState<string | null>(null)
  
  // Form state
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('openai')
  const [apiKey, setApiKey] = useState('')
  const [transcriptionModel, setTranscriptionModel] = useState('')
  const [summaryModel, setSummaryModel] = useState('')
  const [availableModels, setAvailableModels] = useState<{
    transcription: { id: string; name: string }[]
    summary: { id: string; name: string }[]
  }>({ transcription: [], summary: [] })
  const [loadingModels, setLoadingModels] = useState(false)

  useEffect(() => {
    fetchConfigs()
  }, [orgSlug])

  // Fetch available models when provider or API key changes
  useEffect(() => {
    fetchModels()
  }, [selectedProvider])

  const fetchModels = async (key?: string) => {
    setLoadingModels(true)
    try {
      const params = new URLSearchParams({ provider: selectedProvider })
      if (key || apiKey) {
        params.append('apiKey', key || apiKey)
      }
      
      const response = await fetch(`/api/ai/models?${params}`)
      const data = await response.json()
      
      if (data.transcription || data.summary) {
        setAvailableModels({
          transcription: data.transcription || [],
          summary: data.summary || [],
        })
        
        // Set defaults if not already set
        if (!transcriptionModel && data.transcription?.length > 0) {
          setTranscriptionModel(data.transcription[0].id)
        }
        if (!summaryModel && data.summary?.length > 0) {
          setSummaryModel(data.summary[0].id)
        }
      }
    } catch (error) {
      console.error('Error fetching models:', error)
    }
    setLoadingModels(false)
  }

  const fetchConfigs = async () => {
    const supabase = createClient()
    
    // Get org ID from slug
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', orgSlug)
      .single()

    if (!org) return

    const { data, error } = await supabase
      .from('ai_config')
      .select('*')
      .eq('org_id', org.id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching AI configs:', error)
      toast.error('Failed to load AI configurations')
    } else {
      setConfigs(data || [])
    }
    
    setLoading(false)
  }

  const handleAddProvider = async () => {
    if (!apiKey.trim()) {
      toast.error('API key is required')
      return
    }

    setSavingProvider(selectedProvider)
    const supabase = createClient()

    // Get org ID
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', orgSlug)
      .single()

    if (!org) {
      toast.error('Organization not found')
      setSavingProvider(null)
      return
    }

    // Get default model for the provider (use dynamic models if available, fallback to static)
    const defaultSummaryModel = availableModels.summary[0]?.id || AI_MODELS[selectedProvider].summary[0] || ''
    const defaultTranscriptionModel = availableModels.transcription[0]?.id || AI_MODELS[selectedProvider].transcription[0] || ''

    const { error } = await supabase
      .from('ai_config')
      .upsert({
        org_id: org.id,
        provider: selectedProvider,
        model_name: summaryModel || defaultSummaryModel,
        api_key: apiKey,
        is_active: true,
        is_default_transcription: availableModels.transcription.length > 0 || AI_MODELS[selectedProvider].transcription.length > 0,
        is_default_summary: configs.length === 0, // First provider is default
        config: {
          transcription_model: transcriptionModel || defaultTranscriptionModel,
        },
      }, {
        onConflict: 'org_id,provider',
      })

    if (error) {
      console.error('Error saving AI config:', error)
      toast.error('Failed to save configuration')
    } else {
      toast.success(`${PROVIDER_INFO[selectedProvider].name} configured successfully`)
      setIsDialogOpen(false)
      setApiKey('')
      setTranscriptionModel('')
      setSummaryModel('')
      fetchConfigs()
    }
    
    setSavingProvider(null)
  }

  const handleTestConnection = async (config: AIConfig) => {
    setTestingProvider(config.provider)
    
    try {
      const response = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.provider,
          apiKey: config.api_key,
        }),
      })

      const result = await response.json()
      
      if (result.success) {
        toast.success(`${PROVIDER_INFO[config.provider as AIProvider].name} connection successful!`)
      } else {
        toast.error(`Connection failed: ${result.error}`)
      }
    } catch {
      toast.error('Failed to test connection')
    }
    
    setTestingProvider(null)
  }

  const handleToggleActive = async (config: AIConfig) => {
    const supabase = createClient()
    
    const { error } = await supabase
      .from('ai_config')
      .update({ is_active: !config.is_active })
      .eq('id', config.id)

    if (error) {
      toast.error('Failed to update status')
    } else {
      fetchConfigs()
      toast.success(`${PROVIDER_INFO[config.provider as AIProvider].name} ${config.is_active ? 'disabled' : 'enabled'}`)
    }
  }

  const handleSetDefaultTranscription = async (config: AIConfig) => {
    const supabase = createClient()
    
    // First, remove default from all
    await supabase
      .from('ai_config')
      .update({ is_default_transcription: false })
      .eq('org_id', config.org_id)

    // Set this one as default
    const { error } = await supabase
      .from('ai_config')
      .update({ is_default_transcription: true })
      .eq('id', config.id)

    if (error) {
      toast.error('Failed to set default')
    } else {
      fetchConfigs()
      toast.success(`${PROVIDER_INFO[config.provider as AIProvider].name} set as default for transcription`)
    }
  }

  const handleSetDefaultSummary = async (config: AIConfig) => {
    const supabase = createClient()
    
    // First, remove default from all
    await supabase
      .from('ai_config')
      .update({ is_default_summary: false })
      .eq('org_id', config.org_id)

    // Set this one as default
    const { error } = await supabase
      .from('ai_config')
      .update({ is_default_summary: true })
      .eq('id', config.id)

    if (error) {
      toast.error('Failed to set default')
    } else {
      fetchConfigs()
      toast.success(`${PROVIDER_INFO[config.provider as AIProvider].name} set as default for summaries`)
    }
  }

  const handleDeleteConfig = async (config: AIConfig) => {
    const supabase = createClient()
    
    const { error } = await supabase
      .from('ai_config')
      .delete()
      .eq('id', config.id)

    if (error) {
      toast.error('Failed to delete configuration')
    } else {
      toast.success(`${PROVIDER_INFO[config.provider as AIProvider].name} configuration deleted`)
      fetchConfigs()
    }
  }

  const availableProviders = (['openai', 'gemini', 'groq'] as AIProvider[]).filter(
    p => !configs.find(c => c.provider === p)
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            AI Configuration
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure AI providers for call transcription and analysis
          </p>
        </div>
        
        {availableProviders.length > 0 && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Provider
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add AI Provider</DialogTitle>
                <DialogDescription>
                  Configure a new AI provider for transcription and analysis
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Select 
                    value={selectedProvider} 
                    onValueChange={(v) => {
                      setSelectedProvider(v as AIProvider)
                      setTranscriptionModel('')
                      setSummaryModel('')
                      setAvailableModels({ transcription: [], summary: [] })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProviders.map((p) => (
                        <SelectItem key={p} value={p}>
                          {PROVIDER_INFO[p].name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {PROVIDER_INFO[selectedProvider].description}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>API Key</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      onBlur={() => apiKey && fetchModels(apiKey)}
                      placeholder="Enter your API key"
                      className="pl-9"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <a 
                      href={PROVIDER_INFO[selectedProvider].website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                      Get API key <ExternalLink className="w-3 h-3" />
                    </a>
                    {apiKey && (
                      <button 
                        type="button"
                        onClick={() => fetchModels(apiKey)}
                        className="text-xs text-primary hover:underline"
                      >
                        {loadingModels ? 'Loading models...' : 'Refresh models'}
                      </button>
                    )}
                  </div>
                </div>

                {availableModels.transcription.length > 0 && (
                  <div className="space-y-2">
                    <Label>Transcription Model</Label>
                    <Select 
                      value={transcriptionModel || availableModels.transcription[0]?.id} 
                      onValueChange={setTranscriptionModel}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableModels.transcription.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {availableModels.summary.length > 0 && (
                  <div className="space-y-2">
                    <Label>Summary Model</Label>
                    <Select 
                      value={summaryModel || availableModels.summary[0]?.id} 
                      onValueChange={setSummaryModel}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableModels.summary.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {loadingModels && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading available models...
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddProvider} disabled={!!savingProvider}>
                  {savingProvider && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Add Provider
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Provider Cards */}
      {configs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Settings className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No AI Providers Configured</h3>
            <p className="text-muted-foreground text-center max-w-sm mt-2">
              Add an AI provider to enable call transcription and intelligent analysis
            </p>
            <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Provider
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {configs.map((config) => {
            const provider = config.provider as AIProvider
            const info = PROVIDER_INFO[provider]
            // Check if provider has transcription capability
            const hasTranscription = AI_MODELS[provider].transcription.length > 0 || 
              (config.config as { transcription_model?: string })?.transcription_model

            return (
              <Card key={config.id} className={!config.is_active ? 'opacity-60' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{info.name}</CardTitle>
                    <Switch
                      checked={config.is_active}
                      onCheckedChange={() => handleToggleActive(config)}
                    />
                  </div>
                  <CardDescription>{info.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Capabilities */}
                  <div className="flex flex-wrap gap-2">
                    {hasTranscription && (
                      <Badge 
                        variant={config.is_default_transcription ? 'default' : 'secondary'}
                        className="cursor-pointer"
                        onClick={() => handleSetDefaultTranscription(config)}
                      >
                        <Mic className="w-3 h-3 mr-1" />
                        {config.is_default_transcription ? 'Default Transcription' : 'Transcription'}
                      </Badge>
                    )}
                    <Badge 
                      variant={config.is_default_summary ? 'default' : 'secondary'}
                      className="cursor-pointer"
                      onClick={() => handleSetDefaultSummary(config)}
                    >
                      <Brain className="w-3 h-3 mr-1" />
                      {config.is_default_summary ? 'Default Summary' : 'Summary'}
                    </Badge>
                  </div>

                  {/* Model Info */}
                  <div className="text-sm space-y-1">
                    <p className="text-muted-foreground">
                      Model: <span className="text-foreground">{config.model_name}</span>
                    </p>
                    {config.total_requests > 0 && (
                      <p className="text-muted-foreground">
                        Requests: <span className="text-foreground">{config.total_requests}</span>
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleTestConnection(config)}
                      disabled={testingProvider === config.provider}
                    >
                      {testingProvider === config.provider ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                      )}
                      Test
                    </Button>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {info.name} Configuration?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will remove the API key and configuration. You can add it again later.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteConfig(config)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-3 mt-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mic className="w-4 h-4 text-blue-500" />
              Transcription
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            OpenAI Whisper and Groq support audio transcription. Groq offers free tier with rate limits.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-500" />
              AI Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            All providers can generate call summaries, sentiment analysis, and action items.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Cost Saving
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Use Groq (free) for transcription and Gemini (free tier) for summaries to minimize costs.
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


