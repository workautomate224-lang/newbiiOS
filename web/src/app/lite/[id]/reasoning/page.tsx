"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { getPredictionResult } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";

interface ShapFactor {
  name: string;
  impact: number;
  direction: string;
}

interface Dimension {
  name: string;
  analysis: string;
  impact: Record<string, number>;
}

interface DebateMessage {
  role: string;
  content: string;
  round: number;
}

interface DebateRound {
  round: number;
  messages: DebateMessage[];
}

interface MCTSPath {
  description: string;
  visits: number;
  avg_value: number;
}

interface MCTSData {
  top_paths: MCTSPath[];
  total_nodes: number;
  iterations: number;
  max_depth: number;
}

interface DebateData {
  rounds: DebateRound[];
  judge_verdict?: string;
}

interface EngineOutcome {
  name: string;
  got: number;
  mcts: number;
  debate: number;
  final: number;
}

type TabKey = "factors" | "reasoning" | "debate" | "mcts" | "compare";

const ROLE_COLORS: Record<string, { border: string; bg: string; text: string; label: string }> = {
  optimist: { border: "border-green-700", bg: "bg-green-900/30", text: "text-green-400", label: "Optimist" },
  pessimist: { border: "border-red-700", bg: "bg-red-900/30", text: "text-red-400", label: "Pessimist" },
  contrarian: { border: "border-purple-700", bg: "bg-purple-900/30", text: "text-purple-400", label: "Contrarian" },
  historian: { border: "border-amber-700", bg: "bg-amber-900/30", text: "text-amber-400", label: "Historian" },
  judge: { border: "border-blue-700", bg: "bg-blue-900/30", text: "text-blue-400", label: "Judge" },
};

const ENGINE_COLORS = {
  got: "#3b82f6",
  mcts: "#22c55e",
  debate: "#a855f7",
  final: "#f59e0b",
};

