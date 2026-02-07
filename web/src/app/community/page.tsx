"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { getExplore } from "@/lib/api";

interface PredictionCard {
  id: string;
  query: string;
  probability: number;
  category: string;
  view_count: number;
  created_at: string;
}

const CATEGORIES = ["All", "Politics", "Economics", "Tech"];

const CATEGORY_COLORS: Record<string, string> = {
  Politics: "bg-red-900/50 text-red-400 border-red-800",
  Economics: "bg-green-900/50 text-green-400 border-green-800",
  Tech: "bg-blue-900/50 text-blue-400 border-blue-800",
  Other: "bg-gray-800/50 text-gray-400 border-gray-700",
};

const MOCK_PREDICTIONS: PredictionCard[] = [
  {
    id: "mock-1",
    query: "Will AI regulation pass in the EU by 2026?",
    probability: 0.72,
    category: "Politics",
    view_count: 1243,
    created_at: "2025-12-15T10:00:00Z",
  },
  {
    id: "mock-2",
    query: "Will Bitcoin exceed $150K in 2026?",
    probability: 0.34,
    category: "Economics",
    view_count: 892,
    created_at: "2025-12-20T14:00:00Z",
  },
  {
    id: "mock-3",
    query: "Will GPT-5 be released before July 2026?",
    probability: 0.61,
    category: "Tech",
    view_count: 2105,
    created_at: "2026-01-05T09:00:00Z",
  },
  {
    id: "mock-4",
    query: "Will US unemployment rise above 5% in 2026?",
    probability: 0.28,
    category: "Economics",
    view_count: 567,
    created_at: "2026-01-10T16:00:00Z",
  },
  {
    id: "mock-5",
    query: "Will a new social media platform overtake X/Twitter?",
    probability: 0.19,
    category: "Tech",
    view_count: 734,
    created_at: "2026-01-12T11:00:00Z",
  },
  {
    id: "mock-6",
    query: "Will there be a US government shutdown in 2026?",
    probability: 0.45,
    category: "Politics",
    view_count: 1501,
    created_at: "2026-01-14T08:00:00Z",
  },
  {
    id: "mock-7",
    query: "Will quantum computing achieve commercial viability by 2027?",
    probability: 0.22,
    category: "Tech",
    view_count: 432,
    created_at: "2026-01-18T13:00:00Z",
  },
  {
    id: "mock-8",
    query: "Will the Federal Reserve cut rates again in Q1 2026?",
    probability: 0.58,
    category: "Economics",
    view_count: 988,
    created_at: "2026-01-20T15:00:00Z",
  },
];

type SortKey = "latest" | "popular";

export default function CommunityPage() {
  const [predictions, setPredictions] = useState<PredictionCard[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [sort, setSort] = useState<SortKey>("latest");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params: { category?: string; sort?: string } = {};
    if (activeCategory !== "All") params.category = activeCategory.toLowerCase();
    params.sort = sort;

    getExplore(params)
      .then((data) => {
        if (data.predictions && Array.isArray(data.predictions) && data.predictions.length > 0) {
          setPredictions(data.predictions);
        } else {
          setPredictions(MOCK_PREDICTIONS);
        }
        setLoading(false);
      })
      .catch(() => {
        setPredictions(MOCK_PREDICTIONS);
        setLoading(false);
      });
  }, [activeCategory, sort]);

  const filtered =
    activeCategory === "All"
      ? predictions
      : predictions.filter((p) => p.category === activeCategory);

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "popular") return b.view_count - a.view_count;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Community Predictions</h1>
          <p className="mt-1 text-gray-400">Explore public predictions from the FutureOS community</p>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Category tabs */}
          <div className="flex gap-1 rounded-lg bg-gray-900 p-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                  activeCategory === cat
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="flex gap-2">
            <button
              onClick={() => setSort("latest")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                sort === "latest"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              Latest
            </button>
            <button
              onClick={() => setSort("popular")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                sort === "popular"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              Popular
            </button>
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-12 text-center">
            <p className="text-gray-500">No predictions found in this category</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((pred) => {
              const pct = Math.round(pred.probability * 100);
              const catColor =
                CATEGORY_COLORS[pred.category] || CATEGORY_COLORS.Other;
              return (
                <Link
                  key={pred.id}
                  href={`/share/${pred.id}`}
                  className="group rounded-xl border border-gray-800 bg-gray-900/50 p-5 transition hover:border-gray-700 hover:bg-gray-900/80"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <h3 className="text-sm font-medium leading-tight text-gray-200 group-hover:text-white">
                      {pred.query}
                    </h3>
                    <span className="shrink-0 text-lg font-bold text-blue-400">{pct}%</span>
                  </div>

                  <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-gray-800">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${catColor}`}
                    >
                      {pred.category}
                    </span>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                      {pred.view_count.toLocaleString()}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
