"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getProjects, createProject } from "@/lib/api";
import { Header } from "@/components/layout/header";

interface Project {
  id: string;
  name: string;
  status: string;
}

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth/login");
        return;
      }
      try {
        const data = await getProjects(session.access_token);
        setProjects(Array.isArray(data) ? data : data.projects ?? []);
      } catch {
        // API may not be ready yet; show empty state
      }
      setLoading(false);
    }
    init();
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
      setProjects((prev) => [...prev, project]);
      setShowNewDialog(false);
      setNewName("");
      setNewDesc("");
      router.push(`/studio/${project.id}/data`);
    } catch {
      // Handle error silently
    } finally {
      setCreating(false);
    }
  }

  // Extract current project ID from pathname
  const pathParts = pathname?.split("/") ?? [];
  const currentProjectId = pathParts.length >= 3 ? pathParts[2] : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Sidebar */}
        <aside className="flex w-64 flex-col border-r border-gray-800 bg-gray-900">
          <div className="border-b border-gray-800 px-4 py-4">
            <h2 className="text-lg font-bold text-white">Studio</h2>
            <p className="text-xs text-gray-500">Simulation Projects</p>
          </div>

          <nav className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              </div>
            ) : projects.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-gray-500">No projects yet</p>
            ) : (
              <ul className="space-y-1">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/studio/${p.id}/data`}
                      className={`block rounded-lg px-3 py-2 text-sm transition ${
                        currentProjectId === p.id
                          ? "bg-blue-600/20 text-blue-400"
                          : "text-gray-300 hover:bg-gray-800 hover:text-white"
                      }`}
                    >
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="text-xs text-gray-500">{p.status ?? "draft"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </nav>

          <div className="border-t border-gray-800 p-3">
            <button
              onClick={() => setShowNewDialog(true)}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              + New Project
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      {/* New Project Dialog */}
      {showNewDialog && (
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
                  setShowNewDialog(false);
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
