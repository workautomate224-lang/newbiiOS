"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { getLeaderboard } from "@/lib/api";

interface LeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  reputation_score: number;
  prediction_count: number;
}

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, user_id: "u1", display_name: "Alice Chen", avatar_url: null, reputation_score: 2450, prediction_count: 87 },
  { rank: 2, user_id: "u2", display_name: "Bob Martinez", avatar_url: null, reputation_score: 2210, prediction_count: 64 },
  { rank: 3, user_id: "u3", display_name: "Carol Williams", avatar_url: null, reputation_score: 1980, prediction_count: 52 },
  { rank: 4, user_id: "u4", display_name: "David Kim", avatar_url: null, reputation_score: 1755, prediction_count: 43 },
  { rank: 5, user_id: "u5", display_name: "Eva Johnson", avatar_url: null, reputation_score: 1620, prediction_count: 39 },
  { rank: 6, user_id: "u6", display_name: "Frank Zhou", avatar_url: null, reputation_score: 1510, prediction_count: 35 },
  { rank: 7, user_id: "u7", display_name: "Grace Lee", avatar_url: null, reputation_score: 1400, prediction_count: 31 },
  { rank: 8, user_id: "u8", display_name: "Henry Patel", avatar_url: null, reputation_score: 1290, prediction_count: 28 },
  { rank: 9, user_id: "u9", display_name: "Irene Nakamura", avatar_url: null, reputation_score: 1175, prediction_count: 24 },
  { rank: 10, user_id: "u10", display_name: "James Brown", avatar_url: null, reputation_score: 1050, prediction_count: 21 },
];

function getRankBadge(rank: number): string {
  if (rank === 1) return "bg-yellow-600 text-yellow-100";
  if (rank === 2) return "bg-gray-400 text-gray-900";
  if (rank === 3) return "bg-amber-700 text-amber-100";
  return "bg-gray-800 text-gray-400";
}

function getInitial(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLeaderboard()
      .then((data) => {
        if (data && Array.isArray(data) && data.length > 0) {
          setEntries(data);
        } else if (data.leaderboard && Array.isArray(data.leaderboard)) {
          setEntries(data.leaderboard);
        } else {
          setEntries(MOCK_LEADERBOARD);
        }
        setLoading(false);
      })
      .catch(() => {
        setEntries(MOCK_LEADERBOARD);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Leaderboard</h1>
          <p className="mt-1 text-gray-400">Top predictors ranked by reputation score</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/50">
            {/* Header Row */}
            <div className="grid grid-cols-[60px_1fr_120px_100px] gap-4 border-b border-gray-800 px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span>Rank</span>
              <span>User</span>
              <span className="text-right">Reputation</span>
              <span className="text-right">Predictions</span>
            </div>

            {/* Entries */}
            <div className="divide-y divide-gray-800/50">
              {entries.map((entry, idx) => {
                const rank = entry.rank || idx + 1;
                return (
                  <div
                    key={entry.user_id}
                    className="grid grid-cols-[60px_1fr_120px_100px] items-center gap-4 px-4 py-3 transition hover:bg-gray-900/80"
                  >
                    {/* Rank */}
                    <div>
                      <span
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${getRankBadge(rank)}`}
                      >
                        {rank}
                      </span>
                    </div>

                    {/* User */}
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-800 text-xs font-medium text-gray-300">
                        {getInitial(entry.display_name)}
                      </div>
                      <span className="text-sm font-medium text-gray-200">{entry.display_name}</span>
                    </div>

                    {/* Reputation */}
                    <div className="text-right">
                      <span className="font-mono text-sm font-semibold text-amber-400">
                        {entry.reputation_score.toLocaleString()}
                      </span>
                    </div>

                    {/* Prediction Count */}
                    <div className="text-right">
                      <span className="text-sm text-gray-400">{entry.prediction_count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
