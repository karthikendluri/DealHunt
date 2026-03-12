// Candidate free models on OpenRouter
export const CANDIDATE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-4-scout:free',
  'deepseek/deepseek-r1:free',
  'qwen/qwen2.5-72b-instruct:free',
  'microsoft/phi-4:free',
  'mistralai/mistral-7b-instruct:free',
  'openchat/openchat-7b:free',
]

export const MODEL_LABELS = {
  'meta-llama/llama-3.3-70b-instruct:free':        { name: 'Llama 3.3 70B',    color: '#0082fb' },
  'deepseek/deepseek-chat-v3-0324:free':           { name: 'DeepSeek V3',      color: '#7c6bff' },
  'mistralai/mistral-small-3.1-24b-instruct:free': { name: 'Mistral Small',    color: '#f97316' },
  'google/gemini-2.0-flash-exp:free':              { name: 'Gemini 2.0 Flash', color: '#4285f4' },
  'meta-llama/llama-4-scout:free':                 { name: 'Llama 4 Scout',    color: '#00c896' },
  'deepseek/deepseek-r1:free':                     { name: 'DeepSeek R1',      color: '#a78bff' },
  'qwen/qwen2.5-72b-instruct:free':                { name: 'Qwen2.5 72B',      color: '#ff6a00' },
  'microsoft/phi-4:free':                          { name: 'Phi-4',            color: '#00a4ef' },
  'mistralai/mistral-7b-instruct:free':            { name: 'Mistral 7B',       color: '#fb923c' },
  'openchat/openchat-7b:free':                     { name: 'OpenChat 7B',      color: '#10b981' },
}

// Probe a single model with an 8s timeout
export async function probeModel(modelId, orKey) {
  if (!orKey) return false
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${orKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://dealhunt.vercel.app',
        'X-Title': 'DealHunt',
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'reply ok' }],
        max_tokens: 5,
        temperature: 0,
      }),
    })
    clearTimeout(timer)
    const data = await res.json()
    if (data.error) return false
    return !!data.choices?.[0]?.message?.content
  } catch {
    clearTimeout(timer)
    return false
  }
}

// Probe ALL models in PARALLEL — fires all requests at once, calls onResult as each finishes
// Returns the highest-priority working model ID (or null)
export async function probeAllModels(orKey, onResult) {
  if (!orKey) {
    CANDIDATE_MODELS.forEach(id => onResult(id, 'fail'))
    return null
  }

  // Fire all probes simultaneously
  const probePromises = CANDIDATE_MODELS.map(async (id) => {
    const ok = await probeModel(id, orKey)
    onResult(id, ok ? 'ok' : 'fail')
    return { id, ok }
  })

  const results = await Promise.all(probePromises)

  // Return first working model in priority order
  for (const id of CANDIDATE_MODELS) {
    const r = results.find(r => r.id === id)
    if (r?.ok) return id
  }
  return null
}
