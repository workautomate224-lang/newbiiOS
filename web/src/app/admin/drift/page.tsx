"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { createClient } from "@/lib/supabase/client";
import { getDriftEvents, getDriftStats, runDriftScan, getEdgeWeights } from "@/lib/api";

interface DriftStat {
  label: string;
  value: number | string;
  color: string;
}

interface DriftEvent {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  details: string;
  auto_action?: string;
  created_at: string;
}

interface EdgeWeight {
  source: string;
  target: string;
  original_weight: number;
  current_weight: number;
}

const DEMO_STATS: DriftStat[] = [
  { label: "Total Events", value: 142, color: "text-white" },
  { label: "Data Expiry", value: 8, color: "text-yellow-400" },
  { label: "Causal Decay", value: 23, color: "text-orange-400" },
  { label: "Calibration Drift", value: 5, color: "text-red-400" },
  { label: "Signal Divergence", value: 12, color: "text-purple-400" },
  { label: "Unresolved", value: 17, color: "text-amber-400" },
];

const DEMO_EVENTS: DriftEvent[] = [
  {
    id: "evt-1",
    type: "Causal Decay",
    severity: "critical",
    details:
      "Edge 'Fed Policy -> Inflation' weight decayed from 0.85 to 0.22. Below minimum threshold. Automatic recalibration triggered.",
    auto_action: "Recalibration scheduled",
    created_at: "2026-02-07T10:30:00Z",
  },
  {
    id: "evt-2",
    type: "Signal Divergence",
    severity: "warning",
    details:
      "AI signal (0.72) diverges from Crowd signal (0.45) for market 'Bitcoin $200K' by 27pp. Manual review recommended.",
    auto_action: "Flagged for review",
    created_at: "2026-02-07T09:15:00Z",
  },
  {
    id: "evt-3",
    type: "Data Expiry",
    severity: "warning",
    details:
      "Data source 'World Bank GDP 2024' last updated 180 days ago. Freshness score below threshold.",
    auto_action: "Refresh queued",
    created_at: "2026-02-06T22:00:00Z",
  },
  {
    id: "evt-4",
    type: "Calibration Drift",
    severity: "info",
    details:
      "Model calibration score drifted from 0.92 to 0.88 over past 7 days. Within acceptable range but trending down.",
    created_at: "2026-02-06T18:45:00Z",
  },
  {
    id: "evt-5",
    type: "Data Expiry",
    severity: "info",
    details:
      "Data source 'Reuters Feed' refreshed successfully. Freshness score restored to 0.99.",
    created_at: "2026-02-06T14:00:00Z",
  },
];

const DEMO_EDGES: EdgeWeight[] = [
  { source: "Fed Policy", target: "Inflation", original_weight: 0.85, current_weight: 0.22 },
  { source: "Oil Price", target: "CPI", original_weight: 0.78, current_weight: 0.71 },
  { source: "GDP Growth", target: "Employment", original_weight: 0.82, current_weight: 0.79 },
  { source: "Tech Regulation", target: "AI Adoption", original_weight: 0.65, current_weight: 0.58 },
  { source: "Interest Rate", target: "Housing", original_weight: 0.91, current_weight: 0.45 },
  { source: "Sentiment", target: "Market Vol.", original_weight: 0.73, current_weight: 0.69 },
  { source: "Elections", target: "Policy Change", original_weight: 0.88, current_weight: 0.84 },
];

const SEVERITY_STYLES: Record<string, string> = {
  info: "bg-blue-900/50 text-blue-400 border-blue-800",
  warning: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
  critical: "bg-red-900/50 text-red-400 border-red-800",
};

