const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok && res.status !== 202) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "API error");
  }
  return res.json();
}

export async function createPrediction(query: string, token: string) {
  return apiFetch("/api/v1/predictions/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
  });
}

export async function getPrediction(id: string) {
  return apiFetch(`/api/v1/predictions/${id}`);
}

export async function getPredictionResult(id: string) {
  return apiFetch(`/api/v1/predictions/${id}/result`);
}

export async function getPredictionAgents(id: string) {
  return apiFetch(`/api/v1/predictions/${id}/agents`);
}

export async function rerunPrediction(id: string, variables: Record<string, number>, token: string) {
  return apiFetch(`/api/v1/predictions/${id}/rerun`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ variables }),
  });
}

export async function getTrending() {
  return apiFetch("/api/v1/predictions/trending");
}

export async function getExplore(params?: { category?: string; sort?: string; page?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.category) searchParams.set("category", params.category);
  if (params?.sort) searchParams.set("sort", params.sort);
  if (params?.page) searchParams.set("page", String(params.page));
  const qs = searchParams.toString();
  return apiFetch(`/api/v1/predictions/explore${qs ? `?${qs}` : ""}`);
}

export async function getMe(token: string) {
  return apiFetch("/api/v1/users/me", { headers: { Authorization: `Bearer ${token}` } });
}

