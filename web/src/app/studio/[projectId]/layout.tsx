"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getProject } from "@/lib/api";

const TABS = [
  { key: "data", label: "Data" },
  { key: "population", label: "Population" },
  { key: "scenario", label: "Scenario" },
  { key: "simulation", label: "Simulation" },
  { key: "report", label: "Report" },
];

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>();
  const pathname = usePathname();
  const [projectName, setProjectName] = useState("Loading...");
  const supabase = createClient();

  // Determine active tab from pathname
  const pathSegments = pathname?.split("/") ?? [];
  const activeTab = pathSegments[3] ?? "data";

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !projectId) return;
      try {
        const project = await getProject(projectId, session.access_token);
        setProjectName(project.name ?? "Untitled Project");
      } catch {
        setProjectName("Project");
      }
    }
    load();
  }, [projectId, supabase.auth]);

  return (
    <div className="flex h-full flex-col">
      {/* Project Header */}
      <div className="border-b border-gray-800 bg-gray-950 px-6 pt-4">
        <div className="mb-3 flex items-center gap-3">
          <Link href="/studio" className="text-sm text-gray-500 hover:text-gray-300">
            Projects
          </Link>
          <span className="text-gray-700">/</span>
          <h1 className="text-lg font-semibold text-white">{projectName}</h1>
        </div>

        {/* Tabs */}
        <nav className="flex gap-0">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={`/studio/${projectId}/${tab.key}`}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                activeTab === tab.key
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-gray-400 hover:border-gray-600 hover:text-gray-200"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
