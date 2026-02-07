# Contract: Population Synthesizer
Version: 1.0
Last Updated: 2026-02-06

## Description

The Population Synthesizer generates a statistically representative synthetic agent population for a given region using a combination of Iterative Proportional Fitting (IPF) and LLM-generated persona enrichment. The IPF algorithm ensures the synthetic population matches known marginal distributions from census data (age, gender, income, education, ethnicity, urban/rural). Once the demographic skeleton is constructed, an LLM (Claude Sonnet) enriches each agent archetype with behavioral attributes, attitudes, and decision-making tendencies derived from the regional context. The module also constructs a social network graph connecting agents, modeling influence pathways and information flow. The output population is designed to be fed directly into the Simulation Engine for multi-agent behavioral modeling.

## Interface

### Input

```
PopSynthRequest {
  task_id: string                // Reference to originating PredictionTask
  data_package: DataPackage      // Full data package from data-orchestrator
  region_config: {
    target_population_size: number  // Number of agents to synthesize (default: 1000)
    archetype_count: number         // Number of distinct archetypes before scaling (default: 50)
    network_type: "small_world" | "scale_free" | "geographic" | "hybrid"  // Network topology
    network_density: number         // 0.0-1.0, edge probability (default: 0.05)
    enrichment_depth: "basic" | "standard" | "deep"  // LLM persona detail level
  }
  prediction_context: {
    type: string                    // From PredictionTask
    key_variables: [{name, category, importance}]
    outcomes: [{id, label}]
  }
}
```

### Output

```
SyntheticPopulation {
  population_id: string          // UUID v4
  task_id: string
  created_at: string             // ISO 8601

  agents: [
    {
      agent_id: string           // UUID v4
      archetype_id: string       // Shared among agents of same archetype
      demographics: {
        age: number
        gender: string
        ethnicity: string
        education: string        // "no_hs", "hs", "some_college", "bachelors", "graduate"
        income_bracket: string
        urban_rural: "urban" | "suburban" | "rural"
        household_size: number
      }
      psychographics: {
        risk_tolerance: number   // 0.0-1.0
        change_openness: number  // 0.0-1.0
        trust_institutions: number  // 0.0-1.0
        information_sources: string[]  // e.g., ["social_media", "tv_news", "word_of_mouth"]
        political_lean: number   // -1.0 (left) to 1.0 (right)
      }
      behavioral: {
        decision_style: "rational" | "emotional" | "habitual" | "social"
        influence_susceptibility: number  // 0.0-1.0
        influence_power: number           // 0.0-1.0
        variable_sensitivities: [         // How each key_variable affects this agent
          {
            variable: string
            sensitivity: number  // -1.0 to 1.0
            threshold: number    // Value at which behavior changes
          }
        ]
      }
      initial_position: {        // Starting stance on prediction outcomes
        outcome_id: string
        probability: number      // Agent's initial belief about this outcome
      }[]
      weight: number             // IPF weight -- how many real people this agent represents
    }
  ]

  network: {
    type: string                 // Network topology used
    node_count: number
    edge_count: number
    edges: [
      {
        source: string           // agent_id
        target: string           // agent_id
        weight: number           // Influence strength 0.0-1.0
        type: "family" | "work" | "community" | "media" | "random"
      }
    ]
    properties: {
      avg_clustering_coefficient: number
      avg_path_length: number
      degree_distribution: [{degree: number, count: number}]
    }
  }

  ipf_diagnostics: {
    iterations: number           // IPF iterations to convergence
    convergence_metric: number   // Final chi-squared or RMSE
    marginal_fits: [             // How well each marginal was matched
      {
        dimension: string
        rmse: number
        max_deviation_pct: number
      }
    ]
  }

  metadata: {
    archetype_count: number
    total_agents: number
    llm_enrichment_tokens: number
    generation_time_ms: number
  }
}
```

### API Endpoints (if applicable)

```
POST /api/v1/population/synthesize
  Request:  PopSynthRequest
  Response: SyntheticPopulation
  Auth:     Internal service token
  Timeout:  60s

GET /api/v1/population/:population_id
  Response: SyntheticPopulation

GET /api/v1/population/:population_id/agents?archetype=:archetype_id
  Response: { agents: Agent[] }

GET /api/v1/population/:population_id/network
  Response: { network: Network }

POST /api/v1/population/:population_id/adjust
  Request:  { adjustments: [{dimension, target_distribution}] }
  Response: SyntheticPopulation (re-fitted)
```

## Data Formats

### Agent Archetype (intermediate format before scaling)

```json
{
  "archetype_id": "string",
  "count": "integer",
  "demographic_profile": {
    "age_range": [25, 34],
    "gender": "female",
    "education": "bachelors",
    "income_bracket": "50k-75k",
    "ethnicity": "hispanic",
    "urban_rural": "urban"
  },
  "persona_narrative": "string (LLM-generated behavioral description)",
  "behavioral_vector": [0.7, 0.4, 0.6, 0.3, 0.8]
}
```

### IPF Constraint Matrix

```json
{
  "marginals": [
    {
      "dimension": "age",
      "distribution": [
        {"category": "18-24", "target_proportion": 0.12},
        {"category": "25-34", "target_proportion": 0.18},
        {"category": "35-44", "target_proportion": 0.16},
        {"category": "45-54", "target_proportion": 0.15},
        {"category": "55-64", "target_proportion": 0.17},
        {"category": "65+", "target_proportion": 0.22}
      ]
    }
  ],
  "cross_tabulations": [
    {
      "dimensions": ["age", "income"],
      "joint_distribution": {}
    }
  ]
}
```

## Dependencies

- **Depends on:**
  - `data-orchestrator` -- provides the DataPackage containing census demographics and economic context
  - LLM Provider (Claude Sonnet) -- for persona enrichment and behavioral attribute generation
  - NumPy/SciPy -- for IPF algorithm implementation
  - NetworkX -- for social network graph construction

- **Depended by:**
  - `simulation-engine` -- consumes agents[] and network for multi-agent simulation

## Performance Requirements

- **Latency:** p50 < 15s, p95 < 30s, p99 < 45s for 1,000-agent population
- **Scaling:** Linear scaling with agent count; 10,000 agents should complete within 5 minutes
- **IPF convergence:** Must converge within 100 iterations or report non-convergence; convergence threshold: RMSE < 0.01 across all marginals
- **LLM token budget:** Max 500 tokens per archetype enrichment; total budget scales with archetype_count (not agent count)
- **Population validity:** All agent weights must sum to actual population count (+/- 1%); all marginal distributions must match census within 2% deviation
- **Network properties:** Generated network must exhibit small-world properties (clustering coefficient > 0.1, average path length < log(N))
- **Memory:** Peak memory usage < 2GB for 10,000-agent populations
- **Reproducibility:** Same inputs with same random seed must produce identical populations
