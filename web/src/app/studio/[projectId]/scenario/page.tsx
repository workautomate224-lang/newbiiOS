"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getScenarios,
  createScenario,
  updateScenario,
  forkScenario,
  diffScenarios,
} from "@/lib/api";

interface ScenarioNode {
  id: string;
  name: string;
  value: number;
}

interface ScenarioEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
}

interface Scenario {
  id: string;
  name: string;
  description?: string;
  nodes: ScenarioNode[];
  edges: ScenarioEdge[];
  variables: Record<string, number>;
  created_at?: string;
  parent_id?: string;
}

interface DiffResult {
  variable: string;
  value_a: number;
  value_b: number;
  delta: number;
}

let nodeCounter = 0;
let edgeCounter = 0;

export default function ScenarioPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const supabase = createClient();

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Scenario | null>(null);
  const [saving, setSaving] = useState(false);

  // Node/Edge editing
  const [nodes, setNodes] = useState<ScenarioNode[]>([]);
  const [edges, setEdges] = useState<ScenarioEdge[]>([]);
  const [variables, setVariables] = useState<Record<string, number>>({});

  // Add node dialog
  const [showAddNode, setShowAddNode] = useState(false);
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeValue, setNewNodeValue] = useState(0.5);

  // Add edge dialog
  const [showAddEdge, setShowAddEdge] = useState(false);
  const [edgeSource, setEdgeSource] = useState("");
  const [edgeTarget, setEdgeTarget] = useState("");
  const [edgeWeight, setEdgeWeight] = useState(0.5);

  // Edit node
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editNodeValue, setEditNodeValue] = useState(0);

  // New scenario dialog
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState("");
  const [newScenarioDesc, setNewScenarioDesc] = useState("");
  const [creatingScenario, setCreatingScenario] = useState(false);

  // Fork
  const [forking, setForking] = useState(false);

  // Diff
  const [showDiff, setShowDiff] = useState(false);
  const [diffOtherId, setDiffOtherId] = useState("");
  const [diffResults, setDiffResults] = useState<DiffResult[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);

  const loadScenarios = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !projectId) return;
    try {
      const data = await getScenarios(projectId, session.access_token);
      const list: Scenario[] = Array.isArray(data) ? data : data.scenarios ?? [];
      setScenarios(list);
      if (list.length > 0 && !selected) {
        selectScenario(list[0]);
      }
    } catch {
      // API may not be ready
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, supabase.auth]);

  useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  function selectScenario(s: Scenario) {
    setSelected(s);
    setNodes(s.nodes ?? []);
    setEdges(s.edges ?? []);
    setVariables(s.variables ?? {});
  }

  async function handleCreateScenario() {
    if (!newScenarioName.trim()) return;
    setCreatingScenario(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !projectId) return;
      const scenario = await createScenario(
        projectId,
        {
          name: newScenarioName.trim(),
          description: newScenarioDesc.trim() || undefined,
          nodes: [],
          edges: [],
          variables: {},
        },
        session.access_token
      );
      setScenarios((prev) => [...prev, scenario]);
      selectScenario(scenario);
      setShowNewDialog(false);
      setNewScenarioName("");
      setNewScenarioDesc("");
    } catch {
      // Handle silently
    } finally {
      setCreatingScenario(false);
    }
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const updated = await updateScenario(
        selected.id,
        { nodes, edges, variables },
        session.access_token
      );
      setScenarios((prev) => prev.map((s) => (s.id === selected.id ? { ...s, ...updated } : s)));
    } catch {
      // Handle silently
    } finally {
      setSaving(false);
    }
  }

  function handleAddNode() {
    if (!newNodeName.trim()) return;
    const node: ScenarioNode = {
      id: `node-${Date.now()}-${++nodeCounter}`,
      name: newNodeName.trim(),
      value: newNodeValue,
    };
    setNodes((prev) => [...prev, node]);
    setVariables((prev) => ({ ...prev, [node.name]: node.value }));
    setShowAddNode(false);
    setNewNodeName("");
    setNewNodeValue(0.5);
  }

  function handleAddEdge() {
    if (!edgeSource || !edgeTarget || edgeSource === edgeTarget) return;
    const edge: ScenarioEdge = {
      id: `edge-${Date.now()}-${++edgeCounter}`,
      source: edgeSource,
      target: edgeTarget,
      weight: edgeWeight,
    };
    setEdges((prev) => [...prev, edge]);
    setShowAddEdge(false);
    setEdgeSource("");
    setEdgeTarget("");
    setEdgeWeight(0.5);
  }

  function handleDeleteNode(nodeId: string) {
    const node = nodes.find((n) => n.id === nodeId);
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (node) {
      setVariables((prev) => {
        const copy = { ...prev };
        delete copy[node.name];
        return copy;
      });
    }
  }

  function handleDeleteEdge(edgeId: string) {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
  }

  function handleSaveNodeEdit(nodeId: string) {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id === nodeId) {
          const updated = { ...n, value: editNodeValue };
          setVariables((vars) => ({ ...vars, [n.name]: editNodeValue }));
          return updated;
        }
        return n;
      })
    );
    setEditingNode(null);
  }

  function handleVariableChange(name: string, value: number) {
    setVariables((prev) => ({ ...prev, [name]: value }));
    setNodes((prev) => prev.map((n) => (n.name === name ? { ...n, value } : n)));
  }

  function applyPreset(preset: "optimistic" | "pessimistic" | "baseline") {
    const multiplier = preset === "optimistic" ? 1.2 : preset === "pessimistic" ? 0.8 : 1;
    const newVars: Record<string, number> = {};
    for (const [key, val] of Object.entries(variables)) {
      newVars[key] = Math.min(1, Math.max(0, val * multiplier));
    }
    setVariables(newVars);
    setNodes((prev) => prev.map((n) => ({ ...n, value: newVars[n.name] ?? n.value })));
  }

  async function handleFork() {
    if (!selected) return;
    setForking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const forked = await forkScenario(selected.id, session.access_token);
      setScenarios((prev) => [...prev, forked]);
      selectScenario(forked);
    } catch {
      // Handle silently
    } finally {
      setForking(false);
    }
  }

  async function handleDiff() {
    if (!selected || !diffOtherId) return;
    setDiffLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const result = await diffScenarios(selected.id, diffOtherId, session.access_token);
      setDiffResults(Array.isArray(result) ? result : result.diffs ?? []);
    } catch {
      setDiffResults([]);
    } finally {
      setDiffLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left: Scenario List */}
      <div className="w-56 shrink-0 border-r border-gray-800 bg-gray-900/30 p-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-400">Scenarios</h3>
          <button
            onClick={() => setShowNewDialog(true)}
            className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            + New
          </button>
        </div>
        <ul className="space-y-1">
          {scenarios.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => selectScenario(s)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  selected?.id === s.id
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                <span className="block truncate font-medium">{s.name}</span>
                {s.parent_id && <span className="text-xs text-gray-600">forked</span>}
              </button>
            </li>
          ))}
        </ul>
        {scenarios.length === 0 && (
          <p className="mt-4 text-center text-xs text-gray-600">No scenarios yet</p>
        )}
      </div>

      {/* Center: Causal Graph Editor */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selected ? (
          <div className="flex flex-col items-center justify-center py-20">
            <h3 className="mb-2 text-lg font-semibold text-gray-400">Select or create a scenario</h3>
            <button
              onClick={() => setShowNewDialog(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Create Scenario
            </button>
          </div>
        ) : (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{selected.name}</h2>
              <div className="flex gap-2">
                <button
                  onClick={handleFork}
                  disabled={forking}
                  className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-50"
                >
                  {forking ? "Forking..." : "Fork"}
                </button>
                <button
                  onClick={() => setShowDiff(true)}
                  className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
                >
                  Diff
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            {/* Graph Nodes */}
            <div className="mb-4 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-400">Nodes</h3>
              <button
                onClick={() => setShowAddNode(true)}
                className="rounded border border-gray-700 px-2 py-0.5 text-xs text-blue-400 hover:bg-gray-800"
              >
                + Add Node
              </button>
            </div>
            {nodes.length === 0 ? (
              <p className="mb-6 text-sm text-gray-600">No nodes yet. Add nodes to build the causal graph.</p>
            ) : (
              <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {nodes.map((node) => (
                  <div
                    key={node.id}
                    className="rounded-xl border border-gray-800 bg-gray-900/50 p-3"
                  >
                    {editingNode === node.id ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-white">{node.name}</p>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={editNodeValue}
                          onChange={(e) => setEditNodeValue(parseFloat(e.target.value))}
                          className="w-full accent-blue-500"
                        />
                        <p className="text-center text-xs text-gray-400">{editNodeValue.toFixed(2)}</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveNodeEdit(node.id)}
                            className="flex-1 rounded bg-blue-600 py-1 text-xs text-white hover:bg-blue-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingNode(null)}
                            className="flex-1 rounded border border-gray-700 py-1 text-xs text-gray-300 hover:bg-gray-800"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium text-white">{node.name}</span>
                          <span className="font-mono text-xs text-gray-500">{node.value.toFixed(2)}</span>
                        </div>
                        <div className="mb-2 h-1.5 rounded-full bg-gray-700">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{ width: `${node.value * 100}%` }}
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingNode(node.id);
                              setEditNodeValue(node.value);
                            }}
                            className="text-xs text-blue-400 hover:text-blue-300"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteNode(node.id)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Graph Edges */}
            <div className="mb-4 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-400">Edges</h3>
              <button
                onClick={() => setShowAddEdge(true)}
                disabled={nodes.length < 2}
                className="rounded border border-gray-700 px-2 py-0.5 text-xs text-blue-400 hover:bg-gray-800 disabled:opacity-50"
              >
                + Add Edge
              </button>
            </div>
            {edges.length === 0 ? (
              <p className="text-sm text-gray-600">No edges yet. Add edges to define causal relationships.</p>
            ) : (
              <div className="rounded-xl border border-gray-800 bg-gray-900/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="px-4 py-2 text-left font-medium text-gray-400">Source</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-400">Target</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-400">Weight</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {edges.map((edge) => {
                      const srcNode = nodes.find((n) => n.id === edge.source);
                      const tgtNode = nodes.find((n) => n.id === edge.target);
                      return (
                        <tr key={edge.id} className="border-b border-gray-800/40">
                          <td className="px-4 py-2 text-gray-300">{srcNode?.name ?? edge.source}</td>
                          <td className="px-4 py-2 text-gray-300">
                            <span className="text-gray-600 mr-2">&rarr;</span>
                            {tgtNode?.name ?? edge.target}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`font-mono text-xs ${
                                edge.weight >= 0.5 ? "text-green-400" : "text-red-400"
                              }`}
                            >
                              {edge.weight.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <button
                              onClick={() => handleDeleteEdge(edge.id)}
                              className="text-xs text-red-400 hover:text-red-300"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Variable Panel */}
      {selected && (
        <div className="w-64 shrink-0 border-l border-gray-800 bg-gray-900/30 p-4 overflow-y-auto">
          <h3 className="mb-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">Variables</h3>

          {/* Presets */}
          <div className="mb-4 flex gap-1">
            <button
              onClick={() => applyPreset("optimistic")}
              className="flex-1 rounded border border-green-800 py-1 text-xs text-green-400 hover:bg-green-900/30"
            >
              Optimistic
            </button>
            <button
              onClick={() => applyPreset("baseline")}
              className="flex-1 rounded border border-gray-700 py-1 text-xs text-gray-400 hover:bg-gray-800"
            >
              Baseline
            </button>
            <button
              onClick={() => applyPreset("pessimistic")}
              className="flex-1 rounded border border-red-800 py-1 text-xs text-red-400 hover:bg-red-900/30"
            >
              Pessimistic
            </button>
          </div>

          <div className="space-y-4">
            {Object.entries(variables).map(([name, value]) => (
              <div key={name}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-gray-300">{name}</span>
                  <span className="font-mono text-xs text-gray-500">{value.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={value}
                  onChange={(e) => handleVariableChange(name, parseFloat(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>
            ))}
          </div>

          {Object.keys(variables).length === 0 && (
            <p className="text-xs text-gray-600">Add nodes to populate variables.</p>
          )}
        </div>
      )}

      {/* Add Node Dialog */}
      {showAddNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-bold text-white">Add Node</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm text-gray-400">Name</label>
                <input
                  type="text"
                  value={newNodeName}
                  onChange={(e) => setNewNodeName(e.target.value)}
                  placeholder="e.g. Economic Growth"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-400">
                  Value: {newNodeValue.toFixed(2)}
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={newNodeValue}
                  onChange={(e) => setNewNodeValue(parseFloat(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddNode(false);
                  setNewNodeName("");
                }}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNode}
                disabled={!newNodeName.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Edge Dialog */}
      {showAddEdge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-bold text-white">Add Edge</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm text-gray-400">Source Node</label>
                <select
                  value={edgeSource}
                  onChange={(e) => setEdgeSource(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select source...</option>
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-400">Target Node</label>
                <select
                  value={edgeTarget}
                  onChange={(e) => setEdgeTarget(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select target...</option>
                  {nodes
                    .filter((n) => n.id !== edgeSource)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-400">
                  Weight: {edgeWeight.toFixed(2)}
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={edgeWeight}
                  onChange={(e) => setEdgeWeight(parseFloat(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddEdge(false);
                  setEdgeSource("");
                  setEdgeTarget("");
                }}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleAddEdge}
                disabled={!edgeSource || !edgeTarget || edgeSource === edgeTarget}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Scenario Dialog */}
      {showNewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-bold text-white">New Scenario</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-gray-400">Name</label>
                <input
                  type="text"
                  value={newScenarioName}
                  onChange={(e) => setNewScenarioName(e.target.value)}
                  placeholder="e.g. Base Case 2026"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-400">Description</label>
                <textarea
                  value={newScenarioDesc}
                  onChange={(e) => setNewScenarioDesc(e.target.value)}
                  placeholder="Describe this scenario..."
                  rows={3}
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowNewDialog(false);
                  setNewScenarioName("");
                  setNewScenarioDesc("");
                }}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateScenario}
                disabled={!newScenarioName.trim() || creatingScenario}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {creatingScenario ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diff Dialog */}
      {showDiff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-bold text-white">Compare Scenarios</h3>
            <div className="mb-4">
              <label className="mb-1 block text-sm text-gray-400">Compare with:</label>
              <select
                value={diffOtherId}
                onChange={(e) => setDiffOtherId(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select scenario...</option>
                {scenarios
                  .filter((s) => s.id !== selected?.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
            <button
              onClick={handleDiff}
              disabled={!diffOtherId || diffLoading}
              className="mb-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {diffLoading ? "Comparing..." : "Compare"}
            </button>

            {diffResults.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-lg border border-gray-700">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700 bg-gray-800/50">
                      <th className="px-3 py-2 text-left font-medium text-gray-400">Variable</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-400">A</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-400">B</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-400">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffResults.map((d) => (
                      <tr key={d.variable} className="border-b border-gray-800/40">
                        <td className="px-3 py-2 text-gray-300">{d.variable}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-400">{d.value_a.toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-400">{d.value_b.toFixed(2)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`font-mono text-xs ${
                              d.delta > 0 ? "text-green-400" : d.delta < 0 ? "text-red-400" : "text-gray-500"
                            }`}
                          >
                            {d.delta > 0 ? "+" : ""}
                            {d.delta.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  setShowDiff(false);
                  setDiffOtherId("");
                  setDiffResults([]);
                }}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
