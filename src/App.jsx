import { useState, useRef, useEffect } from 'react'
import { storeDeals, retrieveSimilarDeals, getRecentSearches } from './pinecone.js'

const SERPER_KEY  = import.meta.env.VITE_SERPER_KEY
const CLAUDE_KEY  = import.meta.env.VITE_CLAUDE_KEY
const PC_KEY      = import.meta.env.VITE_PINECONE_KEY
const PC_HOST     = import.meta.env.VITE_PINECONE_HOST

function discountColor(pct) {
  if (pct >= 50) return '#dc2626'
  if (pct >= 30) return '#ea580c'
  if (pct >= 15) return '#16a34a'
  return '#2563eb'
}
function discountBg(pct) {
  if (pct >= 50) return '#fef2f2'
  if (pct >= 30) return '#fff7ed'
  if (pct >= 15) return '#f0fdf4'
  return '#eff6ff'
}
function timeAgo(ts) {
  const d = Math.floor((Date.now()-ts)/86400000)
  const h = Math.floor((Date.now()-ts)/3600000)
  const m = Math.floor((Date.now()-ts)/60000)
  if (d>0) return d+'d ago'
  if (h>0) return h+'h ago'
  if (m>0) return m+'m ago'
  return 'just now'
}

async function serperSearch(query, location) {
  const country = location?.countryCode?.toLowerCase() || 'us'
  const results = []
  try {
    const res = await fetch('https://google.serper.dev/shopping', {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query+' deal discount sale', gl: country, num: 5 }),
    })
    const data = await res.json()
    if (data.shopping?.length) {
      for (const item of data.shopping) {
        results.push({
          url: item.link||'', title: item.title||'',
          content: [item.title, item.source, item.price?'Price: '+item.price:'', item.rating?'Rating: '+item.rating:''].filter(Boolean).join(' | '),
          imageUrl: item.imageUrl||'', price: item.price||'', source: item.source||'', type: 'shopping',
        })
      }
    }
  } catch(e) { console.warn('Serper shopping error', e) }
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query+' "was $" OR "save $" OR "% off" OR "sale price"', gl: country, num: 5 }),
    })
    const data = await res.json()
    if (data.organic?.length) {
      for (const item of data.organic) {
        results.push({ url: item.link||'', title: item.title||'', content: (item.title+' | '+(item.snippet||'')).slice(0,200), type: 'web' })
      }
    }
    if (data.shopping?.length) {
      for (const item of data.shopping) {
        results.push({ url: item.link||'', title: item.title||'', content: item.title+' | Price: '+(item.price||'')+' | Store: '+(item.source||''), imageUrl: item.imageUrl||'', price: item.price||'', source: item.source||'', type: 'shopping' })
      }
    }
  } catch(e) { console.warn('Serper web error', e) }
  return results
}

async function extractDeals(searchResults, query, location) {
  const locContext = location
    ? 'The user is in '+location.city+', '+location.region+', '+location.country+' ('+( location.currency||'USD')+').'
    : 'Location unknown — use USD.'
  const shoppingItems = searchResults.filter(r => r.type==='shopping').slice(0,5)
  const webItems      = searchResults.filter(r => r.type==='web').slice(0,5)
  const shoppingContext = shoppingItems.map((r,i) =>
    'PRODUCT '+(i+1)+': '+r.title.slice(0,80)+' | Store: '+r.source+' | Price: '+r.price+' | URL: '+r.url+(r.imageUrl?' | Image: '+r.imageUrl:'')
  ).join('\n')
  const webContext = webItems.map((r,i) =>
    'WEB '+(i+1)+': '+r.title.slice(0,80)+'\n'+r.content.slice(0,200)+'\nURL: '+r.url
  ).join('\n\n')

  const prompt = `You are a deal extraction AI. User searched: "${query}"
${locContext}

## GOOGLE SHOPPING RESULTS:
${shoppingContext||'None'}

## WEB RESULTS:
${webContext||'None'}

Cross-reference to find real discounts. Look for "was $X now $Y", "% off", "save $".
Return ONLY raw JSON array:
[{"store":"Amazon","item":"Product name","original_price":299.99,"discounted_price":199.99,"discount_percent":33,"deal_type":"Sale","expires":"Limited Time","url":"https://...","image_url":"https://...","currency":"${location?.currency||'USD'}","highlight":"Why great deal","available_in":"${location?.country||'US'}"}]
Rules: discounted_price < original_price, real prices only, use shopping image URLs, return [] if no verified deals.`

  // Call Claude API directly
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': CLAUDE_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  const raw = data.content?.[0]?.text || ''
  const match = raw.replace(/```json|```/gi,'').trim().match(/\[[\s\S]*\]/)
  if (!match) throw new Error('No JSON in AI response')
  return JSON.parse(match[0]).filter(d =>
    d.store && d.item && typeof d.original_price==='number' && typeof d.discounted_price==='number' &&
    d.discounted_price < d.original_price && d.discount_percent > 0
  )
}

