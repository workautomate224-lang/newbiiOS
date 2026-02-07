import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { ProbabilityBar } from "./probability-bar";

afterEach(() => cleanup());

describe("ProbabilityBar", () => {
  it("renders label and percentage", () => {
    render(<ProbabilityBar label="Outcome A" probability={0.42} />);
    expect(screen.getByText("Outcome A")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("renders confidence interval when provided", () => {
    render(<ProbabilityBar label="Test" probability={0.5} confidence={[0.4, 0.6]} />);
    expect(screen.getByText("CI: 40% — 60%")).toBeInTheDocument();
  });
});
