"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { getPredictionAgents } from "@/lib/api";

interface Agent {
  id: number;
  age: number;
  region: string;
  ethnicity: string;
  income_level: string;
  education: string;
  stance: string;
  influence: number;
  connections: number[];
  stance_history: { tick: number; stance: string }[];
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface SimulationData {
  agents: Agent[];
  ticks: number;
  summary: {
    total_agents: number;
    government_pct: number;
    opposition_pct: number;
    neutral_pct: number;
  };
}

const STANCE_COLORS: Record<string, string> = {
  government: "#3b82f6",
  opposition: "#ef4444",
  neutral: "#6b7280",
  undecided: "#a855f7",
};

const STANCE_LABELS: Record<string, string> = {
  government: "Government",
  opposition: "Opposition",
  neutral: "Neutral",
  undecided: "Undecided",
};

function generateMockAgents(): SimulationData {
  const agents: Agent[] = [];
  const stances = ["government", "opposition", "neutral"];
  const regions = ["Urban", "Suburban", "Rural"];
  const ethnicities = ["Group A", "Group B", "Group C", "Group D"];
  const educations = ["High School", "Bachelor", "Master", "PhD"];
  const incomes = ["Low", "Middle", "High"];

  for (let i = 0; i < 100; i++) {
    const stance = stances[Math.floor(Math.random() * stances.length)];
    const influence = 0.3 + Math.random() * 0.7;
    const connections: number[] = [];
    const numConnections = Math.floor(Math.random() * 5) + 1;
    for (let c = 0; c < numConnections; c++) {
      const target = Math.floor(Math.random() * 100);
      if (target !== i && !connections.includes(target)) {
        connections.push(target);
      }
    }

    agents.push({
      id: i,
      age: 18 + Math.floor(Math.random() * 62),
      region: regions[Math.floor(Math.random() * regions.length)],
      ethnicity: ethnicities[Math.floor(Math.random() * ethnicities.length)],
      income_level: incomes[Math.floor(Math.random() * incomes.length)],
      education: educations[Math.floor(Math.random() * educations.length)],
      stance,
      influence,
      connections,
      stance_history: [
        { tick: 0, stance: "neutral" },
        { tick: 5, stance },
      ],
      x: Math.random() * 700 + 50,
      y: Math.random() * 400 + 50,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
    });
  }

  const govCount = agents.filter((a) => a.stance === "government").length;
  const oppCount = agents.filter((a) => a.stance === "opposition").length;
  const neuCount = agents.filter((a) => a.stance === "neutral").length;

  return {
    agents,
    ticks: 50,
    summary: {
      total_agents: 100,
      government_pct: govCount / 100,
      opposition_pct: oppCount / 100,
      neutral_pct: neuCount / 100,
    },
  };
}

export default function AgentsPage() {
  const { id } = useParams<{ id: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const [simData, setSimData] = useState<SimulationData | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentTick, setCurrentTick] = useState(0);
  const [maxTicks, setMaxTicks] = useState(50);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  const currentTickRef = useRef(currentTick);
  const agentsRef = useRef(agents);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    currentTickRef.current = currentTick;
  }, [currentTick]);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  // Load agents data
  useEffect(() => {
    if (!id) return;
    getPredictionAgents(id)
      .then((data) => {
        const processed = processAgentData(data);
        setSimData(processed);
        setAgents(processed.agents);
        setMaxTicks(processed.ticks);
        setLoading(false);
      })
      .catch(() => {
        // Fallback to mock data
        const mock = generateMockAgents();
        setSimData(mock);
        setAgents(mock.agents);
        setMaxTicks(mock.ticks);
        setLoading(false);
      });
  }, [id]);

  function processAgentData(data: Record<string, unknown>): SimulationData {
    if (data.agents && Array.isArray(data.agents)) {
      const rawAgents = data.agents as Record<string, unknown>[];
      const processed: Agent[] = rawAgents.map((a, i) => ({
        id: (a.id as number) ?? i,
        age: (a.age as number) ?? 30,
        region: (a.region as string) ?? "Unknown",
        ethnicity: (a.ethnicity as string) ?? "Unknown",
        income_level: (a.income_level as string) ?? "Unknown",
        education: (a.education as string) ?? "Unknown",
        stance: (a.stance as string) ?? "neutral",
        influence: (a.influence as number) ?? 0.5,
        connections: (a.connections as number[]) ?? [],
        stance_history: (a.stance_history as { tick: number; stance: string }[]) ?? [],
        x: Math.random() * 700 + 50,
        y: Math.random() * 400 + 50,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
      }));

      const govCount = processed.filter((a) => a.stance === "government").length;
      const oppCount = processed.filter((a) => a.stance === "opposition").length;
      const neuCount = processed.filter((a) => a.stance === "neutral").length;
      const total = processed.length || 1;

      return {
        agents: processed,
        ticks: (data.ticks as number) ?? 50,
        summary: (data.summary as SimulationData["summary"]) ?? {
          total_agents: total,
          government_pct: govCount / total,
          opposition_pct: oppCount / total,
          neutral_pct: neuCount / total,
        },
      };
    }
    return generateMockAgents();
  }

  // Canvas rendering
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    // Clear
    ctx.fillStyle = "#030712";
    ctx.fillRect(0, 0, w, h);

    const currentAgents = agentsRef.current;

    // Draw connections (semi-transparent)
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = "#6b7280";
    ctx.lineWidth = 0.5;
    for (const agent of currentAgents) {
      for (const connId of agent.connections) {
        const target = currentAgents.find((a) => a.id === connId);
        if (target) {
          ctx.beginPath();
          ctx.moveTo(agent.x * (w / 800), agent.y * (h / 500));
          ctx.lineTo(target.x * (w / 800), target.y * (h / 500));
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;

    // Draw agents
    for (const agent of currentAgents) {
      const color = STANCE_COLORS[agent.stance] || STANCE_COLORS.neutral;
      const radius = 3 + agent.influence * 6;
      const sx = agent.x * (w / 800);
      const sy = agent.y * (h / 500);

      // Glow effect
      ctx.beginPath();
      ctx.arc(sx, sy, radius + 2, 0, Math.PI * 2);
      ctx.fillStyle = color + "30";
      ctx.fill();

      // Agent circle
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Highlight selected
      if (selectedAgent && selectedAgent.id === agent.id) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [selectedAgent]);

  // Animation loop
  useEffect(() => {
    if (!canvasRef.current || agents.length === 0) return;

    let lastTime = 0;
    const step = (timestamp: number) => {
      if (!lastTime) lastTime = timestamp;
      const delta = timestamp - lastTime;

      if (playingRef.current && delta > 50 / speedRef.current) {
        lastTime = timestamp;

        setAgents((prev) => {
          const updated = prev.map((a) => {
            let newX = a.x + a.vx * speedRef.current;
            let newY = a.y + a.vy * speedRef.current;
            let newVx = a.vx;
            let newVy = a.vy;

            // Boundary bounce
            if (newX < 20 || newX > 780) {
              newVx = -newVx;
              newX = Math.max(20, Math.min(780, newX));
            }
            if (newY < 20 || newY > 480) {
              newVy = -newVy;
              newY = Math.max(20, Math.min(480, newY));
            }

            // Small random drift
            newVx += (Math.random() - 0.5) * 0.1;
            newVy += (Math.random() - 0.5) * 0.1;
            newVx = Math.max(-2, Math.min(2, newVx));
            newVy = Math.max(-2, Math.min(2, newVy));

            return { ...a, x: newX, y: newY, vx: newVx, vy: newVy };
          });
          return updated;
        });

        setCurrentTick((prev) => {
          if (prev >= maxTicks) {
            setPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }

      drawCanvas();
      animFrameRef.current = requestAnimationFrame(step);
    };

    animFrameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [agents.length, maxTicks, drawCanvas]);

  // Handle canvas click
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const w = rect.width;
      const h = rect.height;

      let closest: Agent | null = null;
      let closestDist = Infinity;

      for (const agent of agentsRef.current) {
        const sx = agent.x * (w / 800);
        const sy = agent.y * (h / 500);
        const dist = Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2);
        if (dist < 15 && dist < closestDist) {
          closest = agent;
          closestDist = dist;
        }
      }

      if (closest) {
        setSelectedAgent(closest);
        setShowDialog(true);
      } else {
        setShowDialog(false);
        setSelectedAgent(null);
      }
    },
    []
  );

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

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link href={`/lite/${id}/result`} className="mb-2 inline-block text-sm text-gray-400 hover:text-white">
              &larr; Back to Result
            </Link>
            <h1 className="text-xl font-bold">Agent Simulation</h1>
            <p className="text-sm text-gray-500">
              {simData?.summary.total_agents || 100} synthetic agents modeling population dynamics
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          {/* Canvas */}
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/30">
              <canvas
                ref={canvasRef}
                className="h-[500px] w-full cursor-crosshair"
                onClick={handleCanvasClick}
              />
            </div>

            {/* Playback Controls */}
            <div className="flex items-center gap-4 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <button
                onClick={() => setPlaying(!playing)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700"
              >
                {playing ? (
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <rect x="5" y="4" width="3" height="12" rx="1" />
                    <rect x="12" y="4" width="3" height="12" rx="1" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                )}
              </button>

              {/* Speed buttons */}
              <div className="flex gap-1">
                {[1, 2, 5, 10].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      speed === s
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:text-white"
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>

              {/* Tick progress bar */}
              <div className="flex flex-1 items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={maxTicks}
                  value={currentTick}
                  onChange={(e) => setCurrentTick(parseInt(e.target.value))}
                  className="flex-1 accent-blue-500"
                />
                <span className="text-xs text-gray-500 font-mono w-16 text-right">
                  {currentTick}/{maxTicks}
                </span>
              </div>

              {/* Reset */}
              <button
                onClick={() => {
                  setPlaying(false);
                  setCurrentTick(0);
                }}
                className="rounded-md bg-gray-800 px-3 py-1.5 text-xs text-gray-400 hover:text-white"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Side Panel */}
          <div className="space-y-4">
            {/* Legend */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <h2 className="mb-3 text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Stance Distribution
              </h2>
              <div className="space-y-3">
                {simData &&
                  [
                    { key: "government", pct: simData.summary.government_pct },
                    { key: "opposition", pct: simData.summary.opposition_pct },
                    { key: "neutral", pct: simData.summary.neutral_pct },
                  ].map((s) => (
                    <div key={s.key}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: STANCE_COLORS[s.key] }}
                          />
                          <span className="text-gray-300">{STANCE_LABELS[s.key]}</span>
                        </div>
                        <span className="font-mono text-xs text-gray-500">
                          {Math.round(s.pct * 100)}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.round(s.pct * 100)}%`,
                            backgroundColor: STANCE_COLORS[s.key],
                          }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Simulation Info */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <h2 className="mb-3 text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Simulation Info
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Agents</span>
                  <span className="text-gray-200">{simData?.summary.total_agents || 100}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Ticks</span>
                  <span className="text-gray-200">{maxTicks}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Current Tick</span>
                  <span className="text-gray-200">{currentTick}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Speed</span>
                  <span className="text-gray-200">{speed}x</span>
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <h2 className="mb-2 text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Controls
              </h2>
              <ul className="space-y-1 text-xs text-gray-500">
                <li>Click an agent circle to view its profile</li>
                <li>Use Play/Pause to control the simulation</li>
                <li>Adjust speed with 1x/2x/5x/10x buttons</li>
                <li>Drag the progress bar to scrub through time</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Agent Detail Dialog */}
        {showDialog && selectedAgent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="mx-4 w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold">Agent #{selectedAgent.id}</h3>
                <button
                  onClick={() => {
                    setShowDialog(false);
                    setSelectedAgent(null);
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-4 flex items-center gap-3">
                <div
                  className="h-12 w-12 rounded-full"
                  style={{ backgroundColor: STANCE_COLORS[selectedAgent.stance] || "#6b7280" }}
                />
                <div>
                  <p className="font-medium">
                    {STANCE_LABELS[selectedAgent.stance] || selectedAgent.stance}
                  </p>
                  <p className="text-sm text-gray-400">
                    Influence: {(selectedAgent.influence * 100).toFixed(0)}%
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b border-gray-800 pb-2">
                  <span className="text-gray-400">Age</span>
                  <span className="text-gray-200">{selectedAgent.age}</span>
                </div>
                <div className="flex justify-between border-b border-gray-800 pb-2">
                  <span className="text-gray-400">Region</span>
                  <span className="text-gray-200">{selectedAgent.region}</span>
                </div>
                <div className="flex justify-between border-b border-gray-800 pb-2">
                  <span className="text-gray-400">Ethnicity</span>
                  <span className="text-gray-200">{selectedAgent.ethnicity}</span>
                </div>
                <div className="flex justify-between border-b border-gray-800 pb-2">
                  <span className="text-gray-400">Education</span>
                  <span className="text-gray-200">{selectedAgent.education}</span>
                </div>
                <div className="flex justify-between border-b border-gray-800 pb-2">
                  <span className="text-gray-400">Income</span>
                  <span className="text-gray-200">{selectedAgent.income_level}</span>
                </div>
                <div className="flex justify-between border-b border-gray-800 pb-2">
                  <span className="text-gray-400">Connections</span>
                  <span className="text-gray-200">{selectedAgent.connections.length}</span>
                </div>
              </div>

              {/* Stance History */}
              {selectedAgent.stance_history.length > 0 && (
                <div className="mt-4">
                  <h4 className="mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Stance History
                  </h4>
                  <div className="space-y-1">
                    {selectedAgent.stance_history.map((h, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-gray-500 font-mono w-12">T={h.tick}</span>
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: STANCE_COLORS[h.stance] || "#6b7280" }}
                        />
                        <span className="text-gray-300">
                          {STANCE_LABELS[h.stance] || h.stance}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
