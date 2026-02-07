# Contract: Simulation Engine
Version: 1.0
Last Updated: 2026-02-06

## Description

The Simulation Engine executes multi-agent behavioral simulations over the synthetic population produced by the Population Synthesizer. Agents interact across the social network, updating their beliefs and behaviors in response to environmental variables, peer influence, and exogenous shocks. The engine operates in discrete time steps (ticks), where each tick represents a configurable time unit. At each tick, agents evaluate their environment, receive influence from connected neighbors, and update their outcome probability distributions. The engine captures the full trajectory of the simulation, including per-tick aggregate distributions, individual agent histories, and emergent behavioral patterns. The simulation output serves as a critical input to the reasoning engines (GoT, MCTS, Debate) and carries the highest ensemble weight (40%) in the final aggregation.

## Interface

### Input

```
SimulationRequest {
  task_id: string
  population_id: string          // Reference to SyntheticPopulation

  agents: Agent[]                // Full agent array from pop-synthesizer
  network: Network               // Social network graph from pop-synthesizer

  variables: [
    {
      name: string               // Key variable name
      category: string
      current_value: number
      projected_trajectory: [    // Expected future values per tick
        {tick: number, value: number, confidence: number}
      ]
      shock_probability: number  // Probability of unexpected change per tick
      shock_magnitude: number    // Size of shock if it occurs
    }
  ]

  config: {
    num_ticks: number            // Number of simulation steps (default: 100)
    tick_duration: string        // What each tick represents: "day", "week", "month"
    influence_model: "degroot" | "bounded_confidence" | "voter" | "threshold"
    influence_decay: number      // How influence strength decays with network distance (0.0-1.0)
    noise_level: number          // Random perturbation per tick (0.0-0.1)
    convergence_threshold: number  // Stop early if distribution change < threshold
    num_runs: number             // Monte Carlo runs for variance estimation (default: 10)
    random_seed?: number         // For reproducibility
  }
}
```

### Output

```
SimulationResult {
  simulation_id: string          // UUID v4
  task_id: string
  population_id: string
  completed_at: string           // ISO 8601

  ticks: [
    {
      tick: number
      timestamp_simulated: string  // Projected real-world date for this tick
      aggregate_distribution: [    // Population-weighted outcome probabilities
        {outcome_id: string, probability: number}
      ]
      variable_states: [
        {name: string, value: number, shocked: boolean}
      ]
      metrics: {
        opinion_entropy: number       // Shannon entropy of outcome distribution
        polarization_index: number    // Esteban-Ray polarization measure
        consensus_score: number       // 1 - normalized entropy
        active_agents_pct: number     // % of agents that changed opinion this tick
        influence_events: number      // Number of successful influence transmissions
      }
    }
  ]

  final_distribution: [
    {
      outcome_id: string
      probability: number            // Final weighted probability
      std_dev: number                // Across Monte Carlo runs
      confidence_interval: {lower: number, upper: number}  // 95% CI
    }
  ]

  agent_histories: [
    {
      agent_id: string
      trajectory: [                  // Sampled every N ticks to manage size
        {
          tick: number
          outcome_probabilities: [{outcome_id: string, probability: number}]
          influenced_by: string[]    // agent_ids that influenced this agent
        }
      ]
      final_position: {outcome_id: string, probability: number}[]
      total_opinion_changes: number
    }
  ]

  convergence: {
    converged: boolean
    convergence_tick: number | null   // Tick at which convergence was reached
    final_entropy: number
  }

  run_statistics: {
    num_runs: number
    mean_distribution: [{outcome_id: string, probability: number}]
    variance_across_runs: number
    run_summaries: [{run_id: number, final_distribution: object, convergence_tick: number}]
  }

  metadata: {
    total_ticks_executed: number
    wall_clock_time_ms: number
    agents_count: number
    edge_count: number
  }
}
```

### API Endpoints (if applicable)

```
POST /api/v1/simulation/run
  Request:  SimulationRequest
  Response: SimulationResult
  Auth:     Internal service token
  Timeout:  120s

GET /api/v1/simulation/:simulation_id
  Response: SimulationResult

GET /api/v1/simulation/:simulation_id/ticks?from=:start&to=:end
  Response: { ticks: Tick[] }

GET /api/v1/simulation/:simulation_id/agent/:agent_id
  Response: AgentHistory

POST /api/v1/simulation/:simulation_id/inject-shock
  Request:  { variable: string, magnitude: number, tick: number }
  Response: SimulationResult (re-run from shock point)

WebSocket /ws/v1/simulation/:simulation_id/stream
  Emits:    Tick data in real-time as simulation progresses
```

## Data Formats

### Tick Data (streaming format)

```json
{
  "event": "tick",
  "data": {
    "tick": 42,
    "distribution": [
      {"outcome_id": "outcome_a", "probability": 0.55},
      {"outcome_id": "outcome_b", "probability": 0.35},
      {"outcome_id": "outcome_c", "probability": 0.10}
    ],
    "entropy": 1.23,
    "polarization": 0.34,
    "pct_changed": 0.08
  }
}
```

### Influence Model Parameters

```json
{
  "degroot": {
    "description": "Weighted average of neighbor opinions",
    "update_rule": "x_i(t+1) = sum(w_ij * x_j(t)) for j in neighbors(i)",
    "parameters": ["weight_matrix"]
  },
  "bounded_confidence": {
    "description": "Agents only influenced by others within confidence bound",
    "update_rule": "x_i(t+1) = mean(x_j(t)) for j where |x_i - x_j| < epsilon",
    "parameters": ["epsilon (confidence bound, default 0.2)"]
  },
  "voter": {
    "description": "Agent copies random neighbor's opinion",
    "update_rule": "x_i(t+1) = x_j(t) where j is random neighbor",
    "parameters": []
  },
  "threshold": {
    "description": "Agent changes opinion when fraction of neighbors exceeds threshold",
    "update_rule": "x_i flips when fraction_neighbors(opposite) > threshold_i",
    "parameters": ["per_agent_threshold"]
  }
}
```

## Dependencies

- **Depends on:**
  - `pop-synthesizer` -- provides agents[] and network graph
  - `data-orchestrator` -- provides economic indicators and sentiment for variable trajectories
  - NumPy -- for matrix operations in influence models
  - NetworkX -- for graph traversal during influence propagation

- **Depended by:**
  - `got-engine` -- consumes simulation results for causal reasoning
  - `mcts-engine` -- uses simulation distributions as prior for search
  - `debate-engine` -- references simulation outcomes during debate
  - `ensemble-aggregator` -- simulation carries 40% weight in final ensemble

## Performance Requirements

- **Latency:** p50 < 30s for 1,000 agents x 100 ticks x 10 runs; p95 < 60s; p99 < 90s
- **Scaling:** Must handle up to 10,000 agents with 500 ticks; target < 5 minutes for this configuration
- **Parallelism:** Monte Carlo runs execute in parallel across available CPU cores
- **Memory:** Peak < 4GB for 10,000-agent simulation
- **Streaming:** Tick data streamed via WebSocket within 100ms of computation
- **Determinism:** Identical inputs with identical random seed must produce identical outputs across runs
- **Early termination:** Simulation stops if entropy change < convergence_threshold for 10 consecutive ticks
- **Agent history sampling:** Full trajectory stored for up to 100 representative agents; remaining agents store start, mid, and end states only to manage output size
- **Numerical stability:** All probabilities must sum to 1.0 (+/- 1e-6) at every tick; re-normalization applied if drift detected
