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

function extractDirectUrl(rawUrl) {
  if (!rawUrl) return "#";
  try {
    const urlObj = new URL(rawUrl);
    if (urlObj.hostname.includes("google.com")) {
      const qParam = urlObj.searchParams.get("q");
      if (qParam) return qParam;
      const urlParam = urlObj.searchParams.get("url");
      if (urlParam) return urlParam;
      const adurl = urlObj.searchParams.get("adurl");
      if (adurl) return adurl;
    }
  } catch (_) {}
  return rawUrl;
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
    const rawUrl = item.link || item.productLink || "";
    const directUrl = extractDirectUrl(rawUrl);
    return {
      store: item.source || "Store",
      item: item.title || "",
      brand: item.title.split(" ")[0] || "Unknown",
      original_price: original,
      discounted_price: price,
      discount_percent: discount,
      deal_type: "Sale",
      expires: "Limited time",
      url: directUrl,
      image_url: item.imageUrl,
      currency: "$",
      available_in: location?.country || "US",
      rating: Math.floor(Math.random() * 5) + 1,
      condition: Math.random() > 0.2 ? "New" : "Refurbished",
      in_stock: Math.random() > 0.1,
      features: ["Wi-Fi", "Bluetooth"][Math.floor(Math.random() * 2)],
      shipping: Math.random() > 0.5 ? "Free shipping" : "Standard",
      warranty: ["1-year", "2-year"][Math.floor(Math.random() * 2)],
    };
  });
}

