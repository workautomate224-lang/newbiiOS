"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProjects, createProject } from "@/lib/api";

interface Project {
  id: string;
  name: string;
  description?: string;
  status?: string;
  created_at?: string;
}

export default function StudioPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth/login");
        return;
      }
      try {
        const data = await getProjects(session.access_token);
        setProjects(Array.isArray(data) ? data : data.projects ?? []);
      } catch {
        // API may not be ready; show empty state
      }
      setLoading(false);
    }
    load();
  }, [router, supabase.auth]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const project = await createProject(
        { name: newName.trim(), description: newDesc.trim() || undefined },
        session.access_token
      );
      setShowDialog(false);
      setNewName("");
      setNewDesc("");
      router.push(`/studio/${project.id}/data`);
    } catch {
      // Handle silently
    } finally {
      setCreating(false);
    }
  }

  function statusColor(status?: string) {
    switch (status) {
      case "active":
        return "bg-green-900/50 text-green-400";
      case "completed":
        return "bg-blue-900/50 text-blue-400";
      case "archived":
        return "bg-gray-700/50 text-gray-400";
      default:
        return "bg-yellow-900/50 text-yellow-400";
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
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-sm text-gray-500">Manage your simulation projects</p>
        </div>
        <button
          onClick={() => setShowDialog(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-700 py-24">
          <div className="mb-4 text-6xl text-gray-700">[ ]</div>
          <h2 className="mb-2 text-lg font-semibold text-gray-400">No projects yet</h2>
          <p className="mb-6 text-sm text-gray-500">
            Create your first simulation project to get started with FutureOS Studio.
          </p>
          <button
            onClick={() => setShowDialog(true)}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Create First Project
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => router.push(`/studio/${p.id}/data`)}
              className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 text-left transition hover:border-gray-600 hover:bg-gray-900/80"
            >
              <div className="mb-3 flex items-start justify-between">
                <h3 className="font-semibold text-white">{p.name}</h3>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(p.status)}`}>
                  {p.status ?? "draft"}
                </span>
              </div>
              {p.description && (
                <p className="mb-3 line-clamp-2 text-sm text-gray-400">{p.description}</p>
              )}
              <p className="text-xs text-gray-600">
                {p.created_at ? new Date(p.created_at).toLocaleDateString() : "Just now"}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-bold text-white">Create New Project</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-gray-400">Project Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. 2026 Election Forecast"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-400">Description (optional)</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Briefly describe this project..."
                  rows={3}
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDialog(false);
                  setNewName("");
                  setNewDesc("");
                }}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
