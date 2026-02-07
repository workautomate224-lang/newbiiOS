"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getDataSources,
  addDataSource,
  syncDataSource,
  previewDataSource,
  qualityCheck,
} from "@/lib/api";

interface DataSource {
  id: string;
  name: string;
  type: string;
  row_count: number;
  freshness: "fresh" | "stale" | "expired";
  last_synced?: string;
  quality_score?: number;
}

interface PreviewData {
  columns: string[];
  rows: Record<string, string | number | boolean | null>[];
}

function FreshnessIndicator({ freshness }: { freshness: string }) {
  const colors: Record<string, string> = {
    fresh: "bg-green-500",
    stale: "bg-yellow-500",
    expired: "bg-red-500",
  };
  return (
    <span className="flex items-center gap-2">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[freshness] ?? "bg-gray-500"}`} />
      <span className="capitalize">{freshness}</span>
    </span>
  );
}

function parseCSV(text: string): { columns: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split("\n");
  if (lines.length === 0) return { columns: [], rows: [] };
  const columns = lines[0].split(",").map((c) => c.trim());
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    columns.forEach((col, i) => {
      row[col] = values[i] ?? "";
    });
    return row;
  });
  return { columns, rows };
}

export default function DataPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const supabase = createClient();

  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addTab, setAddTab] = useState<"csv" | "manual" | "api">("csv");
  const [csvInput, setCsvInput] = useState("");
  const [csvPreview, setCsvPreview] = useState<{ columns: string[]; rows: Record<string, string>[] } | null>(null);
  const [manualJson, setManualJson] = useState("[\n  {}\n]");
  const [sourceName, setSourceName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Preview panel
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Quality check
  const [qualityResults, setQualityResults] = useState<Record<string, number>>({});
  const [qualityLoading, setQualityLoading] = useState<Record<string, boolean>>({});

  // Sync loading
  const [syncLoading, setSyncLoading] = useState<Record<string, boolean>>({});

  const loadSources = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !projectId) return;
    try {
      const data = await getDataSources(projectId, session.access_token);
      setSources(Array.isArray(data) ? data : data.sources ?? []);
    } catch {
      // API may not be ready
    }
    setLoading(false);
  }, [projectId, supabase.auth]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  async function handleAdd() {
    if (!sourceName.trim()) return;
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !projectId) return;

      let payload: Record<string, unknown>;
      if (addTab === "csv") {
        const parsed = parseCSV(csvInput);
        payload = { name: sourceName.trim(), type: "csv", data: parsed.rows, columns: parsed.columns };
      } else if (addTab === "manual") {
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(manualJson);
        } catch {
          parsedJson = [];
        }
        payload = { name: sourceName.trim(), type: "manual", data: parsedJson };
      } else {
        payload = { name: sourceName.trim(), type: "api" };
      }

      const result = await addDataSource(projectId, payload, session.access_token);
      setSources((prev) => [...prev, result]);
      setShowAddDialog(false);
      setSourceName("");
      setCsvInput("");
      setCsvPreview(null);
      setManualJson("[\n  {}\n]");
    } catch {
      // Handle silently
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSync(sourceId: string) {
    setSyncLoading((prev) => ({ ...prev, [sourceId]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await syncDataSource(sourceId, session.access_token);
      await loadSources();
    } catch {
      // Handle silently
    } finally {
      setSyncLoading((prev) => ({ ...prev, [sourceId]: false }));
    }
  }

  async function handlePreview(sourceId: string) {
    if (previewId === sourceId) {
      setPreviewId(null);
      setPreviewData(null);
      return;
    }
    setPreviewId(sourceId);
    setPreviewLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const data = await previewDataSource(sourceId, session.access_token);
      setPreviewData(data);
    } catch {
      setPreviewData({ columns: [], rows: [] });
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleQuality(sourceId: string) {
    setQualityLoading((prev) => ({ ...prev, [sourceId]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const result = await qualityCheck(sourceId, session.access_token);
      setQualityResults((prev) => ({ ...prev, [sourceId]: result.score ?? result.quality_score ?? 0 }));
    } catch {
      setQualityResults((prev) => ({ ...prev, [sourceId]: -1 }));
    } finally {
      setQualityLoading((prev) => ({ ...prev, [sourceId]: false }));
    }
  }

  function handleCsvParse() {
    if (!csvInput.trim()) return;
    const parsed = parseCSV(csvInput);
    setCsvPreview(parsed);
  }

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
          <h2 className="text-xl font-bold text-white">Data Workbench</h2>
          <p className="text-sm text-gray-500">Manage data sources for this project</p>
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Add Data Source
        </button>
      </div>

      {sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-700 py-20">
          <div className="mb-2 text-4xl text-gray-700">{ }</div>
          <h3 className="mb-2 text-lg font-semibold text-gray-400">No data sources</h3>
          <p className="mb-4 text-sm text-gray-500">Add CSV data, manual entries, or API connections.</p>
          <button
            onClick={() => setShowAddDialog(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add First Source
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/80 text-left">
                <th className="px-4 py-3 font-medium text-gray-400">Name</th>
                <th className="px-4 py-3 font-medium text-gray-400">Type</th>
                <th className="px-4 py-3 font-medium text-gray-400">Rows</th>
                <th className="px-4 py-3 font-medium text-gray-400">Freshness</th>
                <th className="px-4 py-3 font-medium text-gray-400">Last Synced</th>
                <th className="px-4 py-3 font-medium text-gray-400">Quality</th>
                <th className="px-4 py-3 font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((src) => (
                <tr
                  key={src.id}
                  className={`border-b border-gray-800/50 transition hover:bg-gray-900/40 ${
                    previewId === src.id ? "bg-gray-900/60" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handlePreview(src.id)}
                      className="font-medium text-white hover:text-blue-400"
                    >
                      {src.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{src.type}</td>
                  <td className="px-4 py-3 text-gray-400">{src.row_count?.toLocaleString() ?? "--"}</td>
                  <td className="px-4 py-3 text-gray-400">
                    <FreshnessIndicator freshness={src.freshness ?? "fresh"} />
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {src.last_synced ? new Date(src.last_synced).toLocaleString() : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    {qualityResults[src.id] !== undefined ? (
                      qualityResults[src.id] === -1 ? (
                        <span className="text-red-400">Error</span>
                      ) : (
                        <span
                          className={`font-mono font-medium ${
                            qualityResults[src.id] >= 0.8
                              ? "text-green-400"
                              : qualityResults[src.id] >= 0.5
                              ? "text-yellow-400"
                              : "text-red-400"
                          }`}
                        >
                          {Math.round(qualityResults[src.id] * 100)}%
                        </span>
                      )
                    ) : (
                      <button
                        onClick={() => handleQuality(src.id)}
                        disabled={qualityLoading[src.id]}
                        className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                      >
                        {qualityLoading[src.id] ? "Checking..." : "Check"}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleSync(src.id)}
                      disabled={syncLoading[src.id]}
                      className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-50"
                    >
                      {syncLoading[src.id] ? "Syncing..." : "Sync"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview Panel */}
      {previewId && (
        <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-white">Data Preview (first 50 rows)</h3>
            <button
              onClick={() => {
                setPreviewId(null);
                setPreviewData(null);
              }}
              className="text-sm text-gray-500 hover:text-white"
            >
              Close
            </button>
          </div>
          {previewLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : previewData && previewData.columns.length > 0 ? (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-700">
                    {previewData.columns.map((col) => (
                      <th key={col} className="px-3 py-2 text-left font-medium text-gray-400">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.rows.slice(0, 50).map((row, i) => (
                    <tr key={i} className="border-b border-gray-800/40">
                      {previewData.columns.map((col) => (
                        <td key={col} className="px-3 py-1.5 text-gray-300">
                          {String(row[col] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-gray-500">No preview data available</p>
          )}
        </div>
      )}

      {/* Add Data Source Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-2xl rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-bold text-white">Add Data Source</h3>

            <div className="mb-4">
              <label className="mb-1 block text-sm text-gray-400">Source Name</label>
              <input
                type="text"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder="e.g. Census Data 2025"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Tabs */}
            <div className="mb-4 flex gap-0 border-b border-gray-700">
              {(["csv", "manual", "api"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setAddTab(tab)}
                  className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
                    addTab === tab
                      ? "border-blue-500 text-blue-400"
                      : "border-transparent text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {tab === "csv" ? "CSV Upload" : tab === "manual" ? "Manual" : "API"}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            {addTab === "csv" && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm text-gray-400">
                    Paste CSV Data (first row = headers)
                  </label>
                  <textarea
                    value={csvInput}
                    onChange={(e) => setCsvInput(e.target.value)}
                    placeholder={"name,age,region,stance\nAlice,32,Urban,support\nBob,45,Rural,oppose"}
                    rows={6}
                    className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 font-mono text-sm text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={handleCsvParse}
                    className="mt-2 rounded border border-gray-600 px-3 py-1 text-xs text-gray-300 hover:bg-gray-800"
                  >
                    Parse &amp; Preview
                  </button>
                </div>
                {csvPreview && csvPreview.columns.length > 0 && (
                  <div className="max-h-40 overflow-auto rounded-lg border border-gray-700 bg-gray-800/50">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-700">
                          {csvPreview.columns.map((col) => (
                            <th key={col} className="px-3 py-1.5 text-left font-medium text-gray-400">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.rows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-b border-gray-800/40">
                            {csvPreview.columns.map((col) => (
                              <td key={col} className="px-3 py-1 text-gray-300">
                                {row[col]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="px-3 py-1 text-xs text-gray-500">
                      Showing {Math.min(5, csvPreview.rows.length)} of {csvPreview.rows.length} rows
                    </p>
                  </div>
                )}
              </div>
            )}

            {addTab === "manual" && (
              <div>
                <label className="mb-1 block text-sm text-gray-400">JSON Data</label>
                <textarea
                  value={manualJson}
                  onChange={(e) => setManualJson(e.target.value)}
                  rows={8}
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 font-mono text-sm text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}

            {addTab === "api" && (
              <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6 text-center">
                <p className="text-sm text-gray-400">
                  API connector will register the data source for syncing.
                  Configure the endpoint in project settings after creation.
                </p>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddDialog(false);
                  setSourceName("");
                  setCsvInput("");
                  setCsvPreview(null);
                  setManualJson("[\n  {}\n]");
                }}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!sourceName.trim() || submitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Adding..." : "Add Source"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
