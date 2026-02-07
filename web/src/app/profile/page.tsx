"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { createClient } from "@/lib/supabase/client";
import { getMe, updateMe, getMyPredictions } from "@/lib/api";

interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string;
  reputation_score: number;
  created_at: string;
}

interface PredictionItem {
  id: string;
  query: string;
  status: string;
  is_public: boolean;
  created_at: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [predictions, setPredictions] = useState<PredictionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth/login");
        return;
      }

      try {
        const [profile, preds] = await Promise.all([
          getMe(session.access_token),
          getMyPredictions(session.access_token),
        ]);
        setUser(profile);
        setNameInput(profile.display_name || "");
        setPredictions(preds.predictions || preds || []);
      } catch {
        // Handle error silently
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [router, supabase.auth]);

  async function handleSaveName() {
    if (!nameInput.trim()) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const updated = await updateMe(session.access_token, { display_name: nameInput.trim() });
      setUser(updated);
      setEditingName(false);
    } catch {
      // Handle error silently
    } finally {
      setSaving(false);
    }
  }

  const totalPredictions = predictions.length;
  const publicCount = predictions.filter((p) => p.is_public).length;

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

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <Header />
        <div className="mx-auto max-w-2xl px-4 py-12 text-center">
          <h1 className="mb-4 text-2xl font-bold">Sign in required</h1>
          <p className="mb-6 text-gray-400">You need to be signed in to view your profile.</p>
          <Link
            href="/auth/login"
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* Profile Header */}
        <div className="mb-8 rounded-xl border border-gray-800 bg-gray-900/50 p-6">
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-2xl font-bold text-white">
              {(user.display_name || user.email)?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex-1">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    placeholder="Display name"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={saving}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => {
                      setEditingName(false);
                      setNameInput(user.display_name || "");
                    }}
                    className="rounded-md px-3 py-1.5 text-sm text-gray-400 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold">{user.display_name || "Anonymous"}</h1>
                  <button
                    onClick={() => setEditingName(true)}
                    className="text-gray-500 hover:text-white"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </button>
                </div>
              )}
              <p className="text-sm text-gray-400">{user.email}</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-center">
            <p className="text-2xl font-bold text-blue-400">{totalPredictions}</p>
            <p className="text-xs text-gray-500">Total Predictions</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-center">
            <p className="text-2xl font-bold text-green-400">{publicCount}</p>
            <p className="text-xs text-gray-500">Public</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-center">
            <p className="text-2xl font-bold text-amber-400">{user.reputation_score ?? 0}</p>
            <p className="text-xs text-gray-500">Reputation</p>
          </div>
        </div>

        {/* Prediction History */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Prediction History
          </h2>
          {predictions.length === 0 ? (
            <div className="py-8 text-center">
              <p className="mb-4 text-gray-500">No predictions yet</p>
              <Link
                href="/lite"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Make your first prediction
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {predictions.map((pred) => (
                <Link
                  key={pred.id}
                  href={
                    pred.status === "completed"
                      ? `/lite/${pred.id}/result`
                      : pred.status === "processing"
                      ? `/lite/${pred.id}/progress`
                      : `/lite`
                  }
                  className="flex items-center justify-between rounded-lg border border-gray-800 p-4 transition hover:border-gray-700 hover:bg-gray-900/80"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-200">{pred.query}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {new Date(pred.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    {pred.is_public && (
                      <span className="rounded-full bg-green-900/50 px-2 py-0.5 text-xs text-green-400">
                        Public
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        pred.status === "completed"
                          ? "bg-green-900/50 text-green-400"
                          : pred.status === "processing"
                          ? "bg-blue-900/50 text-blue-400"
                          : pred.status === "failed"
                          ? "bg-red-900/50 text-red-400"
                          : "bg-gray-800 text-gray-400"
                      }`}
                    >
                      {pred.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
