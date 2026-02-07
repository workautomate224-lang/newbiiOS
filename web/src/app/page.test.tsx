import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import LandingPage from "./page";

afterEach(() => {
  cleanup();
});

describe("Landing page", () => {
  it("renders the FutureOS heading", () => {
    render(<LandingPage />);
    expect(screen.getByText(/FutureOS/)).toBeInTheDocument();
  });

  it("renders the CTA button", () => {
    render(<LandingPage />);
    expect(screen.getByText("Start Exploring")).toBeInTheDocument();
  });

  it("renders three product cards", () => {
    render(<LandingPage />);
    expect(screen.getByText("Explore Any Future")).toBeInTheDocument();
    expect(screen.getByText("Professional Prediction Workbench")).toBeInTheDocument();
    expect(screen.getByText("Trade on Your Judgment")).toBeInTheDocument();
  });
});
