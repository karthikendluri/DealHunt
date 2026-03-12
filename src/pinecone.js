// Pinecone vector database integration
// Fixed: proper API version header, namespace on all calls, robust error handling

const PC_KEY  = import.meta.env.VITE_PINECONE_KEY
const PC_HOST = import.meta.env.VITE_PINECONE_HOST
const OR_KEY  = import.meta.env.VITE_OPENROUTER_KEY

function pcHeaders() {
  return {
    'Api-Key': PC_KEY,
    'Content-Type': 'application/json',
    'X-Pinecone-API-Version': '2024-07',
  }
}

// ── Generate embedding via OpenRouter ───────────────────────────────────────
export async function getEmbedding(text) {
  if (!OR_KEY) return null
  try {
    const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OR_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/text-embedding-3-small',
        input: text,
      }),
    })
    if (!res.ok) { console.warn('Embedding HTTP error:', res.status); return null }
    const data = await res.json()
    if (data.error) { console.warn('Embedding API error:', data.error.message); return null }
    return data?.data?.[0]?.embedding || null
  } catch (e) {
    console.warn('Embedding error:', e)
    return null
  }
}

// ── Test Pinecone connection ─────────────────────────────────────────────────
export async function testPineconeConnection() {
  if (!PC_KEY || !PC_HOST) return { ok: false, error: 'Missing keys' }
  try {
    const res = await fetch(`${PC_HOST}/describe_index_stats`, {
      method: 'POST',
      headers: pcHeaders(),
      body: JSON.stringify({}),
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data?.message || `HTTP ${res.status}` }
    return { ok: true, totalVectors: data.totalVectorCount ?? data.total_vector_count ?? 0 }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// ── Upsert deals into Pinecone ───────────────────────────────────────────────
export async function storeDeals(query, deals) {
  if (!PC_KEY || !PC_HOST) return false
  const embedding = await getEmbedding(query)
  if (!embedding) return false

  const id = `search_${Date.now()}_${query.replace(/\s+/g, '_').slice(0, 40)}`

  try {
    const res = await fetch(`${PC_HOST}/vectors/upsert`, {
      method: 'POST',
      headers: pcHeaders(),
      body: JSON.stringify({
        namespace: 'searches',
        vectors: [{
          id,
          values: embedding,
          metadata: {
            query,
            deals: JSON.stringify(deals),
            timestamp: Date.now(),
            deal_count: deals.length,
            best_discount: Math.max(...deals.map(d => d.discount_percent || 0)),
          },
        }],
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.warn('Pinecone upsert failed:', res.status, err?.message)
      return false
    }
    return true
  } catch (e) {
    console.warn('Pinecone upsert error:', e)
    return false
  }
}

// ── Query Pinecone for similar past searches ─────────────────────────────────
export async function retrieveSimilarDeals(query, topK = 3) {
  if (!PC_KEY || !PC_HOST) return []
  const embedding = await getEmbedding(query)
  if (!embedding) return []

  try {
    const res = await fetch(`${PC_HOST}/query`, {
      method: 'POST',
      headers: pcHeaders(),
      body: JSON.stringify({
        namespace: 'searches',
        vector: embedding,
        topK,
        includeMetadata: true,
        includeValues: false,
      }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data?.matches || [])
      .filter(m => m.score >= 0.85)
      .map(m => ({
        query:         m.metadata.query,
        deals:         JSON.parse(m.metadata.deals || '[]'),
        timestamp:     m.metadata.timestamp,
        deal_count:    m.metadata.deal_count,
        best_discount: m.metadata.best_discount,
        score:         m.score,
      }))
  } catch (e) {
    console.warn('Pinecone query error:', e)
    return []
  }
}

// ── Fetch recent searches from Pinecone ─────────────────────────────────────
export async function getRecentSearches() {
  if (!PC_KEY || !PC_HOST) return []
  const embedding = await getEmbedding('deals discount sale products')
  if (!embedding) return []

  try {
    const res = await fetch(`${PC_HOST}/query`, {
      method: 'POST',
      headers: pcHeaders(),
      body: JSON.stringify({
        namespace: 'searches',
        vector: embedding,
        topK: 10,
        includeMetadata: true,
        includeValues: false,
      }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data?.matches || [])
      .map(m => ({
        query:         m.metadata.query,
        deal_count:    m.metadata.deal_count,
        best_discount: m.metadata.best_discount,
        timestamp:     m.metadata.timestamp,
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 6)
  } catch (e) {
    console.warn('Pinecone recent searches error:', e)
    return []
  }
}
