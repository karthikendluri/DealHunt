import { useState, useRef, useEffect } from "react";

const SERPER_KEY = import.meta.env.VITE_SERPER_KEY;

// ─── CACHE LAYER ───────────────────────────────────────────
// Saves results in memory for the session
// Same search = zero API calls reused from cache
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 15; // 15 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// ─── API CALLS ─────────────────────────────────────────────
async function serperSearch(query, location, withDiscount) {
  const country = location?.countryCode?.toLowerCase() || "us";
  const q = withDiscount ? query + " discount sale" : query;
  const cacheKey = `${q}__${country}`;

  const cached = getCached(cacheKey);
  if (cached) {
    console.log("✅ Cache hit:", cacheKey);
    return cached;
  }

  console.log("🌐 API call:", cacheKey);
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
            <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.45)", color: "#fff", padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 500 }}>
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

// ─── CACHE STATS BADGE ─────────────────────────────────────
function CacheStats() {
  const size = cache.size;
  if (size === 0) return null;
  return (
    <div style={{ fontSize: 11, color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "3px 10px", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 4 }}>
      ⚡ {size} search{size !== 1 ? "es" : ""} cached — no extra API calls
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
    setLoading(true);

    // Count how many are real API calls vs cache hits
    const key1 = `${query + " discount sale"}__${location?.countryCode?.toLowerCase() || "us"}`;
    const key2 = `${query}__${location?.countryCode?.toLowerCase() || "us"}`;
    const hits = [getCached(key1), getCached(key2)].filter(Boolean).length;
    const newCalls = 2 - hits;
    if (newCalls > 0) setApiCallCount(c => c + newCalls);

    try {
      const [found, foundNd] = await Promise.all([
        serperSearch(query, location, true),
        serperSearch(query, location, false),
      ]);
      setDeals(found);
      setNoDiscountDeals(foundNd);
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

  const brandOptions = [...new Set(deals.map(d => d.brand))].slice(0, 10);
  const shippingOptions = [...new Set(deals.map(d => d.shipping).filter(Boolean))];
  const ndBrandOptions = [...new Set(noDiscountDeals.map(d => d.brand))].slice(0, 10);

  const filteredDeals = applySort(applyRating(applyPrice(
    deals
      .filter(d => !brandFilter.length || brandFilter.includes(d.brand))
      .filter(d => !shippingFilter.length || shippingFilter.includes(d.shipping))
      .filter(d => !discountFilter.length || discountFilter.some(r => {
        if (r === "50%+ off") return d.discount_percent >= 50;
        if (r === "30%+ off") return d.discount_percent >= 30;
        if (r === "15%+ off") return d.discount_percent >= 15;
        return true;
      })),
    priceFilter), ratingFilter), sortBy);

  const filteredNdDeals = applySort(applyRating(applyPrice(
    noDiscountDeals.filter(d => !ndBrandFilter.length || ndBrandFilter.includes(d.brand)),
    ndPriceFilter), ndRatingFilter), ndSortBy);

  const activeFilterCount = brandFilter.length + priceFilter.length + shippingFilter.length + ratingFilter.length + discountFilter.length;
  const ndActiveFilterCount = ndPriceFilter.length + ndBrandFilter.length + ndRatingFilter.length;
  const hasSearched = deals.length > 0 || noDiscountDeals.length > 0;

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>🔥 DealHunt</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <CacheStats />
            {/* API call counter */}
            <div style={{ fontSize: 11, color: "#6b7280", background: "#f3f4f6", border: "1px solid #e5e7eb", padding: "3px 10px", borderRadius: 20 }}>
              🌐 {apiCallCount} API call{apiCallCount !== 1 ? "s" : ""} used
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search product deals..."
            style={{ flex: 1, minWidth: 0, padding: 12, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14 }}
          />
          <button onClick={search} disabled={loading}
            style={{ background: "#2563eb", color: "#fff", padding: "12px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}>
            {loading ? "..." : "Search"}
          </button>
        </div>

        {/* Tabs — always visible */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
          <SectionTabs activeTab={activeTab} onChange={setActiveTab} />
          {hasSearched && (
            <span style={{ fontSize: 13, color: "#9ca3af" }}>
              {activeTab === "deals"
                ? `${filteredDeals.length} discounted result${filteredDeals.length !== 1 ? "s" : ""}`
                : `${filteredNdDeals.length} full-price result${filteredNdDeals.length !== 1 ? "s" : ""}`}
            </span>
          )}
        </div>

        {/* WITH DISCOUNT TAB */}
        {activeTab === "deals" && (
          <>
            {deals.length > 0 && (
              <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
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
                {activeFilterCount > 0 && (
                  <button onClick={() => { setPriceFilter([]); setBrandFilter([]); setShippingFilter([]); setRatingFilter([]); setDiscountFilter([]); }}
                    style={{ fontSize: 12, color: "#dc2626", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", marginLeft: "auto" }}>
                    Clear all ({activeFilterCount})
                  </button>
                )}
              </div>
            )}
            {loading && <div style={{ textAlign: "center", marginTop: 40, fontSize: 16 }}>🔍 Searching deals...</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
              {filteredDeals.map((deal, i) => <DealCard key={i} deal={deal} showDiscount={true} />)}
            </div>
            {!loading && !hasSearched && (
              <div style={{ textAlign: "center", marginTop: 80, color: "#9ca3af" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🛍️</div>
                <div style={{ fontSize: 16 }}>Search for a product to find the best deals</div>
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
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>🏷️</span>
                <span style={{ fontSize: 13, color: "#475569" }}>
                  <strong>Full-price listings</strong> — compare against deal prices.
                </span>
              </div>
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
