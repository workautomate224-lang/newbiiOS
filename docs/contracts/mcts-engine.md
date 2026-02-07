# Contract: MCTS Engine
Version: 1.0
Last Updated: 2026-02-06

## Description

The Monte Carlo Tree Search (MCTS) Engine applies a systematic exploration strategy to the prediction problem space. Adapted from game-playing AI, the MCTS engine treats each prediction as a decision tree where nodes represent states of the world and edges represent possible transitions driven by key variables. The engine performs 200 iterations of the Selection-Expansion-Simulation-Backpropagation cycle to build a search tree that maps the probability landscape of possible futures. Each simulation rollout uses Claude Sonnet to evaluate plausibility of state transitions, making this a "language model-guided MCTS" rather than a purely statistical one. The engine excels at discovering low-probability but high-impact scenarios that other methods might miss. It carries a 20% weight in the ensemble aggregation.

## Interface

### Input

```
MCTSRequest {
  task_id: string
  prediction_context: {
    task: PredictionTask               // Original prediction task
    outcomes: [{id, label, description, boundary_conditions}]
    key_variables: [{name, category, importance, current_value}]
    simulation_summary: {              // Key stats from simulation engine
      final_distribution: [{outcome_id, probability}]
      convergence_info: object
      key_variable_impacts: [{variable, impact_score}]
    }
    data_summary: {                    // Condensed data context
      region: string
      timeframe: {start, end}
      economic_snapshot: object
      sentiment_snapshot: object
    }
  }
  config: {
    iterations: number                 // Number of MCTS iterations (default: 200)
    exploration_constant: number       // UCB1 exploration parameter (default: 1.414)
    rollout_depth: number              // Max depth per rollout (default: 10)
    temperature: number                // Softmax temperature for move selection (default: 1.0)
    parallel_rollouts: number          // Concurrent rollouts (default: 4)
    random_seed?: number
  }
}
```

### Output

```
MCTSResult {
  mcts_id: string                      // UUID v4
  task_id: string
  completed_at: string                 // ISO 8601

  probability_distribution: [
    {
      outcome_id: string
      probability: number              // MCTS-derived probability
      visit_count: number              // How many times this outcome was visited
      avg_reward: number               // Average reward from rollouts reaching this outcome
      confidence: number               // Based on visit count relative to total iterations
    }
  ]

  search_tree: {
    root: MCTSNode
    total_nodes: number
    max_depth_reached: number
    total_rollouts: number
    iterations_completed: number

    statistics: {
      avg_rollout_depth: number
      branch_factor_by_depth: [{depth: number, avg_branches: number}]
      exploration_vs_exploitation: {
        exploration_selections: number
        exploitation_selections: number
        ratio: number
      }
    }
  }

  discovered_scenarios: [              // Notable paths through the tree
    {
      scenario_id: string
      description: string
      probability: number
      path: [                          // Sequence of state transitions
        {
          depth: number
          variable_changes: [{variable: string, from: any, to: any}]
          transition_description: string
          plausibility_score: number
        }
      ]
      outcome_id: string               // Terminal outcome
      significance: "expected" | "surprising" | "tail_risk"
    }
  ]

  tail_risks: [                        // Low-probability, high-impact scenarios
    {
      scenario_id: string
      probability: number
      impact_description: string
      trigger_conditions: string[]
    }
  ]

  metadata: {
    sonnet_tokens_used: {input: number, output: number}
    sonnet_calls: number
    wall_clock_time_ms: number
    model: string
  }
}

// MCTS tree node structure
MCTSNode {
  node_id: string
  depth: number
  state: {                             // World state at this node
    variable_values: [{variable: string, value: any}]
    description: string
  }
  visit_count: number
  total_reward: number
  avg_reward: number                   // total_reward / visit_count
  ucb1_score: number                   // Upper Confidence Bound score
  children: MCTSNode[]
  is_terminal: boolean
  terminal_outcome?: string            // outcome_id if terminal
}
```

### API Endpoints (if applicable)

```
POST /api/v1/reasoning/mcts
  Request:  MCTSRequest
  Response: MCTSResult
  Auth:     Internal service token
  Timeout:  120s

GET /api/v1/reasoning/mcts/:mcts_id
  Response: MCTSResult

GET /api/v1/reasoning/mcts/:mcts_id/tree?max_depth=:depth
  Response: { search_tree: MCTSNode } (pruned to max_depth)

GET /api/v1/reasoning/mcts/:mcts_id/scenarios
  Response: { discovered_scenarios: Scenario[], tail_risks: TailRisk[] }
```

## Data Formats

### MCTS Node Schema

```json
{
  "type": "object",
  "required": ["node_id", "depth", "state", "visit_count", "total_reward", "children", "is_terminal"],
  "properties": {
    "node_id": { "type": "string" },
    "depth": { "type": "integer", "minimum": 0 },
    "state": {
      "type": "object",
      "properties": {
        "variable_values": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "variable": { "type": "string" },
              "value": {}
            }
          }
        },
        "description": { "type": "string" }
      }
    },
    "visit_count": { "type": "integer", "minimum": 0 },
    "total_reward": { "type": "number" },
    "avg_reward": { "type": "number" },
    "ucb1_score": { "type": "number" },
    "children": { "type": "array" },
    "is_terminal": { "type": "boolean" },
    "terminal_outcome": { "type": "string" }
  }
}
```

### UCB1 Formula

```
UCB1(node) = avg_reward(node) + C * sqrt(ln(parent.visit_count) / node.visit_count)

Where:
  - avg_reward = total_reward / visit_count
  - C = exploration_constant (default 1.414 = sqrt(2))
  - Selection chooses child with highest UCB1 score
```

### Rollout Evaluation Prompt (to Sonnet)

```
Given the current world state:
  Region: {region}
  Timeframe: {timeframe}
  Variables: {variable_values}
  Transition: {proposed_transition}

Rate the plausibility of this transition on a scale of 0.0-1.0 and estimate the
probability of each outcome if this path continues. Respond in JSON format.
```

## Dependencies

- **Depends on:**
  - `simulation-engine` -- provides simulation summary as prior distribution and variable impact analysis
  - `data-orchestrator` -- provides economic and sentiment snapshots for state evaluation context
  - LLM Provider (Claude Sonnet) -- evaluates state transition plausibility during rollouts
  - `intent-parser` -- provides outcome definitions for terminal state classification

- **Depended by:**
  - `ensemble-aggregator` -- MCTS probability distribution carries 20% weight in ensemble

## Performance Requirements

- **Latency:** p50 < 60s, p95 < 90s, p99 < 120s for 200 iterations
- **Iterations:** Exactly 200 iterations by default; configurable from 50 to 500
- **Parallelism:** Up to 4 rollouts execute concurrently; each rollout makes 1-3 Sonnet calls
- **Token budget:** Max 800 input tokens + 400 output tokens per Sonnet call; total budget: ~160,000 input + ~80,000 output tokens across all iterations (with caching reducing effective cost by ~40%)
- **Tree size:** Typical search tree: 500-2,000 nodes for 200 iterations
- **Rollout depth:** Each rollout explores up to 10 state transitions; rollouts that exceed depth limit are evaluated heuristically without additional LLM calls
- **Scenario detection:** Must identify at least 1 tail risk scenario (probability < 5%) if one exists in the search tree
- **Numerical precision:** All probabilities derived from visit counts; final distribution normalized to sum to 1.0
- **Memory:** Peak < 1GB for 200-iteration search tree
- **Caching:** LLM evaluation results cached by (state_hash, transition_hash) to avoid redundant Sonnet calls; typical cache hit rate: 15-25%
