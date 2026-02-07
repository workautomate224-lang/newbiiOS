"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { CausalGraph } from "@/components/causal-graph/CausalGraph";
import { ProbabilityBar } from "@/components/ui/probability-bar";
import { ShareButton } from "@/components/ui/share-button";
import { getPredictionResult, rerunPrediction } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { useResultStore } from "@/stores/result-store";

function ConsensusIndicator({ level }: { level: string }) {
  const config: Record<string, { color: string; label: string }> = {
    high: { color: "bg-green-600 text-green-100", label: "High Consensus" },
    medium: { color: "bg-yellow-600 text-yellow-100", label: "Medium Consensus" },
    low: { color: "bg-red-600 text-red-100", label: "Low Consensus" },
  };
  const c = config[level] || config.medium;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${c.color}`}>
      {c.label}
    </span>
  );
}

function getConsensusLevel(breakdown?: Record<string, number>): string {
  if (!breakdown) return "medium";
  const values = Object.values(breakdown);
  if (values.length < 2) return "high";
  const max = Math.max(...values);
  const min = Math.min(...values);
  const spread = Math.abs(max - min);
  if (spread < 0.1) return "high";
  if (spread < 0.25) return "medium";
  return "low";
}

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { outcomes, causalGraph, variables, engines, isRerunning, setResult, setRerunning } =
    useResultStore();
  const supabase = createClient();

  useEffect(() => {
    if (!id) return;
    getPredictionResult(id)
      .then((data) => {
        setQuery(data.query);
        setResult({
          outcomes: data.outcomes,
          causalGraph: data.causal_graph,
          variables: data.variables,
          reasoning: data.reasoning,
          engines: data.engines || {},
        });
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id, setResult]);

  const handleVariableChange = useCallback(
    async (name: string, value: number) => {
      if (!id || isRerunning) return;
      setRerunning(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const result = await rerunPrediction(id, { [name]: value }, session.access_token);
        setResult({
          outcomes: result.outcomes,
          causalGraph: result.causal_graph,
          reasoning: result.reasoning,
          engines: result.engines || {},
        });
      } catch {
        // Silently handle rerun errors
      } finally {
        setRerunning(false);
      }
    },
    [id, isRerunning, setResult, setRerunning, supabase.auth]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <Header />
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <Header />
        <div className="mx-auto max-w-2xl px-4 py-12">
          <div className="rounded-lg border border-red-800 bg-red-900/20 p-6 text-red-400">
            <h2 className="mb-2 font-semibold">Error loading result</h2>
            <p>{error}</p>
            <button onClick={() => router.push("/lite")} className="mt-4 text-sm text-gray-400 hover:text-white">
              &larr; Back to Lite
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* Top bar */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{query}</h1>
            <p className="text-sm text-gray-500">Interactive Causal Analysis</p>
          </div>
          <div className="flex items-center gap-3">
            <ShareButton predictionId={id} />
            <Link
              href={`/lite/${id}/agents`}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-purple-500 hover:text-white"
            >
              Agent Simulation
            </Link>
            <Link
              href={`/lite/${id}/reasoning`}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-blue-500 hover:text-white"
            >
              View Reasoning
            </Link>
          </div>
        </div>

        {/* Main grid: Graph + Side panel */}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Causal Graph */}
          <div>
            <CausalGraph
              nodes={causalGraph.nodes as Array<{ id: string; label: string; probability: number; confidence: number; category: string }>}
              edges={causalGraph.edges as Array<{ source: string; target: string; weight: number; type: string; description: string }>}
              height={500}
            />
          </div>

          {/* Side Panel */}
          <div className="space-y-6">
            {/* Probabilities */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <h2 className="mb-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">Outcomes</h2>
              <div className="space-y-4">
                {outcomes.map((o, i) => (
                  <div key={i}>
                    <ProbabilityBar
                      label={o.name}
                      probability={o.probability}
                      confidence={o.confidence_interval}
                      color={i === 0 ? "bg-blue-500" : i === 1 ? "bg-yellow-500" : "bg-gray-500"}
                    />
                    {/* Engine Breakdown */}
                    {o.engine_breakdown && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <p className="text-xs text-gray-500">
                          GoT {Math.round((o.engine_breakdown.got ?? 0) * 100)}%
                          {" · "}MCTS {Math.round((o.engine_breakdown.mcts ?? 0) * 100)}%
                          {" · "}Debate {Math.round((o.engine_breakdown.debate ?? 0) * 100)}%
                        </p>
                        <ConsensusIndicator level={getConsensusLevel(o.engine_breakdown)} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Engine Summary */}
            {engines && Object.keys(engines).length > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
                <h2 className="mb-3 text-sm font-semibold text-gray-400 uppercase tracking-wider">Engine Status</h2>
                <div className="space-y-2 text-sm">
                  {engines.got && (
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      <span className="text-gray-300">GoT - Graph of Thought</span>
                    </div>
                  )}
                  {engines.mcts && (
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      <span className="text-gray-300">MCTS - Path Search</span>
                    </div>
                  )}
                  {engines.debate && (
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-purple-500" />
                      <span className="text-gray-300">Multi-Role Debate</span>
                    </div>
                  )}
                  {engines.ensemble && (
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      <span className="text-gray-300">Ensemble Final</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Variable Sliders */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <h2 className="mb-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Variables {isRerunning && <span className="text-blue-400">(updating...)</span>}
              </h2>
              <div className="space-y-4">
                {variables.map((v) => (
                  <div key={v.name}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-gray-300">{v.name}</span>
                      <span className="font-mono text-xs text-gray-500">{v.current}</span>
                    </div>
                    <input
                      type="range"
                      min={v.range[0]}
                      max={v.range[1]}
                      step={(v.range[1] - v.range[0]) / 100}
                      defaultValue={v.current}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        // Debounce
                        const timer = setTimeout(() => handleVariableChange(v.name, val), 500);
                        return () => clearTimeout(timer);
                      }}
                      className="w-full accent-blue-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
