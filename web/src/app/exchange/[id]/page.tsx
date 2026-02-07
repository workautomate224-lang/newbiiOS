"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { Header } from "@/components/layout/header";
import { TripleSignal } from "@/components/exchange/TripleSignal";
import type { TripleSignalProps } from "@/components/exchange/TripleSignal";
import { createClient } from "@/lib/supabase/client";
import {
  getMarket,
  getSignals,
  getPriceHistory,
  getOrderbook,
  getPositions,
  placeBet,
} from "@/lib/api";

interface MarketOutcome {
  name: string;
  probability: number;
}

interface MarketData {
  id: string;
  title: string;
  description?: string;
  category: string;
  outcomes: MarketOutcome[];
  prediction_id?: string;
}

interface PricePoint {
  date: string;
  ai: number;
  crowd: number;
  reputation: number;
}

interface OrderbookEntry {
  outcome: string;
  volume: number;
}

interface Position {
  id: string;
  outcome_name: string;
  amount: number;
  entry_price: number;
  potential_profit: number;
}

const DEMO_MARKET: MarketData = {
  id: "demo-1",
  title: "Will AI regulation pass in the US by 2027?",
  description:
    "Resolves YES if comprehensive AI regulation legislation is signed into law in the United States before January 1, 2027.",
  category: "Politics",
  outcomes: [
    { name: "Yes", probability: 0.62 },
    { name: "No", probability: 0.38 },
  ],
  prediction_id: "pred-123",
};

const DEMO_SIGNALS: TripleSignalProps = {
  ai: { outcomes: [{ name: "Yes", probability: 0.58 }] },
  crowd: { outcomes: [{ name: "Yes", probability: 0.65 }] },
  reputation: { outcomes: [{ name: "Yes", probability: 0.63 }] },
  fused: { outcomes: [{ name: "Yes", probability: 0.62 }] },
  anomalies: [
    {
      type: "Signal Divergence",
      severity: "warning",
      details:
        "AI signal diverges from Crowd signal by 7pp. Review recommended.",
    },
  ],
};

const DEMO_PRICE_HISTORY: PricePoint[] = Array.from({ length: 30 }, (_, i) => ({
  date: `Jan ${i + 1}`,
  ai: 0.5 + Math.sin(i / 5) * 0.1 + Math.random() * 0.05,
  crowd: 0.55 + Math.cos(i / 4) * 0.08 + Math.random() * 0.05,
  reputation: 0.52 + Math.sin(i / 6) * 0.12 + Math.random() * 0.04,
}));

const DEMO_ORDERBOOK: OrderbookEntry[] = [
  { outcome: "Yes", volume: 24500 },
  { outcome: "No", volume: 18200 },
];