export default function ReasoningPage() {
  const { id } = useParams<{ id: string }>();
  const [shapFactors, setShapFactors] = useState<ShapFactor[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [explanation, setExplanation] = useState("");
  const [debateData, setDebateData] = useState<DebateData | null>(null);
  const [mctsData, setMctsData] = useState<MCTSData | null>(null);
  const [engineOutcomes, setEngineOutcomes] = useState<EngineOutcome[]>([]);
  const [engineWeights, setEngineWeights] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<TabKey>("factors");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getPredictionResult(id)
      .then((data) => {
        setShapFactors(data.reasoning?.shap_factors || []);
        setDimensions(data.reasoning?.got_tree || []);
        setExplanation(data.reasoning?.explanation_text || "");

        // Extract debate data from engines
        const engines = data.engines || {};
        if (engines.debate) {
          setDebateData(engines.debate as unknown as DebateData);
        }
        if (engines.mcts) {
          setMctsData(engines.mcts as unknown as MCTSData);
        }

        // Build engine comparison data from outcomes
        if (data.outcomes) {
          const compareData: EngineOutcome[] = data.outcomes.map(
            (o: { name: string; probability: number; engine_breakdown?: Record<string, number> }) => ({
              name: o.name,
              got: (o.engine_breakdown?.got ?? o.probability) * 100,
              mcts: (o.engine_breakdown?.mcts ?? o.probability) * 100,
              debate: (o.engine_breakdown?.debate ?? o.probability) * 100,
              final: o.probability * 100,
            })
          );
          setEngineOutcomes(compareData);
        }

        if (engines.ensemble) {
          const ensemble = engines.ensemble as Record<string, unknown>;
          setEngineWeights((ensemble.weights as Record<string, number>) || { got: 0.4, mcts: 0.3, debate: 0.3 });
        }

        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const chartData = shapFactors
    .map((f) => ({
      name: f.name,
      impact: f.direction === "negative" ? -Math.abs(f.impact) : Math.abs(f.impact),
    }))
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  const tabs: { key: TabKey; label: string }[] = [
    { key: "factors", label: "Factors" },
    { key: "reasoning", label: "Reasoning" },
    { key: "debate", label: "Debate" },
    { key: "mcts", label: "MCTS" },
    { key: "compare", label: "Engine Compare" },
  ];

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

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link href={`/lite/${id}/result`} className="mb-6 inline-block text-sm text-gray-400 hover:text-white">
          &larr; Back to Causal Graph
        </Link>

        <h1 className="mb-6 text-2xl font-bold">Reasoning Analysis</h1>

        {/* Explanation */}
        {explanation && (
          <div className="mb-8 rounded-xl border border-gray-800 bg-gray-900/50 p-6">
            <p className="text-gray-300 leading-relaxed">{explanation}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg bg-gray-900 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
                activeTab === tab.key ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Factors Tab */}
        {activeTab === "factors" && (
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
            <h2 className="mb-4 font-semibold">Factor Attribution</h2>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" domain={[-0.5, 0.5]} tick={{ fill: "#9ca3af", fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#d1d5db", fontSize: 12 }} width={100} />
                  <Tooltip
                    contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Bar dataKey="impact" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={index} fill={entry.impact >= 0 ? "#22c55e" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500">No factor data available</p>
            )}
          </div>
        )}

        {/* Reasoning Tab */}
        {activeTab === "reasoning" && (
          <div className="space-y-4">
            {dimensions.length > 0 ? (
              dimensions.map((dim, i) => (
                <details key={i} className="rounded-xl border border-gray-800 bg-gray-900/50">
                  <summary className="cursor-pointer p-4 font-medium text-gray-200 hover:text-white">
                    {dim.name}
                  </summary>
                  <div className="border-t border-gray-800 p-4">
                    <p className="text-sm text-gray-400">{dim.analysis}</p>
                  </div>
                </details>
              ))
            ) : (
              <p className="text-gray-500">No reasoning dimensions available</p>
            )}
          </div>
        )}

        {/* Debate Tab */}
        {activeTab === "debate" && (
          <div className="space-y-6">
            {debateData && debateData.rounds && debateData.rounds.length > 0 ? (
              <>
                {debateData.rounds.map((round) => (
                  <div key={round.round}>
                    <h3 className="mb-3 text-sm font-semibold text-gray-400 uppercase tracking-wider">
                      Round {round.round}
                    </h3>
                    <div className="space-y-3">
                      {round.messages.map((msg, mi) => {
                        const roleConfig = ROLE_COLORS[msg.role] || ROLE_COLORS.judge;
                        return (
                          <div
                            key={mi}
                            className={`rounded-lg border ${roleConfig.border} ${roleConfig.bg} p-4`}
                          >
                            <div className="mb-2 flex items-center gap-2">
                              <span className={`text-xs font-bold uppercase tracking-wide ${roleConfig.text}`}>
                                {roleConfig.label}
                              </span>
                            </div>
                            <p className="text-sm text-gray-300 leading-relaxed">{msg.content}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Judge Verdict */}
                {debateData.judge_verdict && (
                  <div className="rounded-lg border-2 border-blue-600 bg-blue-900/20 p-5">
                    <h3 className="mb-2 flex items-center gap-2 font-semibold text-blue-400">
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Judge Verdict
                    </h3>
                    <p className="text-sm text-gray-300 leading-relaxed">{debateData.judge_verdict}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
                <p className="text-gray-500">No debate data available. Debate analysis runs as part of deep reasoning.</p>
              </div>
            )}
          </div>
        )}

        {/* MCTS Tab */}
        {activeTab === "mcts" && (
          <div className="space-y-6">
            {mctsData ? (
              <>
                {/* MCTS Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-center">
                    <p className="text-2xl font-bold text-blue-400">{mctsData.total_nodes}</p>
                    <p className="text-xs text-gray-500">Total Nodes</p>
                  </div>
                  <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-center">
                    <p className="text-2xl font-bold text-green-400">{mctsData.iterations}</p>
                    <p className="text-xs text-gray-500">Iterations</p>
                  </div>
                  <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-center">
                    <p className="text-2xl font-bold text-purple-400">{mctsData.max_depth}</p>
                    <p className="text-xs text-gray-500">Max Depth</p>
                  </div>
                </div>

                {/* Top Paths */}
                <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
                  <h2 className="mb-4 font-semibold">Top Exploration Paths</h2>
                  <div className="space-y-4">
                    {mctsData.top_paths.slice(0, 5).map((path, i) => (
                      <div key={i} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-gray-200">
                            {i + 1}. {path.description}
                          </span>
                          <span className="text-xs text-gray-500">{path.visits} visits</span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-green-600 to-green-400 transition-all duration-500"
                            style={{ width: `${Math.round(path.avg_value * 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500">
                          Avg value: {(path.avg_value * 100).toFixed(1)}%
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
                <p className="text-gray-500">No MCTS data available. MCTS path search runs as part of deep reasoning.</p>
              </div>
            )}
          </div>
        )}

        {/* Engine Compare Tab */}
        {activeTab === "compare" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
              <h2 className="mb-4 font-semibold">Engine Probability Comparison</h2>
              {engineOutcomes.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={engineOutcomes} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="name" tick={{ fill: "#d1d5db", fontSize: 12 }} />
                      <YAxis
                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                        domain={[0, 100]}
                        tickFormatter={(v: number) => `${v}%`}
                      />
                      <Tooltip
                        contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
                        labelStyle={{ color: "#fff" }}
                        formatter={(value) => [`${Number(value).toFixed(1)}%`]}
                      />
                      <Legend />
                      <Bar dataKey="got" name="GoT" fill={ENGINE_COLORS.got} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="mcts" name="MCTS" fill={ENGINE_COLORS.mcts} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="debate" name="Debate" fill={ENGINE_COLORS.debate} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="final" name="Final" fill={ENGINE_COLORS.final} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Weight Legend */}
                  <div className="mt-4 rounded-lg border border-gray-800 bg-gray-900/80 p-4">
                    <h3 className="mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Ensemble Weights
                    </h3>
                    <div className="flex gap-6">
                      {Object.entries(engineWeights).map(([engine, weight]) => (
                        <div key={engine} className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: ENGINE_COLORS[engine as keyof typeof ENGINE_COLORS] || "#6b7280" }}
                          />
                          <span className="text-sm text-gray-300">
                            {engine.toUpperCase()}: {(weight * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-gray-500">No engine comparison data available</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