export default function DriftDashboardPage() {
  const [stats, setStats] = useState<DriftStat[]>([]);
  const [events, setEvents] = useState<DriftEvent[]>([]);
  const [edges, setEdges] = useState<EdgeWeight[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const [statsRes, eventsRes, edgesRes] = await Promise.allSettled([
        getDriftStats(),
        getDriftEvents(),
        getEdgeWeights(),
      ]);

      if (statsRes.status === "fulfilled" && Array.isArray(statsRes.value)) {
        setStats(statsRes.value);
      } else {
        setStats(DEMO_STATS);
      }

      if (eventsRes.status === "fulfilled" && Array.isArray(eventsRes.value)) {
        setEvents(eventsRes.value);
      } else {
        setEvents(DEMO_EVENTS);
      }

      if (edgesRes.status === "fulfilled" && Array.isArray(edgesRes.value)) {
        setEdges(edgesRes.value);
      } else {
        setEdges(DEMO_EDGES);
      }

      setLoading(false);
    }
    load();
  }, []);

  async function handleScan() {
    setScanning(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        await runDriftScan(session.access_token);
      }
    } catch {
      // Scan may fail in demo mode
    }
    setScanning(false);
  }

  function decayColor(current: number): string {
    if (current >= 0.7) return "bg-green-500";
    if (current >= 0.3) return "bg-yellow-500";
    return "bg-red-500";
  }

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

      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* Title + Scan */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Drift Dashboard</h1>
            <p className="mt-1 text-gray-400">
              Monitor causal decay, signal divergence, and data staleness.
            </p>
          </div>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {scanning ? "Scanning..." : "Run Scan"}
          </button>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-center"
            >
              <p className="text-xs text-gray-400">{stat.label}</p>
              <p className={`mt-1 text-2xl font-bold ${stat.color}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Events Timeline */}
        <div className="mb-8">
          <h2 className="mb-4 text-xl font-semibold">Events Timeline</h2>
          <div className="space-y-3">
            {events.map((evt) => (
              <div
                key={evt.id}
                className="rounded-xl border border-gray-800 bg-gray-900/50 p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {/* Severity Badge */}
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                        SEVERITY_STYLES[evt.severity] ??
                        "bg-gray-700/50 text-gray-400 border-gray-700"
                      }`}
                    >
                      {evt.severity}
                    </span>
                    <span className="text-sm font-medium text-white">
                      {evt.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      {new Date(evt.created_at).toLocaleString()}
                    </span>
                    <button
                      onClick={() =>
                        setExpandedEvent(
                          expandedEvent === evt.id ? null : evt.id
                        )
                      }
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      {expandedEvent === evt.id ? "Collapse" : "Details"}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedEvent === evt.id && (
                  <div className="mt-3 space-y-2 border-t border-gray-800 pt-3">
                    <p className="text-sm text-gray-300">{evt.details}</p>
                    {evt.auto_action && (
                      <p className="text-xs text-gray-500">
                        Auto action:{" "}
                        <span className="text-amber-400">
                          {evt.auto_action}
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Edge Weights Heatmap */}
        <div className="mb-8">
          <h2 className="mb-4 text-xl font-semibold">Causal Edge Weights</h2>
          <div className="overflow-hidden rounded-xl border border-gray-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-800 bg-gray-900/80">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-400">
                    Source
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-400">
                    Target
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-400 text-right">
                    Original
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-400 text-right">
                    Current
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-400">
                    Decay
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {edges.map((edge, i) => (
                  <tr
                    key={i}
                    className="transition hover:bg-gray-900/50"
                  >
                    <td className="px-4 py-3 text-white">{edge.source}</td>
                    <td className="px-4 py-3 text-gray-300">
                      <span className="text-gray-500 mr-1">&rarr;</span>
                      {edge.target}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {edge.original_weight.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-white font-mono">
                      {edge.current_weight.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-800">
                          <div
                            className={`h-full rounded-full transition-all ${decayColor(edge.current_weight)}`}
                            style={{
                              width: `${Math.round(edge.current_weight * 100)}%`,
                            }}
                          />
                        </div>
                        <span
                          className={`text-xs ${
                            edge.current_weight >= 0.7
                              ? "text-green-400"
                              : edge.current_weight >= 0.3
                                ? "text-yellow-400"
                                : "text-red-400"
                          }`}
                        >
                          {Math.round(
                            (edge.current_weight / edge.original_weight) * 100
                          )}
                          %
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Calibration Trend Placeholder */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
          <h2 className="mb-4 text-xl font-semibold">Calibration Trend</h2>
          <div className="flex items-center justify-center py-12 text-gray-500">
            <div className="text-center">
              <div className="mb-2 text-4xl">---</div>
              <p className="text-sm">
                Calibration trend visualization will be available once sufficient
                historical data is collected.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
