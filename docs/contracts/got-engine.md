# Contract: Graph of Thought Engine
Version: 1.0
Last Updated: 2026-02-06

## Description

The Graph of Thought (GoT) Engine is the core intellectual property of FutureOS. It implements a structured reasoning process that goes beyond linear chain-of-thought by constructing, traversing, and synthesizing a directed acyclic graph of reasoning nodes. Each node represents a distinct analytical perspective, evidence evaluation, or logical inference step. The engine uses Claude Opus for its reasoning capabilities, enabling deep causal analysis, counterfactual exploration, and multi-path reasoning convergence. The GoT Engine ingests all prior pipeline data -- the original prediction task, collected data, synthetic population characteristics, and simulation results -- to produce a comprehensive causal graph and probability assessments grounded in explicit reasoning chains. It carries a 25% weight in the ensemble aggregation.

## Interface

### Input

```
GoTRequest {
  task_id: string
  prediction_task: PredictionTask      // Original parsed intent
  data_package: DataPackage            // Collected data from orchestrator
  population_summary: {               // Summary stats from pop-synthesizer (not full agent list)
    total_agents: number
    archetype_count: number
    dominant_demographics: object
    network_properties: object
  }
  simulation_result: {                // Key simulation outputs
    final_distribution: [{outcome_id, probability, std_dev}]
    convergence: {converged, convergence_tick, final_entropy}
    key_tick_snapshots: object[]      // Pivotal moments in simulation
    polarization_trajectory: number[]
  }
  config: {
    max_depth: number                 // Max reasoning graph depth (default: 5)
    branching_factor: number          // Max children per node (default: 4)
    exploration_breadth: "narrow" | "standard" | "wide"  // Controls node generation
    counterfactual_scenarios: number  // Number of "what-if" branches (default: 3)
    evidence_threshold: number       // Min evidence strength to retain a reasoning path (0.0-1.0)
  }
}
```

### Output

```
GoTResult {
  got_id: string                     // UUID v4
  task_id: string
  completed_at: string               // ISO 8601

  outcomes: [
    {
      outcome_id: string
      probability: number            // GoT-assessed probability
      confidence: number             // Confidence in this assessment (0.0-1.0)
      reasoning_summary: string      // 2-3 sentence explanation
      supporting_paths: string[]     // IDs of reasoning paths that support this outcome
      key_evidence: [
        {
          evidence: string
          source: "data" | "simulation" | "causal" | "counterfactual"
          strength: number           // 0.0-1.0
        }
      ]
    }
  ]

  causal_graph: {
    nodes: [
      {
        node_id: string
        label: string                // Variable or event name
        type: "variable" | "event" | "condition" | "outcome"
        category: string             // Maps to key_variable categories
        current_state: string | number
        importance: number           // 0.0-1.0 centrality in causal graph
      }
    ]
    edges: [
      {
        source: string               // node_id
        target: string               // node_id
        weight: number               // Causal strength -1.0 to 1.0
        direction: "positive" | "negative" | "conditional"
        mechanism: string            // Brief description of causal mechanism
        confidence: number           // Confidence in this causal link (0.0-1.0)
        evidence_basis: string       // What supports this edge
      }
    ]
    properties: {
      node_count: number
      edge_count: number
      max_depth: number
      avg_path_length: number
      critical_paths: [              // Most influential causal chains
        {
          path: string[]             // Ordered node_ids
          total_weight: number
          description: string
        }
      ]
    }
  }

  reasoning_tree: {
    root: ReasoningNode
    total_nodes: number
    max_depth_reached: number
    pruned_branches: number
  }

  counterfactuals: [
    {
      scenario: string               // Description of the "what-if"
      modified_variables: [{name: string, original: any, modified: any}]
      resulting_distribution: [{outcome_id: string, probability: number}]
      delta_from_base: [{outcome_id: string, delta: number}]
      insight: string                // What this counterfactual reveals
    }
  ]

  metadata: {
    opus_tokens_used: {input: number, output: number}
    reasoning_steps: number
    wall_clock_time_ms: number
    model: string                    // e.g., "claude-opus-4-20250514"
  }
}

// Recursive reasoning node structure
ReasoningNode {
  node_id: string
  depth: number
  type: "analysis" | "evidence" | "inference" | "synthesis" | "counterfactual" | "critique"
  content: string                    // The reasoning content
  evidence_refs: string[]            // References to data/simulation evidence
  confidence: number                 // 0.0-1.0
  children: ReasoningNode[]
  outcome_implications: [{outcome_id: string, direction: "supports" | "weakens", magnitude: number}]
}
```

