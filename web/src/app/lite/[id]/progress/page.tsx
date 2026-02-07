"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { StageProgress } from "@/components/ui/stage-progress";
import { getPrediction } from "@/lib/api";

export default function ProgressPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState("processing");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;

    // Poll prediction status every 2 seconds
    const interval = setInterval(async () => {
      try {
        const pred = await getPrediction(id);
        setStatus(pred.status);
        setQuery(pred.query || "");

        if (pred.status === "completed") {
          clearInterval(interval);
          router.push(`/lite/${id}/result`);
        }
        if (pred.status === "failed") {
          clearInterval(interval);
          setError(pred.error || "Prediction failed");
        }
      } catch {
        // Prediction might not be ready yet
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [id, router]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-8">
          <h1 className="mb-2 text-2xl font-bold">Processing Prediction</h1>
          {query && (
            <p className="text-gray-400">&ldquo;{query}&rdquo;</p>
          )}
        </div>

        <StageProgress currentStatus={status} />

        {/* Stage 5 detail note */}
        {(status === "stage_4_done" ||
          status === "stage_5a_done" ||
          status === "stage_5b_done" ||
          status === "stage_5c_done") && (
          <div className="mt-6 rounded-lg border border-blue-900/50 bg-blue-900/10 p-4">
            <p className="text-sm text-blue-400">
              Deep Reasoning is running three engines in parallel: Graph-of-Thought reasoning,
              Monte Carlo Tree Search path exploration, and Multi-role Debate analysis.
            </p>
          </div>
        )}

        {status !== "completed" && status !== "failed" && (
          <div className="mt-8 flex items-center gap-3 text-sm text-gray-400">
            <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            Processing... this may take a few minutes.
          </div>
        )}

        {error && (
          <div className="mt-8 rounded-lg border border-red-800 bg-red-900/20 p-4 text-red-400">
            {error}
          </div>
        )}

        <button
          onClick={() => router.push("/lite")}
          className="mt-8 text-sm text-gray-500 hover:text-white"
        >
          &larr; Back to Lite
        </button>
      </main>
    </div>
  );
}