function DealCard({ deal, index }) {
  const [imgErr, setImgErr] = useState(false)
  const dc    = discountColor(deal.discount_percent)
  const bg    = discountBg(deal.discount_percent)
  const saved = (deal.original_price - deal.discounted_price).toFixed(2)
  return (
    <div
      onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 8px 28px rgba(0,0,0,0.10)';e.currentTarget.style.transform='translateY(-2px)'}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.06)';e.currentTarget.style.transform='translateY(0)'}}
      style={{ background:'#fff', borderRadius:16, border:'1px solid #e5e7eb', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 1px 4px rgba(0,0,0,0.06)', transition:'all 0.2s', animation:'fadeUp 0.35s ease both', animationDelay:(index*0.05)+'s' }}>
      <div style={{ height:180, background:'#f9fafb', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', borderBottom:'1px solid #f3f4f6' }}>
        {deal.image_url && !imgErr
          ? <img src={deal.image_url} alt={deal.item} onError={()=>setImgErr(true)} style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain', padding:16 }}/>
          : <div style={{ textAlign:'center', color:'#d1d5db' }}><div style={{ fontSize:36 }}>📦</div><div style={{ fontSize:11, marginTop:4 }}>No image</div></div>
        }
        <div style={{ position:'absolute', top:12, right:12, background:bg, color:dc, padding:'4px 10px', borderRadius:20, fontSize:12, fontWeight:700, border:'1px solid '+dc+'22' }}>
          -{deal.discount_percent}%
        </div>
      </div>
      <div style={{ padding:18, display:'flex', flexDirection:'column', flex:1 }}>
        <div style={{ display:'flex', gap:6, marginBottom:10, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ fontSize:11, fontWeight:600, color:'#374151', background:'#f3f4f6', padding:'2px 8px', borderRadius:6 }}>{deal.store}</span>
          {deal.deal_type && <span style={{ fontSize:11, color:'#9ca3af' }}>{deal.deal_type}</span>}
        </div>
        <div style={{ fontSize:14, fontWeight:600, color:'#111827', lineHeight:1.45, marginBottom:14, flex:1 }}>{deal.item}</div>
        <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:10 }}>
          <span style={{ fontSize:22, fontWeight:700, color:dc }}>{deal.currency||'$'}{Number(deal.discounted_price).toFixed(2)}</span>
          <span style={{ fontSize:13, color:'#9ca3af', textDecoration:'line-through' }}>{deal.currency||'$'}{Number(deal.original_price).toFixed(2)}</span>
          <span style={{ fontSize:12, color:'#16a34a', fontWeight:500 }}>Save {deal.currency||'$'}{saved}</span>
        </div>
        {deal.highlight && (
          <div style={{ fontSize:12, color:'#6b7280', lineHeight:1.55, marginBottom:14, paddingLeft:10, borderLeft:'3px solid '+dc+'33' }}>{deal.highlight}</div>
        )}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:12, borderTop:'1px solid #f3f4f6' }}>
          <span style={{ fontSize:11, color:'#9ca3af' }}>⏰ {deal.expires||'Limited time'}</span>
          <a href={deal.url||'https://www.google.com/search?q='+encodeURIComponent(deal.item+' '+deal.store)}
            target="_blank" rel="noreferrer"
            onMouseEnter={e=>e.target.style.background='#1d4ed8'}
            onMouseLeave={e=>e.target.style.background='#2563eb'}
            style={{ fontSize:13, fontWeight:600, color:'#fff', background:'#2563eb', padding:'7px 16px', borderRadius:8, textDecoration:'none', transition:'background 0.15s' }}>
            View deal →
          </a>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [query,          setQuery]          = useState('')
  const [deals,          setDeals]          = useState([])
  const [loading,        setLoading]        = useState(false)
  const [stage,          setStage]          = useState('')
  const [error,          setError]          = useState('')
  const [history,        setHistory]        = useState(() => JSON.parse(localStorage.getItem('dh_hist')||'[]'))
  const [cacheHit,       setCacheHit]       = useState(null)
  const [recentSearches, setRecentSearches] = useState([])
  const [location,       setLocation]       = useState(null)
  const [pcStatus,       setPcStatus]       = useState('')

  const inputRef  = useRef(null)
  const pcEnabled = !!(PC_KEY && PC_HOST)

  useEffect(() => {
    if (pcEnabled) getRecentSearches().then(setRecentSearches)
    detectLocation()
  }, [])

  const detectLocation = async () => {
    try {
      const res = await fetch('https://ipapi.co/json/')
      const data = await res.json()
      setLocation({ city:data.city||'Unknown', region:data.region||'', country:data.country_name||'US', countryCode:data.country_code||'US', currency:data.currency||'USD' })
    } catch { setLocation({ city:'Unknown', region:'', country:'US', countryCode:'US', currency:'USD' }) }
  }

  const addHistory = (q) => {
    const next = [q,...history.filter(h=>h!==q)].slice(0,8)
    setHistory(next); localStorage.setItem('dh_hist', JSON.stringify(next))
  }

  const search = async () => {
    if (!query.trim()) { setError('Enter a product to search.'); return }
    setError(''); setDeals([]); setLoading(true); setCacheHit(null); setPcStatus('')
    addHistory(query.trim())
    try {
      if (pcEnabled) {
        setStage('cache')
        const cached = await retrieveSimilarDeals(query)
        if (cached.length > 0) {
          const best = cached[0]
          setCacheHit({ query:best.query, timestamp:best.timestamp, score:best.score })
          setDeals(best.deals.sort((a,b)=>b.discount_percent-a.discount_percent))
          setLoading(false); return
        }
      }
      setStage('searching')
      const searchResults = await serperSearch(query, location)
      setStage('analyzing')
      const found = await extractDeals(searchResults, query, location)
      const sorted = found.sort((a,b)=>b.discount_percent-a.discount_percent)
      setDeals(sorted)
      if (pcEnabled && sorted.length > 0) {
        setStage('storing'); setPcStatus('saving')
        const ok = await storeDeals(query, sorted)
        setPcStatus(ok?'saved':'error')
        if (ok) getRecentSearches().then(setRecentSearches)
      }
      if (found.length===0) setError('No real deals found. Try a more specific product name.')
    } catch(e) { setError('Error: '+e.message) }
    setStage(''); setLoading(false)
  }

  const totalSavings = deals.reduce((a,d)=>a+(d.original_price-d.discounted_price),0)
  const bestDeal     = deals[0]?.discount_percent||0
  const storeCount   = [...new Set(deals.map(d=>d.store))].length

  const suggestions = ['iPhone 16','Nike Air Max','PS5','AirPods Pro','MacBook Air','Samsung TV']

  return (
    <div style={{ minHeight:'100vh', background:'#f9fafb', fontFamily:"'DM Sans',ui-sans-serif,system-ui,-apple-system,sans-serif", color:'#111827' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}
        @keyframes shimmer{0%{opacity:0.6}50%{opacity:1}100%{opacity:0.6}}
        .focus-ring:focus{outline:none;border-color:#2563eb!important;box-shadow:0 0 0 3px rgba(37,99,235,0.12)!important;}
        .tag:hover{background:#e5e7eb!important;}
        .deal-link:hover{background:#1d4ed8!important;}
        .recent-item:hover{background:#f3f4f6!important;}
      `}</style>

      {/* ── HEADER ── */}
      <header style={{ background:'#fff', borderBottom:'1px solid #e5e7eb', padding:'0 24px' }}>
        <div style={{ maxWidth:960, margin:'0 auto', height:56, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:28, height:28, borderRadius:7, background:'linear-gradient(135deg,#f97316,#ef4444)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>🔥</div>
            <span style={{ fontSize:16, fontWeight:700, letterSpacing:'-0.2px' }}>DealHunt</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#9ca3af' }}>
            {location?.city && <span>📍 {location.city}, {location.countryCode}</span>}
            {pcStatus==='saved' && <span style={{ color:'#16a34a', marginLeft:8 }}>✓ Saved</span>}
          </div>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main style={{ maxWidth:960, margin:'0 auto', padding:'32px 24px' }}>

        {/* Search */}
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #e5e7eb', padding:'24px', marginBottom:20, boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
          <h1 style={{ fontSize:22, fontWeight:700, marginBottom:4, letterSpacing:'-0.3px' }}>
            Find the best deals
          </h1>
          <p style={{ fontSize:13, color:'#6b7280', marginBottom:18 }}>
            Real-time prices · verified discounts · {location?.city ? 'near '+location.city : 'near you'}
          </p>

          <div style={{ display:'flex', gap:10 }}>
            <input ref={inputRef} type="text" value={query} className="focus-ring"
              onChange={e=>setQuery(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&!loading&&search()}
              placeholder="Search any product — iPhone 16, Nike Air Max, PS5…"
              style={{ flex:1, padding:'12px 16px', borderRadius:10, border:'1.5px solid #e5e7eb', fontSize:15, color:'#111827', background:'#fff', fontFamily:'inherit', transition:'all 0.15s' }}
            />
            <button onClick={search} disabled={loading}
              onMouseEnter={e=>{if(!loading)e.currentTarget.style.background='#1d4ed8'}}
              onMouseLeave={e=>{if(!loading)e.currentTarget.style.background='#2563eb'}}
              style={{ padding:'12px 24px', borderRadius:10, border:'none', background:loading?'#e5e7eb':'#2563eb', color:loading?'#9ca3af':'#fff', fontWeight:600, fontSize:14, cursor:loading?'not-allowed':'pointer', fontFamily:'inherit', whiteSpace:'nowrap', transition:'background 0.15s', display:'flex', alignItems:'center', gap:8 }}>
              {loading
                ? <><span style={{ width:15,height:15,border:'2px solid #c0c0c0',borderTopColor:'transparent',borderRadius:'50%',display:'inline-block',animation:'spin 0.7s linear infinite' }}/>Searching…</>
                : 'Search deals ⚡'
              }
            </button>
          </div>

          {/* Tags */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:14, alignItems:'center' }}>
            {history.length > 0 ? <>
              <span style={{ fontSize:12, color:'#9ca3af' }}>Recent:</span>
              {history.map((h,i) => (
                <button key={i} className="tag" onClick={()=>setQuery(h)}
                  style={{ fontSize:12, color:'#374151', background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:16, padding:'3px 11px', cursor:'pointer', fontFamily:'inherit', transition:'background 0.15s' }}>
                  {h}
                </button>
              ))}
            </> : <>
              <span style={{ fontSize:12, color:'#9ca3af' }}>Try:</span>
              {suggestions.map(s => (
                <button key={s} className="tag" onClick={()=>{setQuery(s);setTimeout(()=>inputRef.current?.focus(),50)}}
                  style={{ fontSize:12, color:'#374151', background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:16, padding:'3px 11px', cursor:'pointer', fontFamily:'inherit', transition:'background 0.15s' }}>
                  {s}
                </button>
              ))}
            </>}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'12px 16px', marginBottom:20, color:'#dc2626', fontSize:14, display:'flex', gap:8 }}>
            <span>⚠️</span><span>{error}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ background:'#fff', borderRadius:16, border:'1px solid #e5e7eb', padding:'52px 24px', textAlign:'center', boxShadow:'0 1px 4px rgba(0,0,0,0.05)', marginBottom:20 }}>
            <div style={{ fontSize:38, marginBottom:16, animation:'shimmer 1.5s infinite' }}>
              {stage==='cache'?'⚡':stage==='searching'?'🔍':stage==='analyzing'?'🤖':'💾'}
            </div>
            <div style={{ fontSize:16, fontWeight:600, color:'#111827', marginBottom:6 }}>
              {stage==='cache'?'Checking for cached results…':stage==='searching'?'Searching Google for deals…':stage==='analyzing'?'Finding the best discounts…':'Saving results…'}
            </div>
            <div style={{ display:'flex', justifyContent:'center', gap:5, marginTop:18 }}>
              {[0,1,2].map(i=><span key={i} style={{ width:7,height:7,borderRadius:'50%',background:'#2563eb',display:'inline-block',animation:'pulse 1s infinite',animationDelay:(i*0.18)+'s' }}/>)}
            </div>
          </div>
        )}

        {/* Cache banner */}
        {cacheHit && !loading && (
          <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:'12px 16px', marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:'#16a34a' }}>⚡ Instant results from cache</div>
              <div style={{ fontSize:12, color:'#6b7280', marginTop:2 }}>"{cacheHit.query}" · {timeAgo(cacheHit.timestamp)} · {Math.round(cacheHit.score*100)}% match</div>
            </div>
            <button onClick={()=>{setCacheHit(null);search()}}
              style={{ fontSize:12, color:'#16a34a', background:'#fff', border:'1px solid #bbf7d0', borderRadius:8, padding:'5px 12px', cursor:'pointer', fontFamily:'inherit' }}>
              Refresh →
            </button>
          </div>
        )}

        {/* Results */}
        {!loading && deals.length>0 && (
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
              <div>
                <span style={{ fontSize:18, fontWeight:700 }}>{deals.length} deals</span>
                <span style={{ fontSize:14, color:'#6b7280', marginLeft:8 }}>for "{query}"</span>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                {[
                  { label:'Best deal',  val:bestDeal+'% off',                              color:'#dc2626' },
                  { label:'Avg saving', val:'$'+(totalSavings/deals.length).toFixed(0),   color:'#ea580c' },
                  { label:'Stores',     val:storeCount,                                    color:'#2563eb' },
                ].map((s,i) => (
                  <div key={i} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, padding:'8px 14px', textAlign:'center' }}>
                    <div style={{ fontSize:15, fontWeight:700, color:s.color }}>{s.val}</div>
                    <div style={{ fontSize:11, color:'#9ca3af' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(270px,1fr))', gap:16, marginBottom:24 }}>
              {deals.map((deal,i) => <DealCard key={i} deal={deal} index={i} />)}
            </div>

            <div style={{ textAlign:'center', fontSize:12, color:'#d1d5db' }}>
              Always verify prices before purchasing
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && deals.length===0 && !error && (
          <div style={{ background:'#fff', borderRadius:16, border:'1px solid #e5e7eb', padding:'60px 24px', textAlign:'center', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize:48, marginBottom:16 }}>🔥</div>
            <div style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>Ready to find deals</div>
            <div style={{ fontSize:14, color:'#6b7280', marginBottom:24 }}>Search any product above to find the best current discounts</div>
            {recentSearches.length > 0 && (
              <div>
                <div style={{ fontSize:12, color:'#9ca3af', marginBottom:10 }}>Your recent searches</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center' }}>
                  {recentSearches.map((s,i) => (
                    <button key={i} className="tag recent-item" onClick={()=>setQuery(s.query)}
                      style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:10, padding:'8px 14px', cursor:'pointer', fontFamily:'inherit', transition:'background 0.15s', textAlign:'left' }}>
                      <div style={{ fontSize:13, fontWeight:500, color:'#111827' }}>{s.query}</div>
                      <div style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>{s.deal_count} deals · -{s.best_discount}% · {timeAgo(s.timestamp)}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
