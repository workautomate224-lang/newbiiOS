# Contract: Ensemble Aggregator
Version: 1.0
Last Updated: 2026-02-06

## Description

The Ensemble Aggregator is the convergence point of the FutureOS prediction pipeline. It combines the probability distributions produced by four independent reasoning approaches -- Simulation (40%), Graph of Thought (25%), MCTS (20%), and Debate (15%) -- into a single calibrated prediction. The aggregation uses fixed base weights that are then adjusted by each engine's confidence scores and historical accuracy. After weighted combination, the aggregator applies Platt scaling calibration to correct for systematic biases, producing well-calibrated probabilities with associated confidence intervals. The module also performs consistency checks across engines, flags significant disagreements, and computes overall prediction quality metrics.

## Interface

### Input

```
EnsembleRequest {
  task_id: string

  simulation_output: {
    source: "simulation"
    weight: 0.40                       // Base weight
    distribution: [
      {outcome_id: string, probability: number, std_dev: number}
    ]
    confidence: number                 // 0.0-1.0 based on convergence quality
    convergence_info: {converged: boolean, final_entropy: number}
    num_runs: number
  }

  got_output: {
    source: "got"
    weight: 0.25                       // Base weight
    distribution: [
      {outcome_id: string, probability: number, confidence: number}
    ]
    causal_depth: number               // Reasoning tree depth achieved
    counterfactual_count: number
    reasoning_node_count: number
  }

  mcts_output: {
    source: "mcts"
    weight: 0.20                       // Base weight
    distribution: [
      {outcome_id: string, probability: number, visit_count: number}
    ]
    total_iterations: number
    tree_depth: number
    tail_risks_found: number
  }

  debate_output: {
    source: "debate"
    weight: 0.15                       // Base weight
    distribution: [
      {outcome_id: string, probability: number}
    ]
    consensus_score: number            // 0.0-1.0
    rounds_completed: number
    judge_confidence: number
  }

  calibration_context: {
    prediction_type: string            // e.g., "political", "economic"
    timeframe_horizon: "short" | "medium" | "long"
    region_type: string
    historical_accuracy: {             // From calibration module
      platt_params: {a: number, b: number}  // Platt scaling parameters
      brier_score_baseline: number
      sample_size: number
    }
  }
}
```

### Output

```
EnsembleResult {
  ensemble_id: string                  // UUID v4
  task_id: string
  completed_at: string                 // ISO 8601

  calibrated_probabilities: [
    {
      outcome_id: string
      raw_probability: number          // Before calibration
      calibrated_probability: number   // After Platt scaling
      confidence_interval: {
        lower: number                  // 5th percentile
        upper: number                  // 95th percentile
      }
      source_breakdown: {              // Contribution from each engine
        simulation: {probability: number, effective_weight: number}
        got: {probability: number, effective_weight: number}
        mcts: {probability: number, effective_weight: number}
        debate: {probability: number, effective_weight: number}
      }
    }
  ]

  quality_metrics: {
    overall_confidence: number         // 0.0-1.0
    engine_agreement: number           // 0.0-1.0; inter-engine correlation
    max_engine_divergence: {
      outcome_id: string
      max_diff: number                 // Largest probability difference between any two engines
      engines: [string, string]        // Which engines diverged most
    }
    calibration_adjustment_magnitude: number  // How much Platt scaling changed the distribution
    effective_weights: {               // Actual weights after confidence adjustment
      simulation: number
      got: number
      mcts: number
      debate: number
    }
  }

  disagreement_analysis: [
    {
      outcome_id: string
      engine_probabilities: [{engine: string, probability: number}]
      std_dev: number
      interpretation: string           // Brief explanation of why engines disagree
    }
  ]

  prediction_summary: {
    most_likely_outcome: {
      outcome_id: string
      probability: number
      confidence: number
    }
    uncertainty_level: "low" | "medium" | "high"  // Based on CI width and engine agreement
    key_drivers: string[]              // Top factors identified across engines
  }

  metadata: {
    engines_used: number               // Should be 4; may be fewer if an engine failed
    total_pipeline_time_ms: number     // End-to-end from intent parse to ensemble
    aggregation_time_ms: number        // Just the ensemble computation
  }
}
```

