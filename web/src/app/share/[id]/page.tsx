"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { CausalGraph } from "@/components/causal-graph/CausalGraph";
import { ProbabilityBar } from "@/components/ui/probability-bar";
import { getPredictionResult } from "@/lib/api";

interface Outcome {
  name: string;
  probability: number;
  confidence_interval: number[];
}

interface GraphNode {
  id: string;
  label: string;
  probability: number;
  confidence: number;
  category: string;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: string;
  description: string;
}

// Note: For OG meta tags, a separate generateMetadata in a server component layout
// or route handler would be needed. This client component provides the visual page.

export default function SharePage() {
  const { id } = useParams<{ id: string }>();
  const [query, setQuery] = useState("");
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [causalGraph, setCausalGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({
    nodes: [],
    edges: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Set document title when query loads
  useEffect(() => {
    if (query) {
      document.title = `${query} - FutureOS Prediction`;
    }
  }, [query]);

  useEffect(() => {
    if (!id) return;
    getPredictionResult(id)
      .then((data) => {
        setQuery(data.query);
        setOutcomes(data.outcomes || []);
        setCausalGraph({
          nodes: data.causal_graph?.nodes || [],
          edges: data.causal_graph?.edges || [],
        });
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

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

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <Header />
        <div className="mx-auto max-w-2xl px-4 py-12 text-center">
          <div className="rounded-lg border border-red-800 bg-red-900/20 p-6 text-red-400">
            <h2 className="mb-2 font-semibold">Prediction not found</h2>
            <p>{error}</p>
          </div>
          <Link
            href="/lite"
            className="mt-6 inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
          >
            Try FutureOS
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* OG Meta tags require a server-side layout.tsx with generateMetadata for SSR.
          Document title is set via useEffect above for the client-side experience. */}
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="mb-2 text-sm font-medium text-blue-400 uppercase tracking-wider">
            FutureOS Prediction
          </p>
          <h1 className="mb-2 text-2xl font-bold md:text-3xl">{query}</h1>
          <p className="text-sm text-gray-500">
            AI-powered causal analysis with multi-engine reasoning
          </p>
        </div>

        {/* Outcomes */}
        <div className="mb-8 rounded-xl border border-gray-800 bg-gray-900/50 p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Predicted Outcomes
          </h2>
          <div className="space-y-4">
            {outcomes.map((o, i) => (
              <ProbabilityBar
                key={i}
                label={o.name}
                probability={o.probability}
                confidence={o.confidence_interval}
                color={i === 0 ? "bg-blue-500" : i === 1 ? "bg-yellow-500" : "bg-gray-500"}
              />
            ))}
          </div>
        </div>

        {/* Causal Graph */}
        {causalGraph.nodes.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Causal Graph
            </h2>
            <CausalGraph
              nodes={causalGraph.nodes}
              edges={causalGraph.edges}
              height={400}
            />
          </div>
        )}

        {/* CTA */}
        <div className="rounded-xl border border-gray-800 bg-gradient-to-br from-blue-900/20 to-purple-900/20 p-8 text-center">
          <h2 className="mb-2 text-xl font-bold">Make your own prediction</h2>
          <p className="mb-6 text-gray-400">
            FutureOS uses multi-engine AI reasoning to predict future events with causal analysis.
          </p>
          <Link
            href="/lite"
            className="inline-block rounded-lg bg-blue-600 px-8 py-3 font-medium text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
          >
            Try FutureOS
          </Link>
        </div>
      </main>
    </div>
  );
}
