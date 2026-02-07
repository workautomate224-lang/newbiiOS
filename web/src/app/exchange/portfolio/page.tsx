"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { createClient } from "@/lib/supabase/client";
import { getPortfolio } from "@/lib/api";

interface ActivePosition {
  id: string;
  market_id: string;
  market_title: string;
  outcome_name: string;
  amount: number;
  entry_price: number;
  current_price: number;
  potential_profit: number;
}

interface SettledPosition {
  id: string;
  market_id: string;
  market_title: string;
  outcome_name: string;
  amount: number;
  payout: number;
  pnl: number;
}

interface PortfolioData {
  balance: number;
  total_invested: number;
  active_positions: ActivePosition[];
  settled_positions: SettledPosition[];
}

const DEMO_PORTFOLIO: PortfolioData = {
  balance: 4250.0,
  total_invested: 1750.0,
  active_positions: [
    {
      id: "pos-1",
      market_id: "demo-1",
      market_title: "Will AI regulation pass in the US by 2027?",
      outcome_name: "Yes",
      amount: 500,
      entry_price: 0.55,
      current_price: 0.62,
      potential_profit: 409.09,
    },
    {
      id: "pos-2",
      market_id: "demo-2",
      market_title: "Bitcoin exceeds $200K by end of 2026?",
      outcome_name: "No",
      amount: 300,
      entry_price: 0.6,
      current_price: 0.66,
      potential_profit: 200.0,
    },
    {
      id: "pos-3",
      market_id: "demo-3",
      market_title: "Global GDP growth exceeds 3.5% in 2027?",
      outcome_name: "Yes",
      amount: 200,
      entry_price: 0.4,
      current_price: 0.45,
      potential_profit: 244.44,
    },
  ],
  settled_positions: [
    {
      id: "set-1",
      market_id: "set-market-1",
      market_title: "Fed rate cut in March 2026?",
      outcome_name: "Yes",
      amount: 400,
      payout: 720,
      pnl: 320,
    },
    {
      id: "set-2",
      market_id: "set-market-2",
      market_title: "Tesla stock above $500 by Feb 2026?",
      outcome_name: "No",
      amount: 250,
      payout: 0,
      pnl: -250,
    },
  ],
};

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth/login");
        return;
      }
      try {
        const data = await getPortfolio(session.access_token);
        setPortfolio(data);
      } catch {
        setPortfolio(DEMO_PORTFOLIO);
      }
      setLoading(false);
    }
    load();
  }, [router, supabase.auth]);

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

  if (!portfolio) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />

      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-8 text-3xl font-bold">Portfolio</h1>

        {/* Stats Cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          {/* Balance */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
            <p className="text-sm text-gray-400">Balance</p>
            <p className="mt-1 text-3xl font-bold text-white">
              ${portfolio.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>

          {/* Total Invested */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
            <p className="text-sm text-gray-400">Total Invested</p>
            <p className="mt-1 text-3xl font-bold text-blue-400">
              ${portfolio.total_invested.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>

          {/* Active Positions Count */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
            <p className="text-sm text-gray-400">Active Positions</p>
            <p className="mt-1 text-3xl font-bold text-amber-400">
              {portfolio.active_positions.length}
            </p>
          </div>
        </div>

        {/* Active Positions */}
        <div className="mb-8">
          <h2 className="mb-4 text-xl font-semibold">Active Positions</h2>
          {portfolio.active_positions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-700 py-12 text-center text-gray-500">
              No active positions.{" "}
              <Link href="/exchange" className="text-blue-400 hover:underline">
                Browse markets
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-800">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-800 bg-gray-900/80">
                  <tr>
                    <th className="px-4 py-3 font-medium text-gray-400">
                      Market
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-400">
                      Outcome
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-400 text-right">
                      Amount
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-400 text-right">
                      Price
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-400 text-right">
                      Potential Profit
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {portfolio.active_positions.map((pos) => (
                    <tr
                      key={pos.id}
                      className="transition hover:bg-gray-900/50"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/exchange/${pos.market_id}`}
                          className="text-white hover:text-blue-400"
                        >
                          {pos.market_title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {pos.outcome_name}
                      </td>
                      <td className="px-4 py-3 text-right text-white">
                        ${pos.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">
                        {Math.round(pos.current_price * 100)}c
                      </td>
                      <td className="px-4 py-3 text-right text-green-400">
                        +${pos.potential_profit.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Settled Positions */}
        <div>
          <h2 className="mb-4 text-xl font-semibold">Settled Positions</h2>
          {portfolio.settled_positions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-700 py-12 text-center text-gray-500">
              No settled positions yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-800">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-800 bg-gray-900/80">
                  <tr>
                    <th className="px-4 py-3 font-medium text-gray-400">
                      Market
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-400">
                      Outcome
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-400 text-right">
                      Amount
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-400 text-right">
                      Payout
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-400 text-right">
                      P&L
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {portfolio.settled_positions.map((pos) => (
                    <tr
                      key={pos.id}
                      className="transition hover:bg-gray-900/50"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/exchange/${pos.market_id}`}
                          className="text-white hover:text-blue-400"
                        >
                          {pos.market_title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {pos.outcome_name}
                      </td>
                      <td className="px-4 py-3 text-right text-white">
                        ${pos.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-white">
                        ${pos.payout.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            pos.pnl >= 0
                              ? "bg-green-900/50 text-green-400"
                              : "bg-red-900/50 text-red-400"
                          }`}
                        >
                          {pos.pnl >= 0 ? "+" : ""}
                          ${pos.pnl.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
