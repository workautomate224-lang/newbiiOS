"use client";

interface OutcomeProbability {
  name: string;
  probability: number;
}

interface SignalSource {
  outcomes: OutcomeProbability[];
}

interface Anomaly {
  type: string;
  severity: string;
  details: string;
}

export interface TripleSignalProps {
  ai: SignalSource;
  crowd: SignalSource;
  reputation: SignalSource;
  fused: SignalSource;
  anomalies?: Anomaly[];
}

function SignalBar({
  label,
  color,
  probability,
}: {
  label: string;
  color: string;
  probability: number;
}) {
  const pct = Math.round(probability * 100);
  const bgMap: Record<string, string> = {
    blue: "bg-blue-500",
    green: "bg-green-500",
    purple: "bg-purple-500",
    amber: "bg-amber-500",
  };
  const textMap: Record<string, string> = {
    blue: "text-blue-400",
    green: "text-green-400",
    purple: "text-purple-400",
    amber: "text-amber-400",
  };

  return (
    <div className="flex-1">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className={`font-medium ${textMap[color] ?? "text-gray-400"}`}>
          {label}
        </span>
        <span className="font-mono text-white">{pct}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-gray-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${bgMap[color] ?? "bg-gray-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function TripleSignal({
  ai,
  crowd,
  reputation,
  fused,
  anomalies,
}: TripleSignalProps) {
  const aiProb = ai.outcomes[0]?.probability ?? 0;
  const crowdProb = crowd.outcomes[0]?.probability ?? 0;
  const repProb = reputation.outcomes[0]?.probability ?? 0;
  const fusedProb = fused.outcomes[0]?.probability ?? 0;

  return (
    <div className="space-y-4">
      {/* Anomaly Warnings */}
      {anomalies && anomalies.length > 0 && (
        <div className="space-y-2">
          {anomalies.map((a, i) => (
            <div
              key={i}
              className={`rounded-lg border px-4 py-2 text-sm ${
                a.severity === "critical"
                  ? "border-red-700 bg-red-900/30 text-red-300"
                  : "border-yellow-700 bg-yellow-900/30 text-yellow-300"
              }`}
            >
              <span className="font-semibold uppercase">{a.type}:</span>{" "}
              {a.details}
            </div>
          ))}
        </div>
      )}

      {/* Three Signals Side by Side */}
      <div className="flex gap-4">
        <SignalBar label="AI Signal" color="blue" probability={aiProb} />
        <SignalBar label="Crowd Signal" color="green" probability={crowdProb} />
        <SignalBar
          label="Reputation Signal"
          color="purple"
          probability={repProb}
        />
      </div>

      {/* Fused Signal - Larger */}
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-semibold text-amber-400">Fused Signal</span>
          <span className="text-lg font-bold text-white">
            {Math.round(fusedProb * 100)}%
          </span>
        </div>
        <div className="h-5 overflow-hidden rounded-full bg-gray-800">
          <div
            className="h-full rounded-full bg-amber-500 transition-all duration-500"
            style={{ width: `${Math.round(fusedProb * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
