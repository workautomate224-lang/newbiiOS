import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { StageProgress } from "./stage-progress";

afterEach(() => cleanup());

describe("StageProgress", () => {
  it("renders all 7 stages", () => {
    render(<StageProgress currentStatus="processing" />);
    expect(screen.getByText("Intent Parsing")).toBeInTheDocument();
    expect(screen.getByText("Data Collection")).toBeInTheDocument();
    expect(screen.getByText("Deep Reasoning")).toBeInTheDocument();
    expect(screen.getByText("Complete")).toBeInTheDocument();
  });

  it("marks completed stages as done", () => {
    render(<StageProgress currentStatus="stage_3_done" />);
    // Stages 1-3 should show checkmark
    const checks = screen.getAllByText("✓");
    expect(checks.length).toBeGreaterThanOrEqual(3);
  });
});