export async function updateMe(token: string, data: { display_name?: string; avatar_url?: string }) {
  return apiFetch("/api/v1/users/me", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export async function getMyPredictions(token: string) {
  return apiFetch("/api/v1/users/me/predictions", { headers: { Authorization: `Bearer ${token}` } });
}

export async function getLeaderboard() {
  return apiFetch("/api/v1/leaderboard");
}

export async function updatePredictionVisibility(id: string, isPublic: boolean, token: string) {
  return apiFetch(`/api/v1/predictions/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ is_public: isPublic }),
  });
}

// ── Studio: Projects ──────────────────────────────────────────────────
export async function getProjects(token: string) {
  return apiFetch("/api/v1/studio/projects", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createProject(data: { name: string; description?: string }, token: string) {
  return apiFetch("/api/v1/studio/projects", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export async function getProject(id: string, token: string) {
  return apiFetch(`/api/v1/studio/projects/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function updateProject(id: string, data: Record<string, unknown>, token: string) {
  return apiFetch(`/api/v1/studio/projects/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string, token: string) {
  return apiFetch(`/api/v1/studio/projects/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Studio: Data Sources ──────────────────────────────────────────────
export async function getDataSources(projectId: string, token: string) {
  return apiFetch(`/api/v1/studio/projects/${projectId}/data-sources`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function addDataSource(projectId: string, data: Record<string, unknown>, token: string) {
  return apiFetch(`/api/v1/studio/projects/${projectId}/data-sources`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export async function syncDataSource(sourceId: string, token: string) {
  return apiFetch(`/api/v1/studio/data-sources/${sourceId}/sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function previewDataSource(sourceId: string, token: string) {
  return apiFetch(`/api/v1/studio/data-sources/${sourceId}/preview`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function qualityCheck(sourceId: string, token: string) {
  return apiFetch(`/api/v1/studio/data-sources/${sourceId}/quality`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Studio: Populations ───────────────────────────────────────────────
export async function getPopulations(projectId: string, token: string) {
  return apiFetch(`/api/v1/studio/projects/${projectId}/populations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createPopulation(projectId: string, data: Record<string, unknown>, token: string) {
  return apiFetch(`/api/v1/studio/projects/${projectId}/populations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export async function generateAgents(popId: string, token: string) {
  return apiFetch(`/api/v1/studio/populations/${popId}/generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getAgents(popId: string, token: string) {
  return apiFetch(`/api/v1/studio/populations/${popId}/agents`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Studio: Scenarios ─────────────────────────────────────────────────
export async function getScenarios(projectId: string, token: string) {
  return apiFetch(`/api/v1/studio/projects/${projectId}/scenarios`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createScenario(projectId: string, data: Record<string, unknown>, token: string) {
  return apiFetch(`/api/v1/studio/projects/${projectId}/scenarios`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export async function updateScenario(id: string, data: Record<string, unknown>, token: string) {
  return apiFetch(`/api/v1/studio/scenarios/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export async function forkScenario(id: string, token: string) {
  return apiFetch(`/api/v1/studio/scenarios/${id}/fork`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function diffScenarios(id: string, otherId: string, token: string) {
  return apiFetch(`/api/v1/studio/scenarios/${id}/diff?other=${otherId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Studio: Simulations ───────────────────────────────────────────────
export async function startSimulation(projectId: string, data: Record<string, unknown>, token: string) {
  return apiFetch(`/api/v1/studio/projects/${projectId}/simulations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export async function getSimulation(id: string, token: string) {
  return apiFetch(`/api/v1/studio/simulations/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createBranch(runId: string, data: Record<string, unknown>, token: string) {
  return apiFetch(`/api/v1/studio/simulations/${runId}/branch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export async function compareBranches(runId: string, token: string) {
  return apiFetch(`/api/v1/studio/simulations/${runId}/compare`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Studio: Reports ───────────────────────────────────────────────────
export async function createReport(projectId: string, data: Record<string, unknown>, token: string) {
  return apiFetch(`/api/v1/studio/projects/${projectId}/reports`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export async function getReport(id: string, token: string) {
  return apiFetch(`/api/v1/studio/reports/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getReports(projectId: string, token: string) {
  return apiFetch(`/api/v1/studio/projects/${projectId}/reports`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function updateReport(id: string, data: Record<string, unknown>, token: string) {
  return apiFetch(`/api/v1/studio/reports/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export async function exportReport(id: string, format: string, token: string) {
  return apiFetch(`/api/v1/studio/reports/${id}/export?format=${format}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Exchange: Markets ────────────────────────────────────────────────
export async function getMarkets(category?: string, sort?: string) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (sort) params.set("sort", sort);
  const qs = params.toString();
  return apiFetch(`/api/v1/exchange/markets${qs ? `?${qs}` : ""}`);
}

export async function getMarket(id: string) {
  return apiFetch(`/api/v1/exchange/markets/${id}`);
}

export async function createMarket(data: Record<string, unknown>, token: string) {
  return apiFetch("/api/v1/exchange/markets", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export async function placeBet(
  marketId: string,
  data: { outcome_name: string; amount: number },
  token: string
) {
  return apiFetch(`/api/v1/exchange/markets/${marketId}/bet`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export async function getPositions(marketId: string, token: string) {
  return apiFetch(`/api/v1/exchange/markets/${marketId}/positions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getOrderbook(marketId: string) {
  return apiFetch(`/api/v1/exchange/markets/${marketId}/orderbook`);
}

export async function getSignals(marketId: string) {
  return apiFetch(`/api/v1/exchange/markets/${marketId}/signals`);
}

export async function getPriceHistory(marketId: string) {
  return apiFetch(`/api/v1/exchange/markets/${marketId}/price-history`);
}

export async function getPortfolio(token: string) {
  return apiFetch("/api/v1/exchange/portfolio", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Drift ────────────────────────────────────────────────────────────
export async function getDriftEvents() {
  return apiFetch("/api/v1/drift/events");
}

export async function getDriftStats() {
  return apiFetch("/api/v1/drift/stats");
}

export async function runDriftScan(token: string) {
  return apiFetch("/api/v1/drift/scan", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getEdgeWeights() {
  return apiFetch("/api/v1/drift/edge-weights");
}

// ── Search ───────────────────────────────────────────────────────────
export async function searchAll(query: string) {
  return apiFetch(`/api/v1/search?q=${encodeURIComponent(query)}`);
}
