"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getPopulations, createPopulation, generateAgents, getAgents } from "@/lib/api";
import {
  BarChart,
  Bar,
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

interface Population {
  id: string;
  name: string;
  agent_count: number;
  status?: string;
  created_at?: string;
}

interface Agent {
  id: string;
  age: number;
  gender: string;
  region: string;
  ethnicity?: string;
  stance?: string;
}

interface AgeGroup {
  ageGroup: string;
  male: number;
  female: number;
}

const PIE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#f97316", "#ec4899"];

function buildPyramidData(agents: Agent[]): AgeGroup[] {
  const groups: Record<string, { male: number; female: number }> = {};
  const buckets = ["0-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80+"];

  for (const b of buckets) groups[b] = { male: 0, female: 0 };

  for (const a of agents) {
    let bucket = "80+";
    if (a.age < 10) bucket = "0-9";
    else if (a.age < 20) bucket = "10-19";
    else if (a.age < 30) bucket = "20-29";
    else if (a.age < 40) bucket = "30-39";
    else if (a.age < 50) bucket = "40-49";
    else if (a.age < 60) bucket = "50-59";
    else if (a.age < 70) bucket = "60-69";
    else if (a.age < 80) bucket = "70-79";

    const g = a.gender?.toLowerCase() === "female" ? "female" : "male";
    if (groups[bucket]) groups[bucket][g]++;
  }

  return buckets.map((b) => ({
    ageGroup: b,
    male: -(groups[b]?.male ?? 0),
    female: groups[b]?.female ?? 0,
  }));
}

function buildRegionData(agents: Agent[]): { name: string; value: number }[] {
  const counts: Record<string, number> = {};
  for (const a of agents) {
    const region = a.region ?? "Unknown";
    counts[region] = (counts[region] ?? 0) + 1;
  }
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

export default function PopulationPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const supabase = createClient();

  const [populations, setPopulations] = useState<Population[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPop, setSelectedPop] = useState<Population | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCount, setFormCount] = useState(1000);
  const [formParams, setFormParams] = useState('{\n  "age_distribution": "normal",\n  "regions": ["Urban", "Suburban", "Rural"]\n}');
  const [creating, setCreating] = useState(false);

  // Generation
  const [generating, setGenerating] = useState<Record<string, boolean>>({});

  const loadPopulations = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !projectId) return;
    try {
      const data = await getPopulations(projectId, session.access_token);
      setPopulations(Array.isArray(data) ? data : data.populations ?? []);
    } catch {
      // API may not be ready
    }
    setLoading(false);
  }, [projectId, supabase.auth]);

  useEffect(() => {
    loadPopulations();
  }, [loadPopulations]);

  async function handleCreate() {
    if (!formName.trim()) return;
    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !projectId) return;

      let distParams: Record<string, unknown> = {};
      try {
        distParams = JSON.parse(formParams);
      } catch {
        // Use empty params
      }

      const pop = await createPopulation(
        projectId,
        { name: formName.trim(), agent_count: formCount, distribution_params: distParams },
        session.access_token
      );
      setPopulations((prev) => [...prev, pop]);
      setShowCreate(false);
      setFormName("");
      setFormCount(1000);
    } catch {
      // Handle silently
    } finally {
      setCreating(false);
    }
  }

  async function handleGenerate(popId: string) {
    setGenerating((prev) => ({ ...prev, [popId]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await generateAgents(popId, session.access_token);
      await loadPopulations();
      // Auto-select and load agents
      const pop = populations.find((p) => p.id === popId);
      if (pop) {
        await handleSelectPop(pop);
      }
    } catch {
      // Handle silently
    } finally {
      setGenerating((prev) => ({ ...prev, [popId]: false }));
    }
  }

  async function handleSelectPop(pop: Population) {
    setSelectedPop(pop);
    setAgentsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const data = await getAgents(pop.id, session.access_token);
      setAgents(Array.isArray(data) ? data : data.agents ?? []);
    } catch {
      setAgents([]);
    } finally {
      setAgentsLoading(false);
    }
  }

  const pyramidData = buildPyramidData(agents);
  const regionData = buildRegionData(agents);

  const maleCount = agents.filter((a) => a.gender?.toLowerCase() === "male").length;
  const femaleCount = agents.filter((a) => a.gender?.toLowerCase() === "female").length;
  const avgAge = agents.length > 0 ? Math.round(agents.reduce((s, a) => s + a.age, 0) / agents.length) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Population Workbench</h2>
          <p className="text-sm text-gray-500">Define and generate agent populations</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Create Population
        </button>
      </div>

      {/* Population List */}
      {populations.length === 0 && !showCreate ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-700 py-20">
          <div className="mb-2 text-4xl text-gray-700">&#x1f465;</div>
          <h3 className="mb-2 text-lg font-semibold text-gray-400">No populations</h3>
          <p className="mb-4 text-sm text-gray-500">Create a population model to generate synthetic agents.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Create First Population
          </button>
        </div>
      ) : (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {populations.map((pop) => (
            <div
              key={pop.id}
              className={`cursor-pointer rounded-xl border p-4 transition ${
                selectedPop?.id === pop.id
                  ? "border-blue-500 bg-blue-900/20"
                  : "border-gray-800 bg-gray-900/50 hover:border-gray-600"
              }`}
              onClick={() => handleSelectPop(pop)}
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-white">{pop.name}</h3>
                <span className="text-xs text-gray-500">{pop.status ?? "created"}</span>
              </div>
              <p className="mb-3 text-sm text-gray-400">{pop.agent_count?.toLocaleString()} agents</p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleGenerate(pop.id);
                }}
                disabled={generating[pop.id]}
                className="rounded border border-green-700 px-3 py-1 text-xs font-medium text-green-400 hover:bg-green-900/30 disabled:opacity-50"
              >
                {generating[pop.id] ? "Generating..." : "Generate"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create Panel */}
      {showCreate && (
        <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900/50 p-6">
          <h3 className="mb-4 text-lg font-bold text-white">Configure Population</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-gray-400">Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Malaysia Voters 2026"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-400">
                Agent Count: {formCount.toLocaleString()}
              </label>
              <input
                type="range"
                min={100}
                max={10000}
                step={100}
                value={formCount}
                onChange={(e) => setFormCount(parseInt(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-gray-600">
                <span>100</span>
                <span>10,000</span>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm text-gray-400">Distribution Parameters (JSON)</label>
              <textarea
                value={formParams}
                onChange={(e) => setFormParams(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 font-mono text-sm text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleCreate}
              disabled={!formName.trim() || creating}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Population"}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Results Section */}
      {selectedPop && agents.length > 0 && (
        <div className="space-y-6">
          {/* Stat Cards */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <p className="text-xs text-gray-500">Total Agents</p>
              <p className="text-2xl font-bold text-white">{agents.length.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <p className="text-xs text-gray-500">Male</p>
              <p className="text-2xl font-bold text-blue-400">{maleCount.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <p className="text-xs text-gray-500">Female</p>
              <p className="text-2xl font-bold text-pink-400">{femaleCount.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <p className="text-xs text-gray-500">Avg. Age</p>
              <p className="text-2xl font-bold text-green-400">{avgAge}</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Population Pyramid */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Population Pyramid
              </h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart layout="vertical" data={pyramidData} stackOffset="sign">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    type="number"
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    tickFormatter={(v: number) => Math.abs(v).toString()}
                  />
                  <YAxis
                    dataKey="ageGroup"
                    type="category"
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                    labelStyle={{ color: "#fff" }}
                    formatter={(value: number | undefined) => Math.abs(value ?? 0)}
                  />
                  <Bar dataKey="male" fill="#3b82f6" name="Male" stackId="stack" />
                  <Bar dataKey="female" fill="#ec4899" name="Female" stackId="stack" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Region Distribution */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Region Distribution
              </h3>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={regionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={110}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {regionData.map((_entry, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Legend
                    wrapperStyle={{ color: "#9ca3af", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Agent Table */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/50">
            <div className="border-b border-gray-800 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Agent Table (first 100)
              </h3>
            </div>
            {agentsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              </div>
            ) : (
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900/80 text-left">
                      <th className="px-4 py-2 font-medium text-gray-400">ID</th>
                      <th className="px-4 py-2 font-medium text-gray-400">Age</th>
                      <th className="px-4 py-2 font-medium text-gray-400">Gender</th>
                      <th className="px-4 py-2 font-medium text-gray-400">Region</th>
                      <th className="px-4 py-2 font-medium text-gray-400">Ethnicity</th>
                      <th className="px-4 py-2 font-medium text-gray-400">Stance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.slice(0, 100).map((a) => (
                      <tr key={a.id} className="border-b border-gray-800/40">
                        <td className="px-4 py-2 font-mono text-xs text-gray-500">
                          {a.id.slice(0, 8)}
                        </td>
                        <td className="px-4 py-2 text-gray-300">{a.age}</td>
                        <td className="px-4 py-2 text-gray-300">{a.gender}</td>
                        <td className="px-4 py-2 text-gray-300">{a.region}</td>
                        <td className="px-4 py-2 text-gray-300">{a.ethnicity ?? "--"}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              a.stance === "support"
                                ? "bg-green-900/50 text-green-400"
                                : a.stance === "oppose"
                                ? "bg-red-900/50 text-red-400"
                                : "bg-gray-700/50 text-gray-400"
                            }`}
                          >
                            {a.stance ?? "neutral"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
