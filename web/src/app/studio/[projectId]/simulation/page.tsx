"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getPopulations,
  getScenarios,
  startSimulation,
  getSimulation,
  createBranch,
  compareBranches,
} from "@/lib/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface PopulationOption {
  id: string;
  name: string;
}

interface ScenarioOption {
  id: string;
  name: string;
}

interface StanceTick {
  tick: number;
  [stance: string]: number;
}

interface SimulationResult {
  id: string;
  status: string;
  timeline: StanceTick[];
  final_distribution: Record<string, number>;
  runtime_ms?: number;
  convergence_tick?: number;
  branches?: BranchResult[];
}

interface BranchResult {
  id: string;
  name: string;
  timeline: StanceTick[];
  final_distribution: Record<string, number>;
}

interface ComparisonData {
  tick: number;
  baseline: number;
  branch: number;
}

const STANCE_COLORS: Record<string, string> = {
  support: "#22c55e",
  oppose: "#ef4444",
  neutral: "#6b7280",
  undecided: "#f59e0b",
};

const PIE_COLORS = ["#22c55e", "#ef4444", "#6b7280", "#f59e0b", "#3b82f6", "#a855f7"];

export default function SimulationPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const supabase = createClient();

  const [populations, setPopulations] = useState<PopulationOption[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Config
  const [selectedPop, setSelectedPop] = useState("");
  const [selectedScenario, setSelectedScenario] = useState("");
  const [tickCount, setTickCount] = useState(30);
  const [running, setRunning] = useState(false);

  // Results
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);

  // Branch
  const [showBranchDialog, setShowBranchDialog] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [branchOverrides, setBranchOverrides] = useState("{}");
  const [creatingBranch, setCreatingBranch] = useState(false);

  // Comparison
  const [comparisonData, setComparisonData] = useState<ComparisonData[]>([]);
  const [comparing, setComparing] = useState(false);

  const loadOptions = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !projectId) return;
    try {
      const [pops, scens] = await Promise.all([
        getPopulations(projectId, session.access_token),
        getScenarios(projectId, session.access_token),
      ]);
      const popList: PopulationOption[] = Array.isArray(pops) ? pops : pops.populations ?? [];
      const scenList: ScenarioOption[] = Array.isArray(scens) ? scens : scens.scenarios ?? [];
      setPopulations(popList);
      setScenarios(scenList);
      if (popList.length > 0) setSelectedPop(popList[0].id);
      if (scenList.length > 0) setSelectedScenario(scenList[0].id);
    } catch {
      // API may not be ready
    }
    setLoading(false);
  }, [projectId, supabase.auth]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  async function handleStart() {
    if (!selectedPop || !selectedScenario) return;
    setRunning(true);
    setSimulation(null);
    setComparisonData([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !projectId) return;
      const result = await startSimulation(
        projectId,
        { population_id: selectedPop, scenario_id: selectedScenario, tick_count: tickCount },
        session.access_token
      );
      // Poll if needed
      if (result.status === "running" || result.status === "pending") {
        await pollSimulation(result.id, session.access_token);
      } else {
        setSimulation(result);
      }
    } catch {
      // Handle silently
    } finally {
      setRunning(false);
    }
  }

  async function pollSimulation(id: string, token: string) {
    let attempts = 0;
    while (attempts < 60) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const result = await getSimulation(id, token);
        if (result.status === "completed" || result.status === "failed") {
          setSimulation(result);
          return;
        }
      } catch {
        break;
      }
      attempts++;
    }
  }

  async function handleCreateBranch() {
    if (!simulation || !branchName.trim()) return;
    setCreatingBranch(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      let overrides: Record<string, unknown> = {};
      try {
        overrides = JSON.parse(branchOverrides);
      } catch {
        // Use empty overrides
      }
      const result = await createBranch(
        simulation.id,
        { name: branchName.trim(), variable_overrides: overrides },
        session.access_token
      );
      // Re-fetch simulation to get updated branches
      const updated = await getSimulation(simulation.id, session.access_token);
      setSimulation({ ...simulation, ...updated, branches: [...(simulation.branches ?? []), result] });
      setShowBranchDialog(false);
      setBranchName("");
      setBranchOverrides("{}");
    } catch {
      // Handle silently
    } finally {
      setCreatingBranch(false);
    }
  }

  async function handleCompare() {
    if (!simulation) return;
    setComparing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const result = await compareBranches(simulation.id, session.access_token);
      const data: ComparisonData[] = Array.isArray(result) ? result : result.comparison ?? [];
      setComparisonData(data);
    } catch {
      // If no API, build comparison locally from branches
      if (simulation.timeline && simulation.branches && simulation.branches.length > 0) {
        const branch = simulation.branches[0];
        const data: ComparisonData[] = simulation.timeline.map((t, i) => ({
          tick: t.tick,
          baseline: t.support ?? 0,
          branch: branch.timeline?.[i]?.support ?? 0,
        }));
        setComparisonData(data);
      }
    } finally {
      setComparing(false);
    }
  }

  // Derive stance keys from timeline
  const stanceKeys =
    simulation?.timeline && simulation.timeline.length > 0
      ? Object.keys(simulation.timeline[0]).filter((k) => k !== "tick")
      : [];

  // Build pie data from final distribution
  const pieData = simulation?.final_distribution
    ? Object.entries(simulation.final_distribution).map(([name, value]) => ({ name, value }))
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Simulation Console</h2>
        <p className="text-sm text-gray-500">Run and analyze agent-based simulations</p>
      </div>

      {/* Config Panel */}
      <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900/50 p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">Configuration</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm text-gray-400">Population Model</label>
            <select
              value={selectedPop}
              onChange={(e) => setSelectedPop(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select population...</option>
              {populations.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-400">Scenario</label>
            <select
              value={selectedScenario}
              onChange={(e) => setSelectedScenario(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select scenario...</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-400">
              Ticks: {tickCount}
            </label>
            <input
              type="range"
              min={10}
              max={100}
              step={1}
              value={tickCount}
              onChange={(e) => setTickCount(parseInt(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-600">
              <span>10</span>
              <span>100</span>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={handleStart}
            disabled={!selectedPop || !selectedScenario || running}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {running ? "Running Simulation..." : "Start Simulation"}
          </button>
        </div>
      </div>

      {/* Running Indicator */}
      {running && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-blue-800 bg-blue-900/20 p-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-sm text-blue-300">Simulation is running. This may take a few moments...</p>
        </div>
      )}

      {/* Results Dashboard */}
      {simulation && (
        <div className="space-y-6">
          {/* Status Bar */}
          <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900/50 p-4">
            <div className="flex items-center gap-4">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  simulation.status === "completed"
                    ? "bg-green-900/50 text-green-400"
                    : simulation.status === "running"
                    ? "bg-blue-900/50 text-blue-400"
                    : "bg-red-900/50 text-red-400"
                }`}
              >
                {simulation.status}
              </span>
              {simulation.runtime_ms !== undefined && (
                <span className="text-sm text-gray-400">
                  Runtime: {(simulation.runtime_ms / 1000).toFixed(1)}s
                </span>
              )}
              {simulation.convergence_tick !== undefined && (
                <span className="text-sm text-gray-400">
                  Converged at tick {simulation.convergence_tick}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowBranchDialog(true)}
                className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
              >
                Create Branch
              </button>
              {simulation.branches && simulation.branches.length > 0 && (
                <button
                  onClick={handleCompare}
                  disabled={comparing}
                  className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-50"
                >
                  {comparing ? "Comparing..." : "Compare Branches"}
                </button>
              )}
            </div>
          </div>

          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Probability Curves */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Stance Probability Over Time
              </h3>
              {simulation.timeline && simulation.timeline.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={simulation.timeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="tick"
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      label={{ value: "Tick", position: "insideBottom", offset: -5, fill: "#6b7280" }}
                    />
                    <YAxis
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      domain={[0, 1]}
                      label={{ value: "Probability", angle: -90, position: "insideLeft", fill: "#6b7280" }}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                      labelStyle={{ color: "#fff" }}
                    />
                    <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
                    {stanceKeys.map((key) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={STANCE_COLORS[key] ?? "#3b82f6"}
                        strokeWidth={2}
                        dot={false}
                        name={key}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm text-gray-500">No timeline data available</p>
              )}
            </div>

            {/* Final Distribution */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Final Distribution
              </h3>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={110}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    >
                      {pieData.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={STANCE_COLORS[entry.name] ?? PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                      labelStyle={{ color: "#fff" }}
                    />
                    <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm text-gray-500">No distribution data available</p>
              )}
            </div>
          </div>

          {/* Metrics Cards */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <p className="text-xs text-gray-500">Status</p>
              <p className="text-lg font-bold text-white capitalize">{simulation.status}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <p className="text-xs text-gray-500">Ticks</p>
              <p className="text-lg font-bold text-white">{simulation.timeline?.length ?? 0}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <p className="text-xs text-gray-500">Runtime</p>
              <p className="text-lg font-bold text-white">
                {simulation.runtime_ms ? `${(simulation.runtime_ms / 1000).toFixed(1)}s` : "--"}
              </p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <p className="text-xs text-gray-500">Convergence</p>
              <p className="text-lg font-bold text-white">
                {simulation.convergence_tick ? `Tick ${simulation.convergence_tick}` : "N/A"}
              </p>
            </div>
          </div>

          {/* Branch List */}
          {simulation.branches && simulation.branches.length > 0 && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-400 uppercase tracking-wider">Branches</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {simulation.branches.map((b) => (
                  <div key={b.id} className="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
                    <h4 className="mb-1 font-medium text-white">{b.name}</h4>
                    <div className="text-xs text-gray-500">
                      {b.final_distribution
                        ? Object.entries(b.final_distribution)
                            .map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`)
                            .join(", ")
                        : "No results"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Branch Comparison Chart */}
          {comparisonData.length > 0 && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Branch Comparison (Support Probability)
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={comparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="tick" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} domain={[0, 1]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="baseline"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    name="Baseline"
                  />
                  <Line
                    type="monotone"
                    dataKey="branch"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Branch"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* No Simulation State */}
      {!simulation && !running && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-700 py-20">
          <div className="mb-2 text-4xl text-gray-700">&gt;_</div>
          <h3 className="mb-2 text-lg font-semibold text-gray-400">No simulation results</h3>
          <p className="text-sm text-gray-500">
            Configure your population and scenario above, then start a simulation.
          </p>
        </div>
      )}

      {/* Create Branch Dialog */}
      {showBranchDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-bold text-white">Create Branch</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-gray-400">Branch Name</label>
                <input
                  type="text"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="e.g. High Growth Variant"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-400">Variable Overrides (JSON)</label>
                <textarea
                  value={branchOverrides}
                  onChange={(e) => setBranchOverrides(e.target.value)}
                  rows={4}
                  placeholder='{"economic_growth": 0.8}'
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 font-mono text-sm text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowBranchDialog(false);
                  setBranchName("");
                  setBranchOverrides("{}");
                }}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBranch}
                disabled={!branchName.trim() || creatingBranch}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {creatingBranch ? "Creating..." : "Create Branch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
