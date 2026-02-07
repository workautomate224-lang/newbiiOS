import { cn } from "@/lib/utils";

interface Stage {
  key: string;
  label: string;
  subStages?: { key: string; label: string }[];
}

const STAGES: Stage[] = [
  { key: "stage_1_done", label: "Intent Parsing" },
  { key: "stage_2_done", label: "Data Collection" },
  { key: "stage_3_done", label: "Population Synthesis" },
  { key: "stage_4_done", label: "Simulation" },
  {
    key: "stage_5_done",
    label: "Deep Reasoning",
    subStages: [
      { key: "stage_5a_done", label: "GoT Graph Reasoning" },
      { key: "stage_5b_done", label: "MCTS Path Search" },
      { key: "stage_5c_done", label: "Multi-role Debate" },
    ],
  },
  { key: "stage_6_done", label: "Explanation Generation" },
  { key: "completed", label: "Complete" },
];

interface StageProgressProps {
  currentStatus: string;
}

function getStageIndex(statusKey: string): number {
  // Check for sub-stage statuses
  if (statusKey === "stage_5a_done") return 4.1;
  if (statusKey === "stage_5b_done") return 4.2;
  if (statusKey === "stage_5c_done") return 4.3;

  const idx = STAGES.findIndex((s) => s.key === statusKey);
  return idx >= 0 ? idx : -1;
}

function getStageState(stageIdx: number, currentIdx: number): "done" | "running" | "pending" {
  if (currentIdx >= STAGES.length - 1) return "done"; // completed
  if (stageIdx < currentIdx) return "done";
  if (stageIdx === currentIdx) return "done";
  if (stageIdx === currentIdx + 1) return "running";
  return "pending";
}

function getSubStageState(
  subIndex: number,
  currentStatus: string,
  parentStageIdx: number,
  currentIdx: number
): "done" | "running" | "pending" {
  // If parent stage is already done, all sub-stages are done
  if (currentIdx > parentStageIdx) return "done";

  // If we're inside stage 5 sub-stages
  const subStageKey = `stage_5${String.fromCharCode(97 + subIndex)}_done`;
  const currentSubIdx = getStageIndex(currentStatus);
  const thisSubIdx = parentStageIdx + (subIndex + 1) * 0.1;

  // Fractional comparison for sub-stages
  if (currentSubIdx >= parentStageIdx + 1) return "done"; // parent done = all subs done
  if (currentStatus === subStageKey) return "done";
  if (thisSubIdx < currentSubIdx) return "done";
  if (Math.abs(thisSubIdx - currentSubIdx) < 0.05) return "done";

  // Determine if this is the next running sub-stage
  const prevSubKey =
    subIndex === 0
      ? STAGES[parentStageIdx - 1]?.key
      : `stage_5${String.fromCharCode(96 + subIndex)}_done`;

  if (currentStatus === prevSubKey || (subIndex === 0 && currentIdx === parentStageIdx - 1)) {
    // Check if parent's previous stage is done - this sub should be running
    if (subIndex === 0 && currentIdx >= parentStageIdx - 1) return "running";
  }

  // If we're currently at a sub-stage, the next one is running
  if (currentSubIdx > 0 && currentSubIdx < thisSubIdx && thisSubIdx - currentSubIdx <= 0.15) {
    return "running";
  }

  return "pending";
}

export function StageProgress({ currentStatus }: StageProgressProps) {
  const currentIdx = getStageIndex(currentStatus);
  const currentMainIdx =
    currentIdx >= 4 && currentIdx < 5 ? 4 : Math.floor(currentIdx);

  return (
    <div className="space-y-3">
      {STAGES.map((stage, stageIdx) => {
        const state = getStageState(stageIdx, currentMainIdx);
        const isExpanded =
          stage.subStages &&
          (currentMainIdx === stageIdx ||
            (currentIdx >= stageIdx && currentIdx < stageIdx + 1) ||
            state === "running" ||
            (state === "done" && currentMainIdx <= stageIdx + 1));

        return (
          <div key={stage.key}>
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
                  state === "done" && "bg-green-600 text-white",
                  state === "running" && "animate-pulse bg-blue-600 text-white",
                  state === "pending" && "bg-gray-800 text-gray-500"
                )}
              >
                {state === "done" ? "\u2713" : state === "running" ? "\u27F3" : "\u00B7"}
              </div>
              <span
                className={cn(
                  "text-sm",
                  state === "done" && "text-green-400",
                  state === "running" && "font-medium text-blue-400",
                  state === "pending" && "text-gray-600"
                )}
              >
                {stage.label}
              </span>
            </div>

            {/* Sub-stages for Deep Reasoning */}
            {stage.subStages && isExpanded && (
              <div className="ml-4 mt-2 space-y-2 border-l border-gray-800 pl-7">
                {stage.subStages.map((sub, subIdx) => {
                  const subState = getSubStageState(subIdx, currentStatus, stageIdx, currentMainIdx);
                  return (
                    <div key={sub.key} className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                          subState === "done" && "bg-green-600/80 text-white",
                          subState === "running" && "animate-pulse bg-blue-600/80 text-white",
                          subState === "pending" && "bg-gray-800/80 text-gray-600"
                        )}
                      >
                        {subState === "done" ? "\u2713" : subState === "running" ? "\u27F3" : "\u00B7"}
                      </div>
                      <span
                        className={cn(
                          "text-xs",
                          subState === "done" && "text-green-400/80",
                          subState === "running" && "font-medium text-blue-400",
                          subState === "pending" && "text-gray-600"
                        )}
                      >
                        {sub.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
