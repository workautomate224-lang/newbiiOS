"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { searchAll } from "@/lib/api";

interface SearchResult {
  id: string;
  title: string;
  type: "prediction" | "market" | "user";
  subtitle?: string;
  href: string;
}

const MOCK_RESULTS: SearchResult[] = [
  {
    id: "p1",
    title: "Will AI regulation pass in the US by 2027?",
    type: "prediction",
    subtitle: "Created Jan 15, 2026 -- 72% probability",
    href: "/lite/p1/result",
  },
  {
    id: "p2",
    title: "Bitcoin exceeds $200K by end of 2026?",
    type: "prediction",
    subtitle: "Created Jan 20, 2026 -- 34% probability",
    href: "/lite/p2/result",
  },
  {
    id: "m1",
    title: "AI Regulation Market",
    type: "market",
    subtitle: "1,247 positions -- 62% Yes",
    href: "/exchange/demo-1",
  },
  {
    id: "m2",
    title: "Bitcoin Price Market",
    type: "market",
    subtitle: "3,891 positions -- 34% Yes",
    href: "/exchange/demo-2",
  },
  {
    id: "u1",
    title: "Alex Chen",
    type: "user",
    subtitle: "Rank #3 -- 89% accuracy",
    href: "/leaderboard",
  },
  {
    id: "u2",
    title: "Maya Patel",
    type: "user",
    subtitle: "Rank #7 -- 84% accuracy",
    href: "/leaderboard",
  },
];

const TYPE_LABELS: Record<string, string> = {
  prediction: "Predictions",
  market: "Markets",
  user: "Users",
};

const TYPE_COLORS: Record<string, string> = {
  prediction: "bg-blue-900/50 text-blue-400",
  market: "bg-amber-900/50 text-amber-400",
  user: "bg-green-900/50 text-green-400",
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const performSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const data = await searchAll(q);
      if (Array.isArray(data) && data.length > 0) {
        setResults(data);
      } else {
        // Use filtered mock results
        const lower = q.toLowerCase();
        const filtered = MOCK_RESULTS.filter(
          (r) =>
            r.title.toLowerCase().includes(lower) ||
            r.subtitle?.toLowerCase().includes(lower)
        );
        setResults(filtered.length > 0 ? filtered : MOCK_RESULTS);
      }
    } catch {
      // Fallback to filtered mock results
      const lower = q.toLowerCase();
      const filtered = MOCK_RESULTS.filter(
        (r) =>
          r.title.toLowerCase().includes(lower) ||
          r.subtitle?.toLowerCase().includes(lower)
      );
      setResults(filtered.length > 0 ? filtered : MOCK_RESULTS);
    }
    setLoading(false);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    performSearch(query);
  }

  const predictions = results.filter((r) => r.type === "prediction");
  const markets = results.filter((r) => r.type === "market");
  const users = results.filter((r) => r.type === "user");

  const sections = [
    { key: "prediction", items: predictions },
    { key: "market", items: markets },
    { key: "user", items: users },
  ].filter((s) => s.items.length > 0);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />

      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* Search Input */}
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search predictions, markets, users..."
              className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "..." : "Search"}
            </button>
          </div>
        </form>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}

        {/* Results */}
        {!loading && searched && sections.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            <p className="text-lg">No results found for &quot;{query}&quot;</p>
            <p className="mt-1 text-sm">Try a different search term.</p>
          </div>
        )}

        {!loading &&
          sections.map((section) => (
            <div key={section.key} className="mb-8">
              <h2 className="mb-3 text-lg font-semibold text-gray-300">
                {TYPE_LABELS[section.key]}
              </h2>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900/50 p-4 transition hover:border-gray-600 hover:bg-gray-900/80"
                  >
                    <div>
                      <h3 className="text-sm font-medium text-white">
                        {item.title}
                      </h3>
                      {item.subtitle && (
                        <p className="mt-0.5 text-xs text-gray-400">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        TYPE_COLORS[item.type] ?? "bg-gray-700/50 text-gray-400"
                      }`}
                    >
                      {item.type}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}

        {/* Empty State */}
        {!searched && !loading && (
          <div className="py-12 text-center text-gray-500">
            <p className="text-lg">Search across FutureOS</p>
            <p className="mt-1 text-sm">
              Find predictions, markets, and users.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
