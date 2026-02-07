"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getReports,
  createReport,
  getReport,
  updateReport,
  exportReport,
} from "@/lib/api";

interface Report {
  id: string;
  title: string;
  content?: string;
  created_at?: string;
  updated_at?: string;
}

export default function ReportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const supabase = createClient();
  const editorRef = useRef<HTMLDivElement>(null);

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Report | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // New report dialog
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creatingReport, setCreatingReport] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  // AI Assist
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !projectId) return;
    try {
      const data = await getReports(projectId, session.access_token);
      const list: Report[] = Array.isArray(data) ? data : data.reports ?? [];
      setReports(list);
    } catch {
      // API may not be ready
    }
    setLoading(false);
  }, [projectId, supabase.auth]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  async function handleSelectReport(report: Report) {
    setSelected(report);
    setTitle(report.title);
    setExportUrl(null);
    setAiSuggestion(null);

    // Load full content
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const full = await getReport(report.id, session.access_token);
      setSelected(full);
      setTitle(full.title);
      if (editorRef.current) {
        editorRef.current.innerHTML = full.content ?? "";
      }
    } catch {
      if (editorRef.current) {
        editorRef.current.innerHTML = report.content ?? "";
      }
    }
  }

  async function handleCreateReport() {
    if (!newTitle.trim()) return;
    setCreatingReport(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !projectId) return;
      const report = await createReport(
        projectId,
        { title: newTitle.trim(), content: "" },
        session.access_token
      );
      setReports((prev) => [...prev, report]);
      setShowNewDialog(false);
      setNewTitle("");
      await handleSelectReport(report);
    } catch {
      // Handle silently
    } finally {
      setCreatingReport(false);
    }
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const content = editorRef.current?.innerHTML ?? "";
      const updated = await updateReport(
        selected.id,
        { title, content },
        session.access_token
      );
      setSelected({ ...selected, ...updated });
      setReports((prev) =>
        prev.map((r) => (r.id === selected.id ? { ...r, title, ...updated } : r))
      );
      setLastSaved(new Date().toLocaleTimeString());
    } catch {
      // Handle silently
    } finally {
      setSaving(false);
    }
  }

  async function handleExport(format: string) {
    if (!selected) return;
    setExporting(true);
    setExportUrl(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const result = await exportReport(selected.id, format, session.access_token);
      setExportUrl(result.url ?? result.download_url ?? null);
    } catch {
      // Handle silently
    } finally {
      setExporting(false);
    }
  }

  function execFormatCommand(command: string, value?: string) {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  }

  async function handleAiAssist() {
    const selection = window.getSelection();
    const selectedText = selection?.toString()?.trim() ?? "";
    if (!selectedText && editorRef.current) {
      // Use all content if nothing selected
    }
    setAiLoading(true);
    setAiSuggestion(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const text = selectedText || editorRef.current?.innerText || "";
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/studio/reports/ai-assist`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text, context: title }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setAiSuggestion(data.suggestion ?? data.text ?? "No suggestion generated.");
      } else {
        setAiSuggestion("AI assist is not available at this time.");
      }
    } catch {
      setAiSuggestion("AI assist is not available at this time.");
    } finally {
      setAiLoading(false);
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
      {/* Left: Report List */}
      <div className="w-56 shrink-0 border-r border-gray-800 bg-gray-900/30 p-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-400">Reports</h3>
          <button
            onClick={() => setShowNewDialog(true)}
            className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            + New
          </button>
        </div>
        <ul className="space-y-1">
          {reports.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => handleSelectReport(r)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  selected?.id === r.id
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                <span className="block truncate font-medium">{r.title}</span>
                <span className="text-xs text-gray-600">
                  {r.updated_at ? new Date(r.updated_at).toLocaleDateString() : "New"}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {reports.length === 0 && (
          <p className="mt-4 text-center text-xs text-gray-600">No reports yet</p>
        )}
      </div>

      {/* Main: Editor */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selected ? (
          <div className="flex flex-col items-center justify-center py-20">
            <h3 className="mb-2 text-lg font-semibold text-gray-400">Select or create a report</h3>
            <button
              onClick={() => setShowNewDialog(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Create Report
            </button>
          </div>
        ) : (
          <div>
            {/* Title */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mb-4 w-full border-b border-gray-800 bg-transparent pb-2 text-2xl font-bold text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
              placeholder="Report Title"
            />

            {/* Toolbar */}
            <div className="mb-4 flex flex-wrap items-center gap-1 rounded-lg border border-gray-800 bg-gray-900/50 px-2 py-1.5">
              <button
                onClick={() => execFormatCommand("bold")}
                className="rounded px-2.5 py-1 text-sm font-bold text-gray-300 hover:bg-gray-800"
                title="Bold"
              >
                B
              </button>
              <button
                onClick={() => execFormatCommand("italic")}
                className="rounded px-2.5 py-1 text-sm italic text-gray-300 hover:bg-gray-800"
                title="Italic"
              >
                I
              </button>
              <button
                onClick={() => execFormatCommand("formatBlock", "h2")}
                className="rounded px-2.5 py-1 text-sm font-semibold text-gray-300 hover:bg-gray-800"
                title="Heading"
              >
                H2
              </button>
              <button
                onClick={() => execFormatCommand("formatBlock", "h3")}
                className="rounded px-2.5 py-1 text-sm font-semibold text-gray-300 hover:bg-gray-800"
                title="Subheading"
              >
                H3
              </button>
              <button
                onClick={() => execFormatCommand("insertUnorderedList")}
                className="rounded px-2.5 py-1 text-sm text-gray-300 hover:bg-gray-800"
                title="Bullet List"
              >
                List
              </button>
              <div className="mx-2 h-4 w-px bg-gray-700" />
              <button
                onClick={handleAiAssist}
                disabled={aiLoading}
                className="rounded bg-purple-600/20 px-3 py-1 text-sm text-purple-400 hover:bg-purple-600/30 disabled:opacity-50"
                title="AI Assist"
              >
                {aiLoading ? "Thinking..." : "AI Assist"}
              </button>
              <div className="flex-1" />
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              {lastSaved && <span className="text-xs text-gray-500">Last saved: {lastSaved}</span>}
            </div>

            {/* AI Suggestion */}
            {aiSuggestion && (
              <div className="mb-4 rounded-lg border border-purple-800 bg-purple-900/20 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-purple-400">AI Suggestion</span>
                  <button
                    onClick={() => setAiSuggestion(null)}
                    className="text-xs text-gray-500 hover:text-white"
                  >
                    Dismiss
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-sm text-gray-300">{aiSuggestion}</p>
                <button
                  onClick={() => {
                    if (editorRef.current) {
                      editorRef.current.innerHTML += `<p>${aiSuggestion}</p>`;
                    }
                    setAiSuggestion(null);
                  }}
                  className="mt-2 rounded border border-purple-700 px-3 py-1 text-xs text-purple-400 hover:bg-purple-900/30"
                >
                  Insert into Report
                </button>
              </div>
            )}

            {/* Editor */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="min-h-[400px] rounded-lg border border-gray-800 bg-gray-900/30 p-6 text-gray-200 focus:border-blue-500 focus:outline-none [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-white [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6"
            />

            {/* Export */}
            <div className="mt-4 flex items-center gap-3">
              <span className="text-sm text-gray-400">Export:</span>
              <button
                onClick={() => handleExport("pdf")}
                disabled={exporting}
                className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-50"
              >
                PDF
              </button>
              <button
                onClick={() => handleExport("pptx")}
                disabled={exporting}
                className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-50"
              >
                PPTX
              </button>
              {exporting && (
                <span className="text-xs text-gray-500">Generating export...</span>
              )}
              {exportUrl && (
                <a
                  href={exportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Download Ready
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* New Report Dialog */}
      {showNewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-bold text-white">New Report</h3>
            <div>
              <label className="mb-1 block text-sm text-gray-400">Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Q1 2026 Forecast Summary"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowNewDialog(false);
                  setNewTitle("");
                }}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateReport}
                disabled={!newTitle.trim() || creatingReport}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {creatingReport ? "Creating..." : "Create Report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