export default function MarketDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const supabase = createClient();

  const [market, setMarket] = useState<MarketData | null>(null);
  const [signals, setSignals] = useState<TripleSignalProps | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [orderbook, setOrderbook] = useState<OrderbookEntry[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  // Betting state
  const [selectedOutcome, setSelectedOutcome] = useState<string>("");
  const [amount, setAmount] = useState<number>(10);
  const [betting, setBetting] = useState(false);
  const [betError, setBetError] = useState("");
  const [betSuccess, setBetSuccess] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [mkt, sig, ph, ob] = await Promise.allSettled([
        getMarket(id),
        getSignals(id),
        getPriceHistory(id),
        getOrderbook(id),
      ]);

      setMarket(
        mkt.status === "fulfilled" ? mkt.value : DEMO_MARKET
      );
      setSignals(
        sig.status === "fulfilled" ? sig.value : DEMO_SIGNALS
      );
      setPriceHistory(
        ph.status === "fulfilled" && Array.isArray(ph.value)
          ? ph.value
          : DEMO_PRICE_HISTORY
      );
      setOrderbook(
        ob.status === "fulfilled" && Array.isArray(ob.value)
          ? ob.value
          : DEMO_ORDERBOOK
      );

      // Load positions if authenticated
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        try {
          const pos = await getPositions(id, session.access_token);
          setPositions(Array.isArray(pos) ? pos : pos.positions ?? []);
        } catch {
          // Not authenticated or no positions
        }
      }
    } catch {
      setMarket(DEMO_MARKET);
      setSignals(DEMO_SIGNALS);
      setPriceHistory(DEMO_PRICE_HISTORY);
      setOrderbook(DEMO_ORDERBOOK);
    }
    setLoading(false);
  }, [id, supabase.auth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handlePlaceBet() {
    if (!selectedOutcome || amount <= 0) return;
    setBetting(true);
    setBetError("");
    setBetSuccess("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setBetError("Please sign in to place a bet.");
        setBetting(false);
        return;
      }
      await placeBet(
        id,
        { outcome_name: selectedOutcome, amount },
        session.access_token
      );
      setBetSuccess(`Bet placed: ${amount} on ${selectedOutcome}`);
      // Refresh positions
      try {
        const pos = await getPositions(id, session.access_token);
        setPositions(Array.isArray(pos) ? pos : pos.positions ?? []);
      } catch {
        // Ignore
      }
    } catch (err) {
      setBetError(
        err instanceof Error ? err.message : "Failed to place bet"
      );
    }
    setBetting(false);
  }

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

  if (!market) return null;

  const currentPrice = market.outcomes[0]
    ? Math.round(market.outcomes[0].probability * 100)
    : 50;
  const potentialProfit =
    selectedOutcome && amount > 0
      ? Math.round(
          amount *
            (1 /
              (market.outcomes.find((o) => o.name === selectedOutcome)
                ?.probability ?? 0.5) -
              1) *
            100
        ) / 100
      : 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold">{market.title}</h1>
          {market.description && (
            <p className="mt-2 text-sm text-gray-400">{market.description}</p>
          )}
        </div>

        {/* Main Layout: Left (60%) + Right (40%) */}
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Left: Triple Signal + Price Chart */}
          <div className="space-y-6 lg:col-span-3">
            {/* Triple Signal */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
              <h2 className="mb-4 text-lg font-semibold">Triple Signal</h2>
              {signals && <TripleSignal {...signals} />}
            </div>

            {/* Price History Chart */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
              <h2 className="mb-4 text-lg font-semibold">Price History</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={priceHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis
                    dataKey="date"
                    stroke="#6b7280"
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    stroke="#6b7280"
                    tick={{ fontSize: 11 }}
                    domain={[0, 1]}
                    tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#111827",
                      border: "1px solid #374151",
                      borderRadius: "8px",
                      color: "#fff",
                    }}
                    formatter={(value: number | undefined) => [
                      `${Math.round((value ?? 0) * 100)}%`,
                    ]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="ai"
                    name="AI"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="crowd"
                    name="Crowd"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="reputation"
                    name="Reputation"
                    stroke="#a855f7"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Link to Lite Prediction */}
            {market.prediction_id && (
              <Link
                href={`/lite/${market.prediction_id}/result`}
                className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
              >
                View AI Analysis
                <span aria-hidden="true">&rarr;</span>
              </Link>
            )}
          </div>

          {/* Right: Betting Panel */}
          <div className="space-y-6 lg:col-span-2">
            {/* Bet Placement */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
              <h2 className="mb-4 text-lg font-semibold">Place Bet</h2>

              {/* Outcome Selection */}
              <div className="mb-4">
                <label className="mb-2 block text-sm text-gray-400">
                  Select Outcome
                </label>
                <div className="flex gap-2">
                  {market.outcomes.map((o) => (
                    <button
                      key={o.name}
                      onClick={() => setSelectedOutcome(o.name)}
                      className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                        selectedOutcome === o.name
                          ? o.name === "Yes"
                            ? "border-green-500 bg-green-900/30 text-green-400"
                            : "border-red-500 bg-red-900/30 text-red-400"
                          : "border-gray-700 text-gray-400 hover:border-gray-500"
                      }`}
                    >
                      {o.name}
                      <div className="mt-1 text-xs opacity-70">
                        {Math.round(o.probability * 100)}c
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div className="mb-4">
                <label className="mb-2 block text-sm text-gray-400">
                  Amount
                </label>
                <input
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Info */}
              <div className="mb-4 space-y-2 rounded-lg bg-gray-800/50 p-3 text-sm">
                <div className="flex justify-between text-gray-400">
                  <span>Current Price</span>
                  <span className="text-white">{currentPrice}c</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Potential Profit</span>
                  <span className="text-green-400">
                    +{potentialProfit.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Risk</span>
                  <span className="text-red-400">{amount.toFixed(2)}</span>
                </div>
              </div>

              {/* Error / Success */}
              {betError && (
                <p className="mb-3 text-sm text-red-400">{betError}</p>
              )}
              {betSuccess && (
                <p className="mb-3 text-sm text-green-400">{betSuccess}</p>
              )}

              {/* Place Bet Button */}
              <button
                onClick={handlePlaceBet}
                disabled={!selectedOutcome || amount <= 0 || betting}
                className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {betting ? "Placing Bet..." : "Place Bet"}
              </button>
            </div>

            {/* My Positions */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
              <h2 className="mb-4 text-lg font-semibold">My Positions</h2>
              {positions.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No positions in this market yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {positions.map((pos) => (
                    <div
                      key={pos.id}
                      className="flex items-center justify-between rounded-lg bg-gray-800/50 p-3 text-sm"
                    >
                      <div>
                        <span className="font-medium text-white">
                          {pos.outcome_name}
                        </span>
                        <span className="ml-2 text-gray-400">
                          {pos.amount} @ {Math.round(pos.entry_price * 100)}c
                        </span>
                      </div>
                      <span className="text-green-400">
                        +{pos.potential_profit.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom: Orderbook */}
        <div className="mt-8 rounded-xl border border-gray-800 bg-gray-900/50 p-6">
          <h2 className="mb-4 text-lg font-semibold">Orderbook Volume</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={orderbook}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="outcome" stroke="#6b7280" />
              <YAxis
                stroke="#6b7280"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => v.toLocaleString()}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111827",
                  border: "1px solid #374151",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <Bar dataKey="volume" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </main>
    </div>
  );
}
