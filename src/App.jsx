import { useState, useRef, useEffect } from "react";

const SERPER_KEY = import.meta.env.VITE_SERPER_KEY;
const BESTBUY_KEY = import.meta.env.VITE_BESTBUY_KEY;
const WALMART_KEY = import.meta.env.VITE_WALMART_KEY;
const EBAY_KEY = import.meta.env.VITE_EBAY_KEY;
const RAINFOREST_KEY = import.meta.env.VITE_RAINFOREST_KEY || "71C9F3DB8CE543D6ADD20799B73A4E62";

// ─── COUNTRY CONFIG ────────────────────────────────────────
const COUNTRIES = [
  { code: "US", label: "🇺🇸 United States", gl: "us", currency: "$",  amazonDomain: "amazon.com",    currencyCode: "USD", ebayGlobalId: "EBAY-US" },
  { code: "IN", label: "🇮🇳 India",          gl: "in", currency: "₹",  amazonDomain: "amazon.in",     currencyCode: "INR", ebayGlobalId: "EBAY-IN" },
  { code: "GB", label: "🇬🇧 United Kingdom", gl: "gb", currency: "£",  amazonDomain: "amazon.co.uk",  currencyCode: "GBP", ebayGlobalId: "EBAY-GB" },
  { code: "DE", label: "🇩🇪 Germany",        gl: "de", currency: "€",  amazonDomain: "amazon.de",     currencyCode: "EUR", ebayGlobalId: "EBAY-DE" },
  { code: "FR", label: "🇫🇷 France",         gl: "fr", currency: "€",  amazonDomain: "amazon.fr",     currencyCode: "EUR", ebayGlobalId: "EBAY-FR" },
  { code: "CA", label: "🇨🇦 Canada",         gl: "ca", currency: "CA$",amazonDomain: "amazon.ca",     currencyCode: "CAD", ebayGlobalId: "EBAY-ENCA" },
  { code: "AU", label: "🇦🇺 Australia",      gl: "au", currency: "A$", amazonDomain: "amazon.com.au", currencyCode: "AUD", ebayGlobalId: "EBAY-AU" },
  { code: "JP", label: "🇯🇵 Japan",          gl: "jp", currency: "¥",  amazonDomain: "amazon.co.jp",  currencyCode: "JPY", ebayGlobalId: "EBAY-JP" },
  { code: "SG", label: "🇸🇬 Singapore",      gl: "sg", currency: "S$", amazonDomain: "amazon.sg",     currencyCode: "SGD", ebayGlobalId: "EBAY-SG" },
  { code: "AE", label: "🇦🇪 UAE",            gl: "ae", currency: "AED",amazonDomain: "amazon.ae",     currencyCode: "AED", ebayGlobalId: "EBAY-US" },
  { code: "MX", label: "🇲🇽 Mexico",         gl: "mx", currency: "MX$",amazonDomain: "amazon.com.mx", currencyCode: "MXN", ebayGlobalId: "EBAY-US" },
  { code: "BR", label: "🇧🇷 Brazil",         gl: "br", currency: "R$", amazonDomain: "amazon.com.br", currencyCode: "BRL", ebayGlobalId: "EBAY-US" },
];

// Best Buy only ships in US/CA; Walmart is US-only
function storesForCountry(countryCode) {
  const always = ["serper", "amazon", "ebay"];
  if (countryCode === "US") return [...always, "bestbuy", "walmart"];
  if (countryCode === "CA") return [...always, "bestbuy"];
  return always;
}

// ─── CACHE ─────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 15;
function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}
function setCache(key, data) { cache.set(key, { data, timestamp: Date.now() }); }

