import { cn } from "@/lib/utils";

interface ProbabilityBarProps {
  label: string;
  probability: number;
  confidence?: number[];
  color?: string;
}

export function ProbabilityBar({ label, probability, confidence, color }: ProbabilityBarProps) {
  const pct = Math.round(probability * 100);
  const barColor = color || (pct > 40 ? "bg-blue-500" : pct > 25 ? "bg-yellow-500" : "bg-gray-500");

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-200">{label}</span>
        <span className="font-mono text-white">{pct}%</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-gray-800">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {confidence && (
        <p className="text-xs text-gray-500">
          CI: {Math.round(confidence[0] * 100)}% — {Math.round(confidence[1] * 100)}%
        </p>
      )}
    </div>
  );
}