function DealCard({ deal }) {
  const dc = discountColor(deal.discount_percent);
  const bg = discountBg(deal.discount_percent);
  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", overflow: "hidden", position: "relative" }}>
      <div style={{ height: 180, background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        {deal.image_url ? (
          <img src={deal.image_url} alt={deal.item} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", padding: 16 }} />
        ) : (
          <div style={{ fontSize: 30 }}>📦</div>
        )}
        <div style={{ position: "absolute", top: 12, right: 12, background: bg, color: dc, padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
          -{deal.discount_percent}%
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{deal.store}</div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, lineHeight: 1.4 }}>{deal.item}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: dc }}>{deal.currency}{deal.discounted_price.toFixed(2)}</span>
          <span style={{ textDecoration: "line-through", color: "#9ca3af", fontSize: 13 }}>{deal.currency}{deal.original_price.toFixed(2)}</span>
        </div>
        
          href={deal.url}
          target="_blank"
          rel="noreferrer noopener"
          style={{ display: "inline-block", marginTop: 12, background: "#2563eb", color: "#fff", padding: "8px 14px", borderRadius: 8, fontSize: 13, textDecoration: "none" }}
        >
          View deal →
        </a>
      </div>
    </div>
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState(null);
  const inputRef = useRef(null);

  const [brandFilter, setBrandFilter] = useState([]);
  const [priceFilter, setPriceFilter] = useState([]);
  const [ratingFilter, setRatingFilter] = useState([]);
  const [availabilityFilter, setAvailabilityFilter] = useState([]);
  const [conditionFilter, setConditionFilter] = useState([]);
  const [featuresFilter, setFeaturesFilter] = useState([]);
  const [dealTypeFilter, setDealTypeFilter] = useState([]);
  const [shippingFilter, setShippingFilter] = useState([]);
  const [warrantyFilter, setWarrantyFilter] = useState([]);
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
    setDeals([]); setLoading(true);
    try { const found = await serperSearch(query, location); setDeals(found); }
    catch (e) { console.error(e); }
    setLoading(false);
  };

  const toggleFilter = (filter, setter, value) => {
    setter(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  };

  const filteredDeals = deals
    .filter(d => !brandFilter.length || brandFilter.includes(d.brand))
    .filter(d => !priceFilter.length || priceFilter.some(r => {
      if (r === "Under $50") return d.discounted_price < 50;
      if (r === "$50-$200") return d.discounted_price >= 50 && d.discounted_price <= 200;
      if (r === "$200+") return d.discounted_price > 200;
      return true;
    }))
    .filter(d => !ratingFilter.length || ratingFilter.some(r => d.rating >= r))
    .filter(d => !availabilityFilter.length || availabilityFilter.some(a => (a === "In stock" && d.in_stock) || (a === "Store pickup" && d.in_stock)))
    .filter(d => !conditionFilter.length || conditionFilter.includes(d.condition))
    .filter(d => !featuresFilter.length || featuresFilter.includes(d.features))
    .filter(d => !dealTypeFilter.length || dealTypeFilter.includes(d.deal_type))
    .filter(d => !shippingFilter.length || shippingFilter.includes(d.shipping))
    .filter(d => !warrantyFilter.length || warrantyFilter.includes(d.warranty))
    .sort((a, b) => {
      if (sortBy === "price_low") return a.discounted_price - b.discounted_price;
      if (sortBy === "price_high") return b.discounted_price - a.discounted_price;
      if (sortBy === "discount") return b.discount_percent - a.discount_percent;
      return 0;
    });

  const brands = [...new Set(deals.map(d => d.brand))];
  const features = [...new Set(deals.map(d => d.features))];
  const warranties = [...new Set(deals.map(d => d.warranty))];

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 30 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700 }}>🔥 DealHunt</h1>
        <div style={{ display: "flex", gap: 20 }}>

          {/* Sidebar */}
          <div style={{ width: 300, background: "#fff", padding: 16, borderRadius: 8, border: "1px solid #e5e7eb", alignSelf: "flex-start" }}>
            <h3>Brand</h3>
            {brands.map(b => (
              <label key={b} style={{ display: "block", fontSize: 13 }}>
                <input type="checkbox" checked={brandFilter.includes(b)} onChange={() => toggleFilter(brandFilter, setBrandFilter, b)} style={{ marginRight: 6 }} /> {b}
              </label>
            ))}
            <h3 style={{ marginTop: 12 }}>Price</h3>
            {["Under $50", "$50-$200", "$200+"].map(p => (
              <label key={p} style={{ display: "block", fontSize: 13 }}>
                <input type="checkbox" checked={priceFilter.includes(p)} onChange={() => toggleFilter(priceFilter, setPriceFilter, p)} style={{ marginRight: 6 }} /> {p}
              </label>
            ))}
            <h3 style={{ marginTop: 12 }}>Customer Ratings</h3>
            {[4, 3].map(r => (
              <label key={r} style={{ display: "block", fontSize: 13 }}>
                <input type="checkbox" checked={ratingFilter.includes(r)} onChange={() => toggleFilter(ratingFilter, setRatingFilter, r)} style={{ marginRight: 6 }} /> {r} stars & up
              </label>
            ))}
            <h3 style={{ marginTop: 12 }}>Availability</h3>
            {["In stock", "Store pickup"].map(a => (
              <label key={a} style={{ display: "block", fontSize: 13 }}>
                <input type="checkbox" checked={availabilityFilter.includes(a)} onChange={() => toggleFilter(availabilityFilter, setAvailabilityFilter, a)} style={{ marginRight: 6 }} /> {a}
              </label>
            ))}
            <h3 style={{ marginTop: 12 }}>Condition</h3>
            {["New", "Refurbished"].map(c => (
              <label key={c} style={{ display: "block", fontSize: 13 }}>
                <input type="checkbox" checked={conditionFilter.includes(c)} onChange={() => toggleFilter(conditionFilter, setConditionFilter, c)} style={{ marginRight: 6 }} /> {c}
              </label>
            ))}
            <h3 style={{ marginTop: 12 }}>Features</h3>
            {features.map(f => (
              <label key={f} style={{ display: "block", fontSize: 13 }}>
                <input type="checkbox" checked={featuresFilter.includes(f)} onChange={() => toggleFilter(featuresFilter, setFeaturesFilter, f)} style={{ marginRight: 6 }} /> {f}
              </label>
            ))}
            <h3 style={{ marginTop: 12 }}>Deals / Discounts</h3>
            {["Sale", "Clearance", "Bundle offers"].map(d => (
              <label key={d} style={{ display: "block", fontSize: 13 }}>
                <input type="checkbox" checked={dealTypeFilter.includes(d)} onChange={() => toggleFilter(dealTypeFilter, setDealTypeFilter, d)} style={{ marginRight: 6 }} /> {d}
              </label>
            ))}
            <h3 style={{ marginTop: 12 }}>Shipping</h3>
            {["Free shipping", "Standard"].map(s => (
              <label key={s} style={{ display: "block", fontSize: 13 }}>
                <input type="checkbox" checked={shippingFilter.includes(s)} onChange={() => toggleFilter(shippingFilter, setShippingFilter, s)} style={{ marginRight: 6 }} /> {s}
              </label>
            ))}
            <h3 style={{ marginTop: 12 }}>Warranty</h3>
            {warranties.map(w => (
              <label key={w} style={{ display: "block", fontSize: 13 }}>
                <input type="checkbox" checked={warrantyFilter.includes(w)} onChange={() => toggleFilter(warrantyFilter, setWarrantyFilter, w)} style={{ marginRight: 6 }} /> {w}
              </label>
            ))}
          </div>

          {/* Main content */}
          <div style={{ flex: 1 }}>
            {/* Search bar */}
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && search()}
                placeholder="Search product deals..."
                style={{ flex: 1, padding: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
              />
              <button
                onClick={search}
                disabled={loading}
                style={{ background: "#2563eb", color: "#fff", padding: "12px 20px", borderRadius: 8, border: "none", cursor: "pointer" }}
              >
                {loading ? "Searching..." : "Search"}
              </button>
            </div>

            {/* Sort By — below search bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>Sort by:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, background: "#fff", cursor: "pointer" }}
              >
                <option value="relevance">Relevance</option>
                <option value="price_low">Price: Low → High</option>
                <option value="price_high">Price: High → Low</option>
                <option value="discount">Biggest Discount</option>
              </select>
              {filteredDeals.length > 0 && (
                <span style={{ fontSize: 13, color: "#6b7280", marginLeft: "auto" }}>
                  {filteredDeals.length} result{filteredDeals.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {loading && <div style={{ textAlign: "center", marginTop: 20 }}>🔍 Searching deals...</div>}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
              {filteredDeals.map((deal, i) => <DealCard key={i} deal={deal} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
