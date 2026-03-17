import { useState, useRef, useEffect } from "react";

const SERPER_KEY = import.meta.env.VITE_SERPER_KEY;
const SERPAPI_KEY = import.meta.env.VITE_SERPAPI_KEY;
const BESTBUY_KEY = import.meta.env.VITE_BESTBUY_KEY;
const WALMART_KEY = import.meta.env.VITE_WALMART_KEY;
const EBAY_KEY = import.meta.env.VITE_EBAY_KEY;

// ─── CACHE ─────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 15;

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

// ─── SERPER ────────────────────────────────────────────────
async function serperSearch(query, location, withDiscount) {
  const country = location?.countryCode?.toLowerCase() || "us";
  const q = withDiscount ? query + " discount sale" : query;

  const cacheKey = `general__${q}__${country}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const res = await fetch("https://google.serper.dev/shopping", {
    method: "POST",
    headers: {
      "X-API-KEY": SERPER_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q, gl: country, num: 20 }),
  });

  const data = await res.json();
  if (!data.shopping) return [];

  const results = data.shopping.map((item) => {
    const price = parseFloat(item.price?.replace(/[^\d.]/g, "")) || 0;
    const original = withDiscount ? price * 1.2 : price;

    return {
      store: item.source || "Other",
      item: item.title || "",
      brand: item.title?.split(" ")[0] || "Unknown",
      original_price: original,
      discounted_price: price,
      discount_percent: Math.round(((original - price) / original) * 100),
      url: item.link || "#",
      image_url: item.imageUrl,
      currency: "$",
      rating: item.rating || null,
      reviews: item.reviews || null,
      shipping: "Standard",
    };
  });

  setCache(cacheKey, results);
  return results;
}

// ─── AMAZON (SERPAPI) ──────────────────────────────────────
async function amazonSearch(query) {
  const cacheKey = `amazon__${query}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://serpapi.com/search.json?engine=amazon&k=${encodeURIComponent(
        query
      )}&api_key=${SERPAPI_KEY}`
    );

    const data = await res.json();

    const items =
      data.organic_results ||
      data.shopping_results ||
      [];

    const results = items.map((item) => {
      const price =
        parseFloat((item.price || "").toString().replace(/[^\d.]/g, "")) || 0;

      return {
        store: "Amazon",
        item: item.title || "",
        brand: item.title?.split(" ")[0] || "Amazon",
        original_price: price * 1.15,
        discounted_price: price,
        discount_percent: 13,
        url: item.link || item.product_link || "#",
        image_url: item.thumbnail || item.image,
        currency: "$",
        rating: item.rating || null,
        reviews: item.reviews || null,
        shipping: "Amazon shipping",
      };
    });

    setCache(cacheKey, results);
    return results;
  } catch (e) {
    console.error("Amazon error:", e);
    return [];
  }
}

// ─── EBAY ──────────────────────────────────────────────────
async function ebaySearch(query) {
  const cacheKey = `ebay__${query}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findItemsByKeywords&SERVICE-VERSION=1.0.0&SECURITY-APPNAME=${EBAY_KEY}&RESPONSE-DATA-FORMAT=JSON&keywords=${encodeURIComponent(
        query
      )}`
    );

    const data = await res.json();

    const items =
      data?.findItemsByKeywordsResponse?.[0]?.searchResult?.[0]?.item || [];

    const results = items.map((item) => {
      const price =
        parseFloat(
          item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__
        ) || 0;

      return {
        store: "eBay",
        item: item.title?.[0] || "",
        brand: item.title?.[0]?.split(" ")[0] || "Unknown",
        original_price: price * 1.1,
        discounted_price: price,
        discount_percent: 9,
        url: item.viewItemURL?.[0] || "#",
        image_url: item.galleryURL?.[0],
        currency: "$",
        rating: null,
        reviews: null,
        shipping: "Standard",
      };
    });

    setCache(cacheKey, results);
    return results;
  } catch (e) {
    console.error("eBay error:", e);
    return [];
  }
}

// ─── MAIN APP ──────────────────────────────────────────────
export default function App() {
  const [query, setQuery] = useState("");
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!query.trim()) return;

    setLoading(true);

    try {
      const [general, amazon, ebay] = await Promise.all([
        serperSearch(query, {}, true),
        amazonSearch(query),
        ebaySearch(query),
      ]);

      setDeals([...amazon, ...ebay, ...general]);
    } catch (e) {
      console.error(e);
    }

    setLoading(false);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>🔥 DealHunt (Amazon Added)</h1>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products..."
      />
      <button onClick={search}>Search</button>

      {loading && <p>Loading...</p>}

      <div style={{ display: "grid", gap: 20 }}>
        {deals.map((d, i) => (
          <div key={i} style={{ border: "1px solid #ccc", padding: 10 }}>
            <h3>{d.item}</h3>
            <p>{d.store}</p>
            <p>${d.discounted_price}</p>
            <a href={d.url} target="_blank">View</a>
          </div>
        ))}
      </div>
    </div>
  );
}
