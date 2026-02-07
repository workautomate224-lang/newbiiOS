import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hero */}
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
        <h1 className="mb-4 text-6xl font-bold tracking-tight sm:text-7xl">
          Future<span className="text-blue-500">OS</span>
        </h1>
        <p className="mb-8 max-w-2xl text-xl text-gray-400">
          The Future Computation Engine — explore, simulate, and trade on the
          causal space of any question through AI-powered prediction, professional
          simulation studios, and signal-fused prediction markets.
        </p>
        <Link
          href="/lite"
          className="rounded-xl bg-blue-600 px-8 py-4 text-lg font-semibold text-white transition hover:bg-blue-700"
        >
          Start Exploring
        </Link>
      </div>

      {/* Three Product Cards */}
      <div className="mx-auto grid max-w-5xl gap-8 px-4 pb-16 sm:grid-cols-3">
        {/* Lite */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-900/50 text-xl text-blue-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold">Explore Any Future</h3>
          <p className="mb-4 text-sm text-gray-400">
            Ask any question about the future and get AI-powered causal reasoning,
            agent simulation, and interactive probability maps in seconds.
          </p>
          <Link
            href="/lite"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-400 transition hover:text-blue-300"
          >
            Open Lite <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>

        {/* Studio */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-purple-900/50 text-xl text-purple-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20h9" />
              <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold">
            Professional Prediction Workbench
          </h3>
          <p className="mb-4 text-sm text-gray-400">
            Build custom simulation projects with your own data sources,
            populations, scenarios, and branching what-if analyses.
          </p>
          <Link
            href="/studio"
            className="inline-flex items-center gap-1 text-sm font-medium text-purple-400 transition hover:text-purple-300"
          >
            Open Studio <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>

        {/* Exchange */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-amber-900/50 text-xl text-amber-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 3h5v5" />
              <path d="M8 3H3v5" />
              <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
              <path d="m15 9 6-6" />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold">Trade on Your Judgment</h3>
          <p className="mb-4 text-sm text-gray-400">
            Prediction markets powered by triple signal fusion — AI, crowd
            intelligence, and reputation-weighted signals combined for
            better pricing.
          </p>
          <Link
            href="/exchange"
            className="inline-flex items-center gap-1 text-sm font-medium text-amber-400 transition hover:text-amber-300"
          >
            Open Exchange <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </div>

      {/* Social Proof */}
      <div className="border-y border-gray-800 bg-gray-900/30 py-12">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-8 text-center sm:gap-16">
          <div>
            <p className="text-3xl font-bold text-white">12,847</p>
            <p className="mt-1 text-sm text-gray-400">Predictions Made</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-white">3,241</p>
            <p className="mt-1 text-sm text-gray-400">Active Users</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-white">78%</p>
            <p className="mt-1 text-sm text-gray-400">Calibration Accuracy</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 text-center text-sm text-gray-500">
        FutureOS v0.2.0 — Lite + Studio + Exchange
      </footer>
    </div>
  );
}