// ─── SERPER ────────────────────────────────────────────────
async function serperSearch(query, country, withDiscount) {
  const q = withDiscount ? query + " discount sale" : query;
  const cacheKey = `serper__${q}__${country.gl}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const res = await fetch("https://google.serper.dev/shopping", {
    method: "POST",
    headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ q, gl: country.gl, num: 20 }),
  });
  const data = await res.json();
  if (!data.shopping) return [];
  const results = data.shopping.map((item) => {
    const price = parseFloat(item.price?.replace(/[^\d.]/g, "")) || 0;
    const original = withDiscount ? price * 1.2 : price;
    const discount = withDiscount ? Math.round(((original - price) / original) * 100) : 0;
    return {
      store: item.source || "Store",
      item: item.title || "",
      brand: item.title.split(" ")[0] || "Unknown",
      original_price: original,
      discounted_price: price,
      discount_percent: discount,
      url: item.link || item.product_link || "#",
      image_url: item.imageUrl,
      currency: country.currency,
      rating: item.rating ? parseFloat(item.rating) : null,
      reviews: item.reviews || null,
      shipping: item.shipping || "Standard",
    };
  });
  setCache(cacheKey, results);
  return results;
}

// ─── AMAZON via Rainforest ─────────────────────────────────
async function amazonSearch(query, country, withDiscount) {
  const cacheKey = `rainforest__${query}__${country.amazonDomain}__${withDiscount}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  try {
    const params = new URLSearchParams({
      api_key: RAINFOREST_KEY,
      amazon_domain: country.amazonDomain,
      type: "search",
      search_term: query,
      sort_by: withDiscount ? "featured" : "average_review",
      page: "1",
    });
    const res = await fetch(`https://api.rainforestapi.com/request?${params}`);
    const data = await res.json();
    if (!data.search_results) return [];
    const results = data.search_results
      .filter(item => item.price?.value)
      .slice(0, 12)
      .map(item => {
        const price = item.price?.value || 0;
        const rrp = item.rrp?.value || item.list_price?.value || 0;
        const original = rrp > price ? rrp : price;
        const discount = original > price ? Math.round(((original - price) / original) * 100) : 0;
        return {
          store: "Amazon",
          item: item.title || "",
          brand: item.brand || item.title?.split(" ")[0] || "Unknown",
          original_price: original,
          discounted_price: price,
          discount_percent: discount,
          url: item.link || `https://www.${country.amazonDomain}/dp/${item.asin}`,
          image_url: item.image || null,
          currency: country.currency,
          rating: item.rating || null,
          reviews: item.ratings_total || null,
          shipping: item.is_prime ? "⚡ Prime" : (item.free_delivery ? "Free delivery" : "Standard shipping"),
        };
      });
    setCache(cacheKey, results);
    return results;
  } catch (e) { console.error("Amazon error:", e); return []; }
}

// ─── BEST BUY (US/CA only) ─────────────────────────────────
async function bestBuySearch(query) {
  const cacheKey = `bestbuy__${query}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  try {
    const res = await fetch(
      `https://api.bestbuy.com/v1/products((search=${encodeURIComponent(query)}))?apiKey=${BESTBUY_KEY}&show=name,salePrice,regularPrice,url,image,customerReviewAverage,customerReviewCount,shippingCost&pageSize=10&format=json`
    );
    const data = await res.json();
    const results = (data.products || []).map(item => ({
      store: "Best Buy",
      item: item.name || "",
      brand: item.name?.split(" ")[0] || "Unknown",
      original_price: item.regularPrice || item.salePrice || 0,
      discounted_price: item.salePrice || 0,
      discount_percent: item.regularPrice && item.salePrice && item.regularPrice > item.salePrice
        ? Math.round(((item.regularPrice - item.salePrice) / item.regularPrice) * 100) : 0,
      url: item.url || "#",
      image_url: item.image || null,
      currency: "$",
      rating: item.customerReviewAverage || null,
      reviews: item.customerReviewCount || null,
      shipping: item.shippingCost === 0 ? "Free shipping" : `$${item.shippingCost} shipping`,
    }));
    setCache(cacheKey, results);
    return results;
  } catch (e) { console.error("BestBuy error:", e); return []; }
}