### API Endpoints (if applicable)

```
POST /api/v1/ensemble/aggregate
  Request:  EnsembleRequest
  Response: EnsembleResult
  Auth:     Internal service token
  Timeout:  10s

GET /api/v1/ensemble/:ensemble_id
  Response: EnsembleResult

GET /api/v1/ensemble/:ensemble_id/breakdown
  Response: { source_breakdown per outcome }

POST /api/v1/ensemble/recalibrate
  Request:  { ensemble_id, updated_platt_params }
  Response: EnsembleResult (re-calibrated)
```

## Data Formats

### Weight Adjustment Formula

```
effective_weight(engine) = base_weight(engine) * confidence(engine) / sum(base_weight(i) * confidence(i) for all i)

Where:
  - base_weight: simulation=0.40, got=0.25, mcts=0.20, debate=0.15
  - confidence: engine-specific confidence score (0.0-1.0)
  - Effective weights are re-normalized to sum to 1.0
```

### Platt Scaling

```
calibrated_probability = 1 / (1 + exp(-(a * raw_probability + b)))

Where:
  - a, b are parameters fitted on historical prediction-outcome pairs
  - Parameters are specific to (prediction_type, timeframe_horizon) combinations
  - Minimum sample size: 30 resolved predictions for reliable Platt parameters
  - If insufficient historical data, Platt scaling is skipped and raw probabilities are used
```

### Confidence Interval Estimation

```json
{
  "method": "bootstrap",
  "description": "Confidence intervals computed via parametric bootstrap across engine outputs",
  "steps": [
    "1. For each engine, sample from its output distribution using reported std_dev",
    "2. Recompute weighted average across sampled distributions",
    "3. Repeat 1000 times",
    "4. Take 5th and 95th percentiles as confidence interval bounds"
  ],
  "alternative_method": {
    "name": "analytical",
    "formula": "CI = weighted_mean +/- z * sqrt(sum(w_i^2 * var_i))",
    "used_when": "bootstrap is too slow (< 1% of cases)"
  }
}
```

### Engine Agreement Score

```
engine_agreement = 1 - mean(std_dev(engine_probabilities) for each outcome) / max_possible_std_dev

Where:
  - For each outcome, compute std_dev across the 4 engine probabilities
  - Average these std_devs
  - Normalize by max_possible_std_dev (0.5 for binary outcomes, varies for multi-outcome)
  - Score of 1.0 means perfect agreement; 0.0 means maximum disagreement
```

## Dependencies

- **Depends on:**
  - `simulation-engine` -- provides simulation probability distribution (40% weight)
  - `got-engine` -- provides GoT probability distribution (25% weight)
  - `mcts-engine` -- provides MCTS probability distribution (20% weight)
  - `debate-engine` -- provides debate probability distribution (15% weight)
  - `calibration` -- provides Platt scaling parameters and historical accuracy context

- **Depended by:**
  - `explanation-generator` -- consumes calibrated probabilities and source breakdown for explanation generation
  - `exchange-signal-fusion` -- uses ensemble output as the AI signal
  - `drift-monitor` -- monitors ensemble output for calibration drift
  - `calibration` -- ensemble predictions feed back into calibration tracking

## Performance Requirements

- **Latency:** p50 < 500ms, p95 < 1s, p99 < 2s (aggregation itself is fast; does not include upstream engine time)
- **Throughput:** 200 concurrent aggregation requests
- **Numerical precision:** All probabilities must sum to 1.0 (+/- 1e-9) after both weighting and calibration
- **Graceful degradation:** If one engine fails, remaining engines are re-weighted proportionally; minimum 2 engines required for valid output; if fewer than 2 engines available, return error
- **Bootstrap CI:** 1,000 bootstrap samples by default; reduced to 100 if latency budget is tight
- **Weight bounds:** No single engine's effective weight may exceed 0.60 after confidence adjustment (prevents single-engine dominance)
- **Platt scaling bounds:** Calibrated probabilities are clipped to [0.01, 0.99] to prevent extreme certainty
- **Idempotency:** Same inputs must produce identical outputs (deterministic aggregation; bootstrap uses fixed seed)
- **Availability:** 99.9% -- this is the final prediction delivery point and must be highly reliable
