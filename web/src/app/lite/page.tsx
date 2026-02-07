"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { createClient } from "@/lib/supabase/client";
import { createPrediction, getTrending } from "@/lib/api";
import { ProbabilityBar } from "@/components/ui/probability-bar";

const SUGGESTED = [
  "2026 Malaysian General Election — who wins?",
  "Will AI replace 30% of white-collar jobs by 2030?",
  "Bitcoin price above $200K by end of 2026?",
  "Will Southeast Asia GDP growth exceed 5% in 2027?",
];

export default function LitePage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [trending, setTrending] = useState<Array<Record<string, unknown>>>([]);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    getTrending().then(setTrending).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || query.length < 3) return;

    setLoading(true);
    setError("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth/login");
        return;
      }
      const result = await createPrediction(query, session.access_token);
      router.push(`/lite/${result.id}/progress`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create prediction");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />

      <main className="mx-auto max-w-4xl px-4 py-12">
        {/* Hero Search */}
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold">Explore Any Question About the Future</h1>
          <p className="mb-8 text-gray-400">
            Ask a prediction question and our AI engine will simulate, reason, and generate an interactive causal map.
          </p>

          <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What do you want to predict?"
              className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || query.length < 3}
              className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Predict"}
            </button>
          </form>

          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

          {/* Suggested Queries */}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {SUGGESTED.map((s) => (
              <button
                key={s}
                onClick={() => setQuery(s)}
                className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-400 transition hover:border-blue-500 hover:text-blue-400"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Trending */}
        <section>
          <h2 className="mb-4 text-xl font-semibold">Trending Predictions</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trending.map((p) => (
              <div
                key={p.id as string}
                className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 transition hover:border-gray-600"
              >
                <span className="mb-2 inline-block rounded-full bg-blue-900/50 px-2 py-0.5 text-xs text-blue-400">
                  {p.category as string}
                </span>
                <h3 className="mb-3 text-sm font-medium">{p.query as string}</h3>
                <ProbabilityBar label="Likelihood" probability={p.probability as number} />
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
