# 🔥 DealHunt – AI Discount Finder

Finds **real** discounts using **Serper Google Search** + **OpenRouter** AI extraction + **Pinecone** vector caching.

## How It Works
1. Search runs → Serper queries Google Shopping + Google Web Search
2. AI cross-references shopping prices with deal pages to find real discounts
3. Pinecone caches results for instant retrieval on repeat searches

## Setup

### 1. Get Your Keys

| Service | URL | Free Tier |
|---------|-----|-----------|
| **Serper** | https://serper.dev | 2,500 free searches |
| **OpenRouter** | https://openrouter.ai/keys | Free models |
| **Pinecone** | https://app.pinecone.io | 1 free index |

> ⚠️ Serper replaces FireCrawl — it uses real Google Shopping data so deals are always real prices.

### 2. Create `.env.local` in the project root:
```
VITE_SERPER_KEY=your_serper_api_key
VITE_OPENROUTER_KEY=sk-or-v1-xxx
VITE_PINECONE_KEY=your_pinecone_key
VITE_PINECONE_HOST=https://dealhunt-xxxx.svc.aped-xxxx.pinecone.io
```

### 3. Run Locally
```bash
npm install
npm run dev
```

### 4. Deploy to Vercel
Push to GitHub, then in Vercel → Settings → Environment Variables → add all 4 keys.

## Tech Stack
- React 18 + Vite
- **Serper.dev** Google Shopping + Web Search API
- OpenRouter free AI models (parallel probing)
- Pinecone vector database cache