// ─── WALMART (US only) ─────────────────────────────────────
async function walmartSearch(query) {
  const cacheKey = `walmart__${query}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  try {
    const res = await fetch(
      `https://developer.api.walmart.com/api-proxy/service/affil/product/v2/search?query=${encodeURIComponent(query)}&numItems=10`,
      {
        headers: {
          "WM_SEC.ACCESS_TOKEN": WALMART_KEY,
          "WM_SVC.NAME": "Walmart Marketplace",
          "WM_QOS.CORRELATION_ID": "dealhunt",
          "Accept": "application/json"
        }
      }
    );
    const data = await res.json();
    const results = (data.items || []).map(item => ({
      store: "Walmart",
      item: item.name || "",
      brand: item.brandName || item.name?.split(" ")[0] || "Unknown",
      original_price: item.msrp || item.salePrice || 0,
      discounted_price: item.salePrice || 0,
      discount_percent: item.msrp && item.salePrice && item.msrp > item.salePrice
        ? Math.round(((item.msrp - item.salePrice) / item.msrp) * 100) : 0,
      url: item.productUrl || "#",
      image_url: item.largeImage || item.mediumImage || null,
      currency: "$",
      rating: item.customerRating ? parseFloat(item.customerRating) : null,
      reviews: item.numReviews || null,
      shipping: item.freeShippingOver50Dollars ? "Free over $50" : "Standard shipping",
    }));
    setCache(cacheKey, results);
    return results;
  } catch (e) { console.error("Walmart error:", e); return []; }
}