### API Endpoints (if applicable)

```
POST /api/v1/reasoning/got
  Request:  GoTRequest
  Response: GoTResult
  Auth:     Internal service token
  Timeout:  180s

GET /api/v1/reasoning/got/:got_id
  Response: GoTResult

GET /api/v1/reasoning/got/:got_id/causal-graph
  Response: { causal_graph: CausalGraph }

GET /api/v1/reasoning/got/:got_id/reasoning-tree
  Response: { reasoning_tree: ReasoningTree }

GET /api/v1/reasoning/got/:got_id/counterfactuals
  Response: { counterfactuals: Counterfactual[] }
```

## Data Formats

### Reasoning Node Schema

```json
{
  "type": "object",
  "required": ["node_id", "depth", "type", "content", "confidence", "children", "outcome_implications"],
  "properties": {
    "node_id": { "type": "string" },
    "depth": { "type": "integer", "minimum": 0 },
    "type": {
      "type": "string",
      "enum": ["analysis", "evidence", "inference", "synthesis", "counterfactual", "critique"]
    },
    "content": { "type": "string", "maxLength": 2000 },
    "evidence_refs": { "type": "array", "items": { "type": "string" } },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "children": { "type": "array", "items": { "$ref": "#" } },
    "outcome_implications": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "outcome_id": { "type": "string" },
          "direction": { "type": "string", "enum": ["supports", "weakens"] },
          "magnitude": { "type": "number", "minimum": 0, "maximum": 1 }
        }
      }
    }
  }
}
```

### Causal Edge Representation

```json
{
  "source": "unemployment_rate",
  "target": "consumer_confidence",
  "weight": -0.72,
  "direction": "negative",
  "mechanism": "Rising unemployment reduces household income expectations, leading to decreased consumer spending confidence",
  "confidence": 0.85,
  "evidence_basis": "BLS data correlation + simulation agent behavior patterns"
}
```

## Dependencies

- **Depends on:**
  - `simulation-engine` -- provides simulation results as primary evidence input
  - `data-orchestrator` -- provides raw data context for evidence grounding
  - `pop-synthesizer` -- provides population summary for demographic reasoning
  - `intent-parser` -- provides the original PredictionTask for outcome definitions
  - LLM Provider (Claude Opus) -- core reasoning model; requires Opus-tier capabilities for deep analytical reasoning
  - `causal-graph` -- reads/writes to the persistent causal knowledge graph in Neo4j

- **Depended by:**
  - `ensemble-aggregator` -- GoT outcomes carry 25% weight in ensemble
  - `explanation-generator` -- uses reasoning tree and causal graph for explanation generation
  - `causal-graph` -- GoT discoveries update the persistent knowledge graph

## Performance Requirements

- **Latency:** p50 < 45s, p95 < 90s, p99 < 150s (dominated by Opus inference time)
- **Token budget:** Max 8,000 input tokens + 6,000 output tokens per Opus call; up to 5 sequential Opus calls per GoT execution (total budget: 40,000 input + 30,000 output)
- **Reasoning depth:** Must explore at least 3 levels of reasoning; max 5 levels to prevent runaway token consumption
- **Pruning:** Branches with confidence < evidence_threshold are pruned; at least 60% of generated nodes must survive pruning
- **Causal graph size:** 10-50 nodes, 15-100 edges for typical predictions
- **Counterfactuals:** Each counterfactual must identify at least one variable modification and produce a meaningfully different outcome distribution (KL divergence > 0.01 from base)
- **Availability:** 99.5% (lower than data pipeline due to Opus dependency); falls back to Sonnet with degraded reasoning depth if Opus is unavailable
- **Caching:** Reasoning results cached for 2 hours; causal graph fragments cached indefinitely in Neo4j
