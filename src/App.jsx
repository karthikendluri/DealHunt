import { useState, useRef, useEffect } from "react";

const SERPER_KEY = import.meta.env.VITE_SERPER_KEY;
const BESTBUY_KEY = import.meta.env.VITE_BESTBUY_KEY;
const WALMART_KEY = import.meta.env.VITE_WALMART_KEY;
const EBAY_KEY = import.meta.env.VITE_EBAY_KEY;

// ─── CACHE ─────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 15;

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}
function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// ─── SERPER ────────────────────────────────────────────────
async function serperSearch(query, location, withDiscount) {
  const country = location?.countryCode?.toLowerCase() || "us";
  const q = withDiscount ? query + " discount sale" : query;
  const cacheKey = `general__${q}__${country}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const res = await fetch("https://google.serper.dev/shopping", {
    method: "POST",
    headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ q, gl: country, num: 20 }),
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
      currency: "$",
      rating: item.rating ? parseFloat(item.rating) : null,
      reviews: item.reviews || null,
      shipping: item.shipping || "Standard",
    };
  });

  setCache(cacheKey, results);
  return results;
}

// ─── BEST BUY ──────────────────────────────────────────────
async function bestBuySearch(query) {
  const cacheKey = `bestbuy__${query}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://api.bestbuy.com/v1/products((search=${encodeURIComponent(query)}))?apiKey=${BESTBUY_KEY}&show=name,salePrice,regularPrice,url,image,customerReviewAverage,customerReviewCount,shippingCost&pageSize=10&format=json`
    );
    const data = await res.json();
    const items = data.products || [];

    const results = items.map(item => ({
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

// ─── WALMART ───────────────────────────────────────────────
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
    const items = data.items || [];

    const results = items.map(item => ({
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
async function ebaySearch(query) {
  const cacheKey = `ebay__${query}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findItemsByKeywords&SERVICE-VERSION=1.0.0&SECURITY-APPNAME=${EBAY_KEY}&RESPONSE-DATA-FORMAT=JSON&keywords=${encodeURIComponent(query)}&paginationInput.entriesPerPage=10&itemFilter(0).name=ListingType&itemFilter(0).value=FixedPrice&sortOrder=BestMatch`
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
        currency: "$",
        rating: null,
        reviews: null,
        shipping: shipping === 0 ? "Free shipping" : `$${shipping.toFixed(2)} shipping`,
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

// ─── STORE BADGE ───────────────────────────────────────────
function storeBadgeStyle(store) {
  if (store === "Best Buy") return { background: "#1d4ed8", color: "#fff" };
  if (store === "Walmart") return { background: "#0071ce", color: "#fff" };
  if (store === "eBay") return { background: "#e53238", color: "#fff" };
  return { background: "rgba(0,0,0,0.45)", color: "#fff" };
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
            <div style={{
              position: "absolute", bottom: 8, right: 8,
              ...storeBadgeStyle(deal.store),
              padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600
            }}>
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
          <div style={{ fontSize: 11, color: "#16a34a", marginTop: 4 }}>{deal.shipping}</div>
        )}
        <a href={deal.url} target="_blank" rel="noreferrer noopener"
          style={{ display: "inline-block", marginTop: 12, background: "#2563eb", color: "#fff", padding: "8px 14px", borderRadius: 8, fontSize: 13, textDecoration: "none" }}>
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

// ─── STORE FILTER ──────────────────────────────────────────
const STORES = [
  { id: "Best Buy", label: "💙 Best Buy" },
  { id: "Walmart",  label: "🔵 Walmart" },
  { id: "eBay",     label: "🔴 eBay" },
  { id: "other",    label: "🌐 Other" },
];

function StoreFilter({ selected, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
      {STORES.map(s => (
        <button key={s.id} onClick={() => onChange(s.id)} style={{
          padding: "6px 14px", borderRadius: 20, border: "1px solid #e5e7eb",
          background: selected === s.id ? "#2563eb" : "#fff",
          color: selected === s.id ? "#fff" : "#374151",
          fontSize: 13, cursor: "pointer", fontWeight: selected === s.id ? 600 : 400,
          transition: "all 0.15s"
        }}>
          {s.label}
        </button>
      ))}
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

// ─── MAIN APP ──────────────────────────────────────────────
export default function App() {
  const [query, setQuery] = useState("");
  const [deals, setDeals] = useState([]);
  const [noDiscountDeals, setNoDiscountDeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState(null);
  const [activeTab, setActiveTab] = useState("deals");
  const [apiCallCount, setApiCallCount] = useState(0);
  const [storeFilter, setStoreFilter] = useState("all");
  const [ndStoreFilter, setNdStoreFilter] = useState("all");
  const inputRef = useRef(null);

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

  useEffect(() => {
    fetch("https://ipapi.co/json/")
      .then(r => r.json())
      .then(d => setLocation({ city: d.city, country: d.country_name, countryCode: d.country_code }))
      .catch(() => setLocation({ city: "Unknown", country: "US", countryCode: "US" }));
  }, []);

  const search = async () => {
    if (!query.trim()) return;
    setDeals([]);
    setNoDiscountDeals([]);
    setPriceFilter([]); setBrandFilter([]); setShippingFilter([]);
    setRatingFilter([]); setDiscountFilter([]);
    setNdPriceFilter([]); setNdBrandFilter([]); setNdRatingFilter([]);
    setStoreFilter("all"); setNdStoreFilter("all");
    setLoading(true);
    setApiCallCount(c => c + 5);

    try {
      const [general, bestbuy, walmart, ebay, generalNd] = await Promise.all([
        serperSearch(query, location, true),
        bestBuySearch(query),
        walmartSearch(query),
        ebaySearch(query),
        serperSearch(query, location, false),
      ]);

      setDeals([...bestbuy, ...walmart, ...ebay, ...general]);
      setNoDiscountDeals([...bestbuy, ...walmart, ...ebay, ...generalNd]);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // ── filter helpers ──
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
    if (sf === "other") return list.filter(d => !["Best Buy", "Walmart", "eBay"].includes(d.store));
    return list.filter(d => d.store === sf);
  };

  const knownStores = ["Best Buy", "Walmart", "eBay"];
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

  // Store result counts for badges
  const storeCounts = (list) => {
    const counts = { all: list.length };
    STORES.forEach(s => {
      if (s.id !== "all") {
        counts[s.id] = s.id === "other"
          ? list.filter(d => !knownStores.includes(d.store)).length
          : list.filter(d => d.store === s.id).length;
      }
    });
    return counts;
  };
  const dealCounts = storeCounts(deals);
  const ndCounts = storeCounts(noDiscountDeals);

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>🔥 DealHunt</h1>
          <CacheStats apiCallCount={apiCallCount} />
        </div>

        {/* Search bar */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search Best Buy, Walmart, eBay & more..."
            style={{ flex: 1, minWidth: 0, padding: 12, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14 }}
          />
          <button onClick={search} disabled={loading}
            style={{ background: "#2563eb", color: "#fff", padding: "12px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}>
            {loading ? "..." : "Search"}
          </button>
        </div>

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
              <>
                {/* Store filter with counts */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {STORES.map(s => (
                    <button key={s.id} onClick={() => setStoreFilter(s.id)} style={{
                      padding: "6px 14px", borderRadius: 20, border: "1px solid #e5e7eb",
                      background: storeFilter === s.id ? "#2563eb" : "#fff",
                      color: storeFilter === s.id ? "#fff" : "#374151",
                      fontSize: 13, cursor: "pointer", fontWeight: storeFilter === s.id ? 600 : 400,
                      display: "flex", alignItems: "center", gap: 5
                    }}>
                      {s.label}
                      {dealCounts[s.id] > 0 && (
                        <span style={{
                          background: storeFilter === s.id ? "rgba(255,255,255,0.3)" : "#e5e7eb",
                          color: storeFilter === s.id ? "#fff" : "#6b7280",
                          borderRadius: 10, padding: "1px 6px", fontSize: 11, fontWeight: 700
                        }}>
                          {dealCounts[s.id]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <FilterDropdown label="Price" options={priceOptions} selected={priceFilter} onChange={setPriceFilter} />
                  {brandOptions.length > 1 && <FilterDropdown label="Brand" options={brandOptions} selected={brandFilter} onChange={setBrandFilter} />}
                  <FilterDropdown label="Discount" options={discountOptions} selected={discountFilter} onChange={setDiscountFilter} />
                  {shippingOptions.length > 1 && <FilterDropdown label="Shipping" options={shippingOptions} selected={shippingFilter} onChange={setShippingFilter} />}
                  <FilterDropdown label="Rating" options={ratingOptions} selected={ratingFilter} onChange={setRatingFilter} />
                </div>
              </>
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
                {activeFilterCount > 0 && (
                  <button onClick={() => { setPriceFilter([]); setBrandFilter([]); setShippingFilter([]); setRatingFilter([]); setDiscountFilter([]); }}
                    style={{ fontSize: 12, color: "#dc2626", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", marginLeft: "auto" }}>
                    Clear all ({activeFilterCount})
                  </button>
                )}
              </div>
            )}
            {loading && (
              <div style={{ textAlign: "center", marginTop: 40 }}>
                <div style={{ fontSize: 16, marginBottom: 8 }}>🔍 Searching Best Buy, Walmart, eBay...</div>
                <div style={{ fontSize: 13, color: "#9ca3af" }}>Fetching from all stores simultaneously</div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
              {filteredDeals.map((deal, i) => <DealCard key={i} deal={deal} showDiscount={true} />)}
            </div>
            {!loading && !hasSearched && (
              <div style={{ textAlign: "center", marginTop: 80, color: "#9ca3af" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🛍️</div>
                <div style={{ fontSize: 16 }}>Search deals across Best Buy, Walmart, eBay & more</div>
                <div style={{ fontSize: 13, marginTop: 8, color: "#d1d5db" }}>💙 Best Buy &nbsp;•&nbsp; 🔵 Walmart &nbsp;•&nbsp; 🔴 eBay</div>
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
              <>
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>🏷️</span>
                  <span style={{ fontSize: 13, color: "#475569" }}>
                    <strong>Full-price listings</strong> from Best Buy, Walmart, eBay & more.
                  </span>
                </div>

                {/* Store filter with counts */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {STORES.map(s => (
                    <button key={s.id} onClick={() => setNdStoreFilter(s.id)} style={{
                      padding: "6px 14px", borderRadius: 20, border: "1px solid #e5e7eb",
                      background: ndStoreFilter === s.id ? "#374151" : "#fff",
                      color: ndStoreFilter === s.id ? "#fff" : "#374151",
                      fontSize: 13, cursor: "pointer", fontWeight: ndStoreFilter === s.id ? 600 : 400,
                      display: "flex", alignItems: "center", gap: 5
                    }}>
                      {s.label}
                      {ndCounts[s.id] > 0 && (
                        <span style={{
                          background: ndStoreFilter === s.id ? "rgba(255,255,255,0.3)" : "#e5e7eb",
                          color: ndStoreFilter === s.id ? "#fff" : "#6b7280",
                          borderRadius: 10, padding: "1px 6px", fontSize: 11, fontWeight: 700
                        }}>
                          {ndCounts[s.id]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
            {noDiscountDeals.length > 0 && (
              <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
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
                {ndActiveFilterCount > 0 && (
                  <button onClick={() => { setNdPriceFilter([]); setNdBrandFilter([]); setNdRatingFilter([]); }}
                    style={{ fontSize: 12, color: "#dc2626", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", marginLeft: "auto" }}>
                    Clear all ({ndActiveFilterCount})
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
```

Key changes:
- **Sam's Club & Costco fully removed**
- **Best Buy, Walmart, eBay** integrated with real APIs
- **Store filter pills show live counts** — e.g. `💙 Best Buy 8` so you know how many results per store
- Active store filter uses different color per tab (blue for deals, dark for no-discount)
- Add these to your `.env`:
```
VITE_BESTBUY_KEY=your_bestbuy_key
VITE_WALMART_KEY=your_walmart_key
VITE_EBAY_KEY=your_ebay_appid