// ─── EBAY ──────────────────────────────────────────────────
async function ebaySearch(query, country) {
  const cacheKey = `ebay__${query}__${country.ebayGlobalId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  try {
    const res = await fetch(
      `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findItemsByKeywords&SERVICE-VERSION=1.0.0&SECURITY-APPNAME=${EBAY_KEY}&RESPONSE-DATA-FORMAT=JSON&GLOBAL-ID=${country.ebayGlobalId}&keywords=${encodeURIComponent(query)}&paginationInput.entriesPerPage=10&itemFilter(0).name=ListingType&itemFilter(0).value=FixedPrice&sortOrder=BestMatch`
    );
    const data = await res.json();
    const items = data?.findItemsByKeywordsResponse?.[0]?.searchResult?.[0]?.item || [];
    const results = items.map(item => {
      const price = parseFloat(item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__) || 0;
      const shipping = parseFloat(item.shippingInfo?.[0]?.shippingServiceCost?.[0]?.__value__) || 0;
      return {
        store: "eBay",
        item: item.title?.[0] || "",
        brand: item.title?.[0]?.split(" ")[0] || "Unknown",
        original_price: price * 1.1,
        discounted_price: price,
        discount_percent: 9,
        url: item.viewItemURL?.[0] || "#",
        image_url: item.galleryURL?.[0] || null,
        currency: country.currency,
        rating: null,
        reviews: null,
        shipping: shipping === 0 ? "Free shipping" : `${country.currency}${shipping.toFixed(2)} shipping`,
      };
    });
    setCache(cacheKey, results);
    return results;
  } catch (e) { console.error("eBay error:", e); return []; }
}

// ─── COLORS ────────────────────────────────────────────────
function discountColor(pct) {
  if (pct >= 50) return "#dc2626";
  if (pct >= 30) return "#ea580c";
  if (pct >= 15) return "#16a34a";
  return "#2563eb";
}
function discountBg(pct) {
  if (pct >= 50) return "#fef2f2";
  if (pct >= 30) return "#fff7ed";
  if (pct >= 15) return "#f0fdf4";
  return "#eff6ff";
}
function storeBadgeStyle(store) {
  if (store === "Best Buy") return { background: "#1d4ed8", color: "#fff" };
  if (store === "Walmart") return { background: "#0071ce", color: "#fff" };
  if (store === "eBay") return { background: "#e53238", color: "#fff" };
  if (store === "Amazon") return { background: "#ff9900", color: "#111" };
  return { background: "rgba(0,0,0,0.45)", color: "#fff" };
}

// ─── COUNTRY DROPDOWN ──────────────────────────────────────
function CountryDropdown({ selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const current = COUNTRIES.find(c => c.code === selected) || COUNTRIES[0];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        padding: "10px 14px", borderRadius: 8, border: "1px solid #e5e7eb",
        background: "#fff", color: "#374151", fontSize: 13, cursor: "pointer",
        display: "flex", alignItems: "center", gap: 6, minWidth: 180, fontWeight: 600,
      }}>
        <span style={{ flex: 1, textAlign: "left" }}>{current.label}</span>
        <span style={{ fontSize: 10 }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 200,
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 220,
          padding: 6, maxHeight: 320, overflowY: "auto",
        }}>
          {COUNTRIES.map(c => (
            <div key={c.code} onClick={() => { onChange(c.code); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                background: selected === c.code ? "#eff6ff" : "transparent",
                color: selected === c.code ? "#2563eb" : "#374151",
                fontWeight: selected === c.code ? 600 : 400,
              }}>
              <span>{c.label}</span>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>{c.currency}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── DEAL CARD ─────────────────────────────────────────────
function DealCard({ deal, showDiscount }) {
  const dc = discountColor(deal.discount_percent);
  const bg = discountBg(deal.discount_percent);
  const [imgError, setImgError] = useState(false);
  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", overflow: "hidden" }}>
      <a href={deal.url} target="_blank" rel="noreferrer noopener" style={{ display: "block", textDecoration: "none" }}>
        <div style={{ height: 180, background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          {deal.image_url && !imgError ? (
            <img src={deal.image_url} alt="" onError={() => setImgError(true)}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", padding: 16 }} />
          ) : (
            <div style={{ fontSize: 30 }}>📦</div>
          )}
          {showDiscount && deal.discount_percent > 0 && (
            <div style={{ position: "absolute", top: 12, right: 12, background: bg, color: dc, padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
              -{deal.discount_percent}%
            </div>
          )}
          {!showDiscount && (
            <div style={{ position: "absolute", top: 12, right: 12, background: "#f3f4f6", color: "#6b7280", padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
              Full Price
            </div>
          )}
          {deal.store && (
            <div style={{ position: "absolute", bottom: 8, right: 8, ...storeBadgeStyle(deal.store), padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
              {deal.store}
            </div>
          )}
        </div>
      </a>
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{deal.store}</div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>{deal.item}</div>
        {deal.rating && (
          <div style={{ fontSize: 12, color: "#f59e0b", marginBottom: 8 }}>
            {"★".repeat(Math.round(deal.rating))}{"☆".repeat(5 - Math.round(deal.rating))}
            <span style={{ color: "#6b7280", marginLeft: 4 }}>{deal.rating} {deal.reviews && `(${deal.reviews})`}</span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: showDiscount && deal.discount_percent > 0 ? dc : "#111827" }}>
            {deal.currency}{deal.discounted_price.toFixed(2)}
          </span>
          {showDiscount && deal.discount_percent > 0 && (
            <span style={{ textDecoration: "line-through", color: "#9ca3af", fontSize: 13 }}>
              {deal.currency}{deal.original_price.toFixed(2)}
            </span>
          )}
        </div>
        {deal.shipping && deal.shipping !== "Standard" && (
          <div style={{ fontSize: 11, color: deal.store === "Amazon" ? "#ff9900" : "#16a34a", marginTop: 4 }}>{deal.shipping}</div>
        )}
        <a href={deal.url} target="_blank" rel="noreferrer noopener"
          style={{
            display: "inline-block", marginTop: 12,
            background: deal.store === "Amazon" ? "#ff9900" : "#2563eb",
            color: deal.store === "Amazon" ? "#111" : "#fff",
            padding: "8px 14px", borderRadius: 8, fontSize: 13, textDecoration: "none", fontWeight: 600
          }}>
          {showDiscount ? "View deal →" : "View →"}
        </a>
      </div>
    </div>
  );
}

// ─── FILTER DROPDOWN ───────────────────────────────────────
function FilterDropdown({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const toggle = (val) => onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        padding: "8px 14px", borderRadius: 8, border: "1px solid #e5e7eb",
        background: selected.length ? "#2563eb" : "#fff",
        color: selected.length ? "#fff" : "#374151",
        fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
        display: "flex", alignItems: "center", gap: 6
      }}>
        {label} {selected.length > 0 && `(${selected.length})`}
        <span style={{ fontSize: 10 }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 100,
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)", minWidth: 180, padding: 8
        }}>
          {options.map(opt => (
            <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", fontSize: 13, cursor: "pointer", borderRadius: 6, background: selected.includes(opt) ? "#eff6ff" : "transparent" }}>
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} style={{ accentColor: "#2563eb" }} />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── STORE DROPDOWN ────────────────────────────────────────
function StoreDropdown({ stores, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const selectedLabel = selected === "all"
    ? "🛒 All Stores"
    : stores.find(s => s.id === selected)?.label || "🛒 All Stores";
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        padding: "8px 14px", borderRadius: 8, border: "1px solid #e5e7eb",
        background: selected !== "all" ? "#2563eb" : "#fff",
        color: selected !== "all" ? "#fff" : "#374151",
        fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
        display: "flex", alignItems: "center", gap: 6, minWidth: 150
      }}>
        <span style={{ flex: 1, textAlign: "left" }}>{selectedLabel}</span>
        <span style={{ fontSize: 10 }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 100,
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: 200, padding: 6
        }}>
          {stores.map(s => (
            <div key={s.id} onClick={() => { onChange(s.id); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                background: selected === s.id ? "#eff6ff" : "transparent",
                color: selected === s.id ? "#2563eb" : "#374151",
                fontWeight: selected === s.id ? 600 : 400
              }}>
              <span>{s.label}</span>
              {s.count > 0 && (
                <span style={{ background: selected === s.id ? "#dbeafe" : "#f3f4f6", color: selected === s.id ? "#2563eb" : "#6b7280", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>
                  {s.count}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SECTION TABS ──────────────────────────────────────────
function SectionTabs({ activeTab, onChange }) {
  return (
    <div style={{ display: "flex", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden", background: "#f3f4f6" }}>
      {[["deals", "🔥 With Discount", "#2563eb"], ["nodiscount", "🏷️ Without Discount", "#374151"]].map(([val, label, color]) => (
        <button key={val} onClick={() => onChange(val)} style={{
          padding: "9px 20px", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
          background: activeTab === val ? color : "transparent",
          color: activeTab === val ? "#fff" : "#6b7280",
          transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6
        }}>{label}</button>
      ))}
    </div>
  );
}

// ─── CACHE STATS ───────────────────────────────────────────
function CacheStats({ apiCallCount }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {cache.size > 0 && (
        <div style={{ fontSize: 11, color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "3px 10px", borderRadius: 20 }}>
          ⚡ {cache.size} cached
        </div>
      )}
      <div style={{ fontSize: 11, color: "#6b7280", background: "#f3f4f6", border: "1px solid #e5e7eb", padding: "3px 10px", borderRadius: 20 }}>
        🌐 {apiCallCount} API calls
      </div>
    </div>
  );
}

// ─── COUNTRY STORE NOTICE ──────────────────────────────────
function CountryStoreNotice({ countryCode }) {
  const available = storesForCountry(countryCode);
  const unavailable = [];
  if (!available.includes("bestbuy")) unavailable.push("Best Buy");
  if (!available.includes("walmart")) unavailable.push("Walmart");
  if (!unavailable.length) return null;
  return (
    <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#92400e", marginBottom: 10 }}>
      ⚠️ {unavailable.join(" and ")} {unavailable.length > 1 ? "are" : "is"} only available in the US. Results from Amazon, eBay & Google Shopping are shown for this region.
    </div>
  );
}

// ─── MAIN APP ──────────────────────────────────────────────
export default function App() {
  const [query, setQuery] = useState("");
  const [deals, setDeals] = useState([]);
  const [noDiscountDeals, setNoDiscountDeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("deals");
  const [apiCallCount, setApiCallCount] = useState(0);
  const [selectedCountry, setSelectedCountry] = useState("US");
  const [lastSearchedCountry, setLastSearchedCountry] = useState(null);

  const [storeFilter, setStoreFilter] = useState("all");
  const [ndStoreFilter, setNdStoreFilter] = useState("all");
  const [priceFilter, setPriceFilter] = useState([]);
  const [brandFilter, setBrandFilter] = useState([]);
  const [shippingFilter, setShippingFilter] = useState([]);
  const [ratingFilter, setRatingFilter] = useState([]);
  const [discountFilter, setDiscountFilter] = useState([]);
  const [sortBy, setSortBy] = useState("relevance");
  const [ndPriceFilter, setNdPriceFilter] = useState([]);
  const [ndBrandFilter, setNdBrandFilter] = useState([]);
  const [ndRatingFilter, setNdRatingFilter] = useState([]);
  const [ndSortBy, setNdSortBy] = useState("relevance");

  const inputRef = useRef(null);

  // auto-detect location on load, but only set if found in COUNTRIES list
  useEffect(() => {
    fetch("https://ipapi.co/json/")
      .then(r => r.json())
      .then(d => {
        const match = COUNTRIES.find(c => c.code === d.country_code);
        if (match) setSelectedCountry(match.code);
      })
      .catch(() => {});
  }, []);

  const resetFilters = () => {
    setPriceFilter([]); setBrandFilter([]); setShippingFilter([]);
    setRatingFilter([]); setDiscountFilter([]);
    setNdPriceFilter([]); setNdBrandFilter([]); setNdRatingFilter([]);
    setStoreFilter("all"); setNdStoreFilter("all");
  };

  const search = async () => {
    if (!query.trim()) return;
    setDeals([]); setNoDiscountDeals([]);
    resetFilters();
    setLoading(true);

    const country = COUNTRIES.find(c => c.code === selectedCountry) || COUNTRIES[0];
    const availableStores = storesForCountry(country.code);
    const callCount = 2 + // serper with/without discount
      (availableStores.includes("amazon") ? 2 : 0) +
      (availableStores.includes("bestbuy") ? 1 : 0) +
      (availableStores.includes("walmart") ? 1 : 0) +
      (availableStores.includes("ebay") ? 1 : 0);

    setApiCallCount(c => c + callCount);
    setLastSearchedCountry(country.code);

    try {
      const promises = [
        serperSearch(query, country, true),
        serperSearch(query, country, false),
        amazonSearch(query, country, true),
        amazonSearch(query, country, false),
        ebaySearch(query, country),
      ];
      if (availableStores.includes("bestbuy")) promises.push(bestBuySearch(query));
      if (availableStores.includes("walmart")) promises.push(walmartSearch(query));

      const results = await Promise.all(promises);
      const [serperDisc, serperFull, amzDisc, amzFull, ebay, ...rest] = results;
      const bestbuy = availableStores.includes("bestbuy") ? rest.shift() : [];
      const walmart = availableStores.includes("walmart") ? rest.shift() : [];

      setDeals([...amzDisc, ...bestbuy, ...walmart, ...ebay, ...serperDisc]);
      setNoDiscountDeals([...amzFull, ...bestbuy, ...walmart, ...ebay, ...serperFull]);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const knownStores = ["Best Buy", "Walmart", "eBay", "Amazon"];
  const priceOptions = ["Under $25", "$25–$50", "$50–$100", "$100–$200", "$200+"];
  const ratingOptions = ["4★ & up", "3★ & up"];
  const discountOptions = ["50%+ off", "30%+ off", "15%+ off"];

  const applyPrice = (list, f) => !f.length ? list : list.filter(d => f.some(r => {
    if (r === "Under $25") return d.discounted_price < 25;
    if (r === "$25–$50") return d.discounted_price >= 25 && d.discounted_price < 50;
    if (r === "$50–$100") return d.discounted_price >= 50 && d.discounted_price < 100;
    if (r === "$100–$200") return d.discounted_price >= 100 && d.discounted_price <= 200;
    if (r === "$200+") return d.discounted_price > 200;
    return true;
  }));
  const applyRating = (list, f) => !f.length ? list : list.filter(d => f.some(r => {
    if (r === "4★ & up") return d.rating >= 4;
    if (r === "3★ & up") return d.rating >= 3;
    return true;
  }));
  const applySort = (list, s) => [...list].sort((a, b) => {
    if (s === "price_low") return a.discounted_price - b.discounted_price;
    if (s === "price_high") return b.discounted_price - a.discounted_price;
    if (s === "discount") return b.discount_percent - a.discount_percent;
    if (s === "rating") return (b.rating || 0) - (a.rating || 0);
    return 0;
  });
  const applyStore = (list, sf) => {
    if (sf === "all") return list;
    if (sf === "other") return list.filter(d => !knownStores.includes(d.store));
    return list.filter(d => d.store === sf);
  };

  const brandOptions = [...new Set(deals.map(d => d.brand))].slice(0, 10);
  const shippingOptions = [...new Set(deals.map(d => d.shipping).filter(Boolean))];
  const ndBrandOptions = [...new Set(noDiscountDeals.map(d => d.brand))].slice(0, 10);

  const filteredDeals = applyStore(applySort(applyRating(applyPrice(
    deals
      .filter(d => !brandFilter.length || brandFilter.includes(d.brand))
      .filter(d => !shippingFilter.length || shippingFilter.includes(d.shipping))
      .filter(d => !discountFilter.length || discountFilter.some(r => {
        if (r === "50%+ off") return d.discount_percent >= 50;
        if (r === "30%+ off") return d.discount_percent >= 30;
        if (r === "15%+ off") return d.discount_percent >= 15;
        return true;
      })),
    priceFilter), ratingFilter), sortBy), storeFilter);

  const filteredNdDeals = applyStore(applySort(applyRating(applyPrice(
    noDiscountDeals.filter(d => !ndBrandFilter.length || ndBrandFilter.includes(d.brand)),
    ndPriceFilter), ndRatingFilter), ndSortBy), ndStoreFilter);

  const activeFilterCount = brandFilter.length + priceFilter.length + shippingFilter.length + ratingFilter.length + discountFilter.length;
  const ndActiveFilterCount = ndPriceFilter.length + ndBrandFilter.length + ndRatingFilter.length;
  const hasSearched = deals.length > 0 || noDiscountDeals.length > 0;

  const buildStoreOptions = (list) => [
    { id: "all",      label: "🛒 All Stores", count: list.length },
    { id: "Amazon",   label: "🟠 Amazon",     count: list.filter(d => d.store === "Amazon").length },
    { id: "Best Buy", label: "💙 Best Buy",   count: list.filter(d => d.store === "Best Buy").length },
    { id: "Walmart",  label: "🔵 Walmart",    count: list.filter(d => d.store === "Walmart").length },
    { id: "eBay",     label: "🔴 eBay",       count: list.filter(d => d.store === "eBay").length },
    { id: "other",    label: "🌐 Other",      count: list.filter(d => !knownStores.includes(d.store)).length },
  ];

  const currentCountryObj = COUNTRIES.find(c => c.code === selectedCountry) || COUNTRIES[0];

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>🔥 DealHunt</h1>
          <CacheStats apiCallCount={apiCallCount} />
        </div>

        {/* Country selector + search bar row */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
          <CountryDropdown selected={selectedCountry} onChange={(code) => {
            setSelectedCountry(code);
            // clear results if country changes after a search
            if (hasSearched) { setDeals([]); setNoDiscountDeals([]); resetFilters(); }
          }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder={`Search deals in ${currentCountryObj.label}...`}
            style={{ flex: 1, minWidth: 200, padding: 12, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14 }}
          />
          <button onClick={search} disabled={loading}
            style={{ background: "#2563eb", color: "#fff", padding: "12px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}>
            {loading ? "..." : "Search"}
          </button>
        </div>

        {/* Country-aware store notice */}
        {lastSearchedCountry && <CountryStoreNotice countryCode={lastSearchedCountry} />}

        {/* Tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
          <SectionTabs activeTab={activeTab} onChange={setActiveTab} />
          {hasSearched && (
            <span style={{ fontSize: 13, color: "#9ca3af" }}>
              {activeTab === "deals"
                ? `${filteredDeals.length} result${filteredDeals.length !== 1 ? "s" : ""}`
                : `${filteredNdDeals.length} result${filteredNdDeals.length !== 1 ? "s" : ""}`}
            </span>
          )}
        </div>

        {/* WITH DISCOUNT TAB */}
        {activeTab === "deals" && (
          <>
            {deals.length > 0 && (
              <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
                <StoreDropdown stores={buildStoreOptions(deals)} selected={storeFilter} onChange={setStoreFilter} />
                <FilterDropdown label="Price" options={priceOptions} selected={priceFilter} onChange={setPriceFilter} />
                {brandOptions.length > 1 && <FilterDropdown label="Brand" options={brandOptions} selected={brandFilter} onChange={setBrandFilter} />}
                <FilterDropdown label="Discount" options={discountOptions} selected={discountFilter} onChange={setDiscountFilter} />
                {shippingOptions.length > 1 && <FilterDropdown label="Shipping" options={shippingOptions} selected={shippingFilter} onChange={setShippingFilter} />}
                <FilterDropdown label="Rating" options={ratingOptions} selected={ratingFilter} onChange={setRatingFilter} />
              </div>
            )}
            {deals.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Sort:</label>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                  style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, background: "#fff", cursor: "pointer" }}>
                  <option value="relevance">Relevance</option>
                  <option value="price_low">Price: Low → High</option>
                  <option value="price_high">Price: High → Low</option>
                  <option value="discount">Biggest Discount</option>
                  <option value="rating">Top Rated</option>
                </select>
                {(activeFilterCount > 0 || storeFilter !== "all") && (
                  <button onClick={() => { setPriceFilter([]); setBrandFilter([]); setShippingFilter([]); setRatingFilter([]); setDiscountFilter([]); setStoreFilter("all"); }}
                    style={{ fontSize: 12, color: "#dc2626", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", marginLeft: "auto" }}>
                    Clear all
                  </button>
                )}
              </div>
            )}
            {loading && (
              <div style={{ textAlign: "center", marginTop: 40 }}>
                <div style={{ fontSize: 16, marginBottom: 8 }}>🔍 Searching {currentCountryObj.label} deals...</div>
                <div style={{ fontSize: 13, color: "#9ca3af" }}>Fetching from all available stores</div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
              {filteredDeals.map((deal, i) => <DealCard key={i} deal={deal} showDiscount={true} />)}
            </div>
            {!loading && !hasSearched && (
              <div style={{ textAlign: "center", marginTop: 80, color: "#9ca3af" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🌍</div>
                <div style={{ fontSize: 16 }}>Search deals in {currentCountryObj.label} across Amazon, eBay & more</div>
                <div style={{ fontSize: 13, marginTop: 8, color: "#d1d5db" }}>
                  {selectedCountry === "US"
                    ? "🟠 Amazon • 💙 Best Buy • 🔵 Walmart • 🔴 eBay"
                    : selectedCountry === "CA"
                    ? "🟠 Amazon • 💙 Best Buy • 🔴 eBay"
                    : "🟠 Amazon • 🔴 eBay • 🌐 Google Shopping"}
                </div>
              </div>
            )}
          </>
        )}

        {/* WITHOUT DISCOUNT TAB */}
        {activeTab === "nodiscount" && (
          <>
            {!hasSearched && !loading && (
              <div style={{ textAlign: "center", marginTop: 80, color: "#9ca3af" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🏷️</div>
                <div style={{ fontSize: 16 }}>Search for a product to see full-price listings</div>
              </div>
            )}
            {hasSearched && (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>🏷️</span>
                <span style={{ fontSize: 13, color: "#475569" }}>
                  <strong>Full-price listings</strong> from {currentCountryObj.label} — Amazon, eBay & more.
                </span>
              </div>
            )}
            {noDiscountDeals.length > 0 && (
              <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
                <StoreDropdown stores={buildStoreOptions(noDiscountDeals)} selected={ndStoreFilter} onChange={setNdStoreFilter} />
                <FilterDropdown label="Price" options={priceOptions} selected={ndPriceFilter} onChange={setNdPriceFilter} />
                {ndBrandOptions.length > 1 && <FilterDropdown label="Brand" options={ndBrandOptions} selected={ndBrandFilter} onChange={setNdBrandFilter} />}
                <FilterDropdown label="Rating" options={ratingOptions} selected={ndRatingFilter} onChange={setNdRatingFilter} />
              </div>
            )}
            {noDiscountDeals.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Sort:</label>
                <select value={ndSortBy} onChange={(e) => setNdSortBy(e.target.value)}
                  style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, background: "#fff", cursor: "pointer" }}>
                  <option value="relevance">Relevance</option>
                  <option value="price_low">Price: Low → High</option>
                  <option value="price_high">Price: High → Low</option>
                  <option value="rating">Top Rated</option>
                </select>
                {(ndActiveFilterCount > 0 || ndStoreFilter !== "all") && (
                  <button onClick={() => { setNdPriceFilter([]); setNdBrandFilter([]); setNdRatingFilter([]); setNdStoreFilter("all"); }}
                    style={{ fontSize: 12, color: "#dc2626", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", marginLeft: "auto" }}>
                    Clear all
                  </button>
                )}
              </div>
            )}
            {loading && <div style={{ textAlign: "center", marginTop: 40, fontSize: 16 }}>🔍 Fetching listings...</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
              {filteredNdDeals.map((deal, i) => <DealCard key={i} deal={deal} showDiscount={false} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
