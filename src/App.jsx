import { useState, useRef, useEffect } from "react";

const SERPER_KEY = import.meta.env.VITE_SERPER_KEY;

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

async function serperSearch(query, location) {
  const country = location?.countryCode?.toLowerCase() || "us";
  const res = await fetch("https://google.serper.dev/shopping", {
    method: "POST",
    headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query + " discount sale", gl: country, num: 20 }),
  });
  const data = await res.json();
  if (!data.shopping) return [];
  return data.shopping.map((item) => {
    const price = parseFloat(item.price?.replace(/[^\d.]/g, "")) || 0;
    const original = price * 1.2;
    const discount = Math.round(((original - price) / original) * 100);
    return {
      store: item.source || "Store",
      item: item.title || "",
      brand: item.title.split(" ")[0] || "Unknown",
      original_price: original,
      discounted_price: price,
      discount_percent: discount,
      deal_type: "Sale",
      expires: "Limited time",
      url: item.link,
      image_url: item.imageUrl,
      currency: "$",
      available_in: location?.country || "US",
      rating: item.rating ? parseFloat(item.rating) : null,
      reviews: item.reviews || null,
      condition: "New",
      in_stock: true,
      shipping: item.shipping || "Standard",
    };
  });
}

function DealCard({ deal }) {
  const dc = discountColor(deal.discount_percent);
  const bg = discountBg(deal.discount_percent);

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", overflow: "hidden", position: "relative" }}>
      <a href={deal.url} target="_blank" rel="noreferrer noopener" style={{ display: "block", textDecoration: "none" }}>
        <div style={{ height: 180, background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative" }}>
          {deal.image_url ? (
            <img src={deal.image_url} alt={deal.item} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", padding: 16 }} />
          ) : (
            <div style={{ fontSize: 30 }}>📦</div>
          )}
          <div style={{ position: "absolute", top: 12, right: 12, background: bg, color: dc, padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
            -{deal.discount_percent}%
          </div>
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
          <span style={{ fontSize: 20, fontWeight: 700, color: dc }}>{deal.currency}{deal.discounted_price.toFixed(2)}</span>
          <span style={{ textDecoration: "line-through", color: "#9ca3af", fontSize: 13 }}>{deal.currency}{deal.original_price.toFixed(2)}</span>
        </div>
        {deal.shipping && deal.shipping !== "Standard" && (
          <div style={{ fontSize: 11, color: "#16a34a", marginTop: 4 }}>{deal.shipping}</div>
        )}
        <a href={deal.url} target="_blank" rel="noreferrer noopener" style={{ display: "inline-block", marginTop: 12, background: "#2563eb", color: "#fff", padding: "8px 14px", borderRadius: 8, fontSize: 13, textDecoration: "none" }}>
          View deal →
        </a>
      </div>
    </div>
  );
}

// Dropdown filter component for the top bar
function FilterDropdown({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (val) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: "8px 14px", borderRadius: 8, border: "1px solid #e5e7eb",
          background: selected.length ? "#2563eb" : "#fff",
          color: selected.length ? "#fff" : "#374151",
          fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
          display: "flex", alignItems: "center", gap: 6
        }}
      >
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

export default function App() {
  const [query, setQuery] = useState("");
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState(null);
  const inputRef = useRef(null);

  // Dynamic filters derived from results
  const [priceFilter, setPriceFilter] = useState([]);
  const [brandFilter, setBrandFilter] = useState([]);
  const [shippingFilter, setShippingFilter] = useState([]);
  const [ratingFilter, setRatingFilter] = useState([]);
  const [discountFilter, setDiscountFilter] = useState([]);
  const [sortBy, setSortBy] = useState("relevance");

  useEffect(() => { detectLocation(); }, []);

  const detectLocation = async () => {
    try {
      const res = await fetch("https://ipapi.co/json/");
      const data = await res.json();
      setLocation({ city: data.city, country: data.country_name, countryCode: data.country_code });
    } catch {
      setLocation({ city: "Unknown", country: "US", countryCode: "US" });
    }
  };

  const search = async () => {
    if (!query.trim()) return;
    setDeals([]);
    // reset filters on new search
    setPriceFilter([]); setBrandFilter([]); setShippingFilter([]);
    setRatingFilter([]); setDiscountFilter([]);
    setLoading(true);
    try {
      const found = await serperSearch(query, location);
      setDeals(found);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // Derive dynamic filter options from actual results
  const brandOptions = [...new Set(deals.map(d => d.brand))].slice(0, 10);
  const shippingOptions = [...new Set(deals.map(d => d.shipping).filter(Boolean))];
  const priceOptions = ["Under $25", "$25–$50", "$50–$100", "$100–$200", "$200+"];
  const ratingOptions = ["4★ & up", "3★ & up"];
  const discountOptions = ["50%+ off", "30%+ off", "15%+ off"];

  const filteredDeals = deals
    .filter(d => !brandFilter.length || brandFilter.includes(d.brand))
    .filter(d => !priceFilter.length || priceFilter.some(r => {
      if (r === "Under $25") return d.discounted_price < 25;
      if (r === "$25–$50") return d.discounted_price >= 25 && d.discounted_price < 50;
      if (r === "$50–$100") return d.discounted_price >= 50 && d.discounted_price < 100;
      if (r === "$100–$200") return d.discounted_price >= 100 && d.discounted_price <= 200;
      if (r === "$200+") return d.discounted_price > 200;
      return true;
    }))
    .filter(d => !ratingFilter.length || ratingFilter.some(r => {
      if (r === "4★ & up") return d.rating >= 4;
      if (r === "3★ & up") return d.rating >= 3;
      return true;
    }))
    .filter(d => !shippingFilter.length || shippingFilter.includes(d.shipping))
    .filter(d => !discountFilter.length || discountFilter.some(r => {
      if (r === "50%+ off") return d.discount_percent >= 50;
      if (r === "30%+ off") return d.discount_percent >= 30;
      if (r === "15%+ off") return d.discount_percent >= 15;
      return true;
    }))
    .sort((a, b) => {
      if (sortBy === "price_low") return a.discounted_price - b.discounted_price;
      if (sortBy === "price_high") return b.discounted_price - a.discounted_price;
      if (sortBy === "discount") return b.discount_percent - a.discount_percent;
      if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
      return 0;
    });

  const activeFilterCount = brandFilter.length + priceFilter.length + shippingFilter.length + ratingFilter.length + discountFilter.length;

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 30 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 16 }}>🔥 DealHunt</h1>

        {/* Search + filters all in one row */}
        <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search product deals..."
            style={{ flex: 1, minWidth: 200, padding: 12, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14 }}
          />
          <button
            onClick={search}
            disabled={loading}
            style={{ background: "#2563eb", color: "#fff", padding: "12px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14 }}
          >
            {loading ? "Searching..." : "Search"}
          </button>

          {/* Dynamic filter dropdowns — only shown after search */}
          {deals.length > 0 && (
            <>
              <div style={{ width: 1, height: 32, background: "#e5e7eb", margin: "0 4px" }} />
              <FilterDropdown label="Price" options={priceOptions} selected={priceFilter} onChange={setPriceFilter} />
              {brandOptions.length > 1 && (
                <FilterDropdown label="Brand" options={brandOptions} selected={brandFilter} onChange={setBrandFilter} />
              )}
              <FilterDropdown label="Discount" options={discountOptions} selected={discountFilter} onChange={setDiscountFilter} />
              {shippingOptions.length > 1 && (
                <FilterDropdown label="Shipping" options={shippingOptions} selected={shippingFilter} onChange={setShippingFilter} />
              )}
              <FilterDropdown label="Rating" options={ratingOptions} selected={ratingFilter} onChange={setRatingFilter} />
            </>
          )}
        </div>

        {/* Sort + result count row */}
        {deals.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, background: "#fff", cursor: "pointer" }}
            >
              <option value="relevance">Relevance</option>
              <option value="price_low">Price: Low → High</option>
              <option value="price_high">Price: High → Low</option>
              <option value="discount">Biggest Discount</option>
              <option value="rating">Top Rated</option>
            </select>
            <span style={{ fontSize: 13, color: "#6b7280", marginLeft: "auto" }}>
              {filteredDeals.length} result{filteredDeals.length !== 1 ? "s" : ""}
              {activeFilterCount > 0 && ` (${activeFilterCount} filter${activeFilterCount !== 1 ? "s" : ""} active)`}
            </span>
            {activeFilterCount > 0 && (
              <button
                onClick={() => { setPriceFilter([]); setBrandFilter([]); setShippingFilter([]); setRatingFilter([]); setDiscountFilter([]); }}
                style={{ fontSize: 12, color: "#dc2626", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                Clear all
              </button>
            )}
          </div>
        )}

        {loading && <div style={{ textAlign: "center", marginTop: 40, fontSize: 16 }}>🔍 Searching deals...</div>}

        {/* Deals grid — full width, no sidebar */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
          {filteredDeals.map((deal, i) => (
            <DealCard key={i} deal={deal} />
          ))}
        </div>

        {!loading && deals.length === 0 && (
          <div style={{ textAlign: "center", marginTop: 80, color: "#9ca3af" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🛍️</div>
            <div style={{ fontSize: 16 }}>Search for a product to find the best deals</div>
          </div>
        )}
      </div>
    </div>
  );
}
