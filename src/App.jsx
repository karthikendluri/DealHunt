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
    headers: {
      "X-API-KEY": SERPER_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query + " discount sale",
      gl: country,
      num: 10,
    }),
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
      highlight: "Deal found on Google Shopping",
      available_in: location?.country || "US",
    };
  });
}

function DealCard({ deal }) {
  const dc = discountColor(deal.discount_percent);
  const bg = discountBg(deal.discount_percent);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        border: "1px solid #e5e7eb",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          height: 180,
          background: "#f9fafb",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {deal.image_url ? (
          <img
            src={deal.image_url}
            alt={deal.item}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              padding: 16,
            }}
          />
        ) : (
          <div style={{ fontSize: 30 }}>📦</div>
        )}

        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: bg,
            color: dc,
            padding: "4px 10px",
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          -{deal.discount_percent}%
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
          {deal.store}
        </div>

        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 12,
            lineHeight: 1.4,
          }}
        >
          {deal.item}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: dc }}>
            {deal.currency}
            {deal.discounted_price.toFixed(2)}
          </span>

          <span
            style={{
              textDecoration: "line-through",
              color: "#9ca3af",
              fontSize: 13,
            }}
          >
            {deal.currency}
            {deal.original_price.toFixed(2)}
          </span>
        </div>

        <a
          href={deal.url}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-block",
            marginTop: 12,
            background: "#2563eb",
            color: "#fff",
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 13,
            textDecoration: "none",
          }}
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

  // Filters
  const [brandFilter, setBrandFilter] = useState("All");
  const [sortBy, setSortBy] = useState("relevance");

  const inputRef = useRef(null);

  useEffect(() => {
    detectLocation();
  }, []);

  const detectLocation = async () => {
    try {
      const res = await fetch("https://ipapi.co/json/");
      const data = await res.json();

      setLocation({
        city: data.city,
        country: data.country_name,
        countryCode: data.country_code,
      });
    } catch {
      setLocation({
        city: "Unknown",
        country: "US",
        countryCode: "US",
      });
    }
  };

  const search = async () => {
    if (!query.trim()) return;

    setDeals([]);
    setLoading(true);

    try {
      const found = await serperSearch(query, location);
      setDeals(found);
    } catch (e) {
      console.error(e);
    }

    setLoading(false);
  };

  const suggestions = ["iPhone 16", "Nike Air Max", "PS5", "AirPods Pro", "MacBook Air"];

  // Extract brands from current deals
  const brands = ["All", ...new Set(deals.map((d) => d.item.split(" ")[0]))];

  // Apply filters and sorting
  const filteredDeals = deals
    .filter((deal) => {
      if (brandFilter !== "All" && !deal.item.includes(brandFilter)) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "price_low") return a.discounted_price - b.discounted_price;
      if (sortBy === "price_high") return b.discounted_price - a.discounted_price;
      if (sortBy === "discount") return b.discount_percent - a.discount_percent;
      return 0;
    });

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 30 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>🔥 DealHunt</h1>
        <p style={{ color: "#6b7280", marginBottom: 20 }}>Find the best product deals online</p>

        <div style={{ display: "flex", gap: 10 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search product deals..."
            style={{ flex: 1, padding: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <button
            onClick={search}
            disabled={loading}
            style={{
              background: "#2563eb",
              color: "#fff",
              padding: "12px 20px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
            }}
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setQuery(s)}
              style={{
                marginRight: 8,
                marginTop: 8,
                fontSize: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: "4px 10px",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ marginTop: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            style={{ padding: 8, borderRadius: 8 }}
          >
            {brands.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ padding: 8, borderRadius: 8 }}
          >
            <option value="relevance">Relevance</option>
            <option value="price_low">Price: Low → High</option>
            <option value="price_high">Price: High → Low</option>
            <option value="discount">Biggest Discount</option>
          </select>
        </div>

        {loading && <div style={{ marginTop: 30, textAlign: "center" }}>🔍 Searching deals...</div>}

        <div
          style={{
            marginTop: 30,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))",
            gap: 16,
          }}
        >
          {filteredDeals.map((deal, i) => (
            <DealCard key={i} deal={deal} />
          ))}
        </div>
      </div>
    </div>
  );
}
