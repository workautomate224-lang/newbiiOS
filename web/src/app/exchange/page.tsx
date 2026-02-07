"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { getMarkets } from "@/lib/api";

interface MarketOutcome {
  name: string;
  probability: number;
}

interface MarketSignals {
  ai: number;
  crowd: number;
  reputation: number;
}

interface Market {
  id: string;
  title: string;
  category: string;
  outcomes: MarketOutcome[];
  position_count: number;
  signals: MarketSignals;
  created_at: string;
}

const CATEGORIES = ["All", "Politics", "Economics", "Tech", "Finance"];
const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Popular" },
  { value: "divergent", label: "Most Divergent" },
];

const DEMO_MARKETS: Market[] = [
  {
    id: "demo-1",
    title: "Will AI regulation pass in the US by 2027?",
    category: "Politics",
    outcomes: [
      { name: "Yes", probability: 0.62 },
      { name: "No", probability: 0.38 },
    ],
    position_count: 1247,
    signals: { ai: 0.58, crowd: 0.65, reputation: 0.63 },
    created_at: "2026-01-15T00:00:00Z",
  },
  {
    id: "demo-2",
    title: "Bitcoin exceeds $200K by end of 2026?",
    category: "Finance",
    outcomes: [
      { name: "Yes", probability: 0.34 },
      { name: "No", probability: 0.66 },
    ],
    position_count: 3891,
    signals: { ai: 0.28, crowd: 0.41, reputation: 0.33 },
    created_at: "2026-01-20T00:00:00Z",
  },
  {
    id: "demo-3",
    title: "Global GDP growth exceeds 3.5% in 2027?",
    category: "Economics",
    outcomes: [
      { name: "Yes", probability: 0.45 },
      { name: "No", probability: 0.55 },
    ],
    position_count: 762,
    signals: { ai: 0.48, crowd: 0.42, reputation: 0.45 },
    created_at: "2026-02-01T00:00:00Z",
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  Politics: "bg-rose-900/50 text-rose-400",
  Economics: "bg-emerald-900/50 text-emerald-400",
  Tech: "bg-cyan-900/50 text-cyan-400",
  Finance: "bg-amber-900/50 text-amber-400",
};

export default function ExchangePage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("newest");

  useEffect(() => {
    async function load() {
      try {
        const cat = category === "All" ? undefined : category.toLowerCase();
        const data = await getMarkets(cat, sort);
        const list: Market[] = Array.isArray(data)
          ? data
          : data.markets ?? [];
        setMarkets(list.length > 0 ? list : DEMO_MARKETS);
      } catch {
        setMarkets(DEMO_MARKETS);
      }
      setLoading(false);
    }
    load();
  }, [category, sort]);

  const filtered =
    category === "All"
      ? markets
      : markets.filter(
          (m) => m.category.toLowerCase() === category.toLowerCase()
        );

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Market Hall</h1>
          <p className="mt-1 text-gray-400">
            Trade on your judgment in prediction markets powered by triple signal
            fusion.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          {/* Category Tabs */}
          <div className="flex gap-1 rounded-lg border border-gray-800 bg-gray-900/50 p-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  category === cat
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Sort:</span>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSort(opt.value)}
                className={`text-sm transition ${
                  sort === opt.value
                    ? "font-medium text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}

        {/* Market Grid */}
        {!loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((market) => {
              const topOutcome = market.outcomes[0];
              const pct = topOutcome
                ? Math.round(topOutcome.probability * 100)
                : 0;

              return (
                <Link
                  key={market.id}
                  href={`/exchange/${market.id}`}
                  className="group rounded-xl border border-gray-800 bg-gray-900/50 p-5 transition hover:border-gray-600 hover:bg-gray-900/80"
                >
                  {/* Category Badge */}
                  <div className="mb-3 flex items-start justify-between">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        CATEGORY_COLORS[market.category] ??
                        "bg-gray-700/50 text-gray-400"
                      }`}
                    >
                      {market.category}
                    </span>
                    <span className="text-xs text-gray-500">
                      {market.position_count.toLocaleString()} positions
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="mb-4 text-sm font-semibold leading-snug text-white group-hover:text-blue-400">
                    {market.title}
                  </h3>

                  {/* Top Outcome Probability */}
                  <div className="mb-4 text-center">
                    <div className="text-4xl font-bold text-blue-400">
                      {pct}%
                    </div>
                    <div className="text-xs text-gray-500">
                      {topOutcome?.name ?? "Yes"} probability
                    </div>
                  </div>

                  {/* Signal Mini Bars */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-10 text-[10px] text-blue-400">AI</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-800">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{
                            width: `${Math.round(market.signals.ai * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-10 text-[10px] text-green-400">
                        Crowd
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-800">
                        <div
                          className="h-full rounded-full bg-green-500"
                          style={{
                            width: `${Math.round(market.signals.crowd * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-10 text-[10px] text-purple-400">
                        Rep
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-800">
                        <div
                          className="h-full rounded-full bg-purple-500"
                          style={{
                            width: `${Math.round(market.signals.reputation * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-gray-500">
            <div className="mb-4 text-5xl">--</div>
            <p>No markets found in this category.</p>
          </div>
        )}
      </main>
    </div>
  );
}
