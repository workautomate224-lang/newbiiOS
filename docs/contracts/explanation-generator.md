# Contract: Explanation Generator
Version: 1.0
Last Updated: 2026-02-06

## Description

The Explanation Generator transforms the raw reasoning outputs and calibrated probabilities from the FutureOS prediction pipeline into human-readable explanations with quantitative factor attribution. It produces two primary artifacts: (1) a structured natural language explanation that walks the user through why the prediction engine arrived at its conclusions, covering key drivers, evidence, reasoning highlights, and uncertainty factors; and (2) a SHAP-like (SHapley Additive exPlanations) factor attribution that quantifies how much each input variable contributed to the final probability distribution. The module uses Claude Sonnet to synthesize the explanation text, ensuring it is accessible to non-technical users while remaining faithful to the underlying reasoning. It adapts output detail level based on the originating product (Lite: concise, Studio: detailed, Exchange: technical).

## Interface

### Input

```
ExplanationRequest {
  task_id: string
  product: "lite" | "studio" | "exchange"  // Controls detail level

  prediction_task: {
    type: string
    region: {name: string, code: string}
    timeframe: {start: string, end: string, horizon: string}
    outcomes: [{id, label, description}]
    key_variables: [{name, category, importance}]
    raw_query: string
  }

  ensemble_result: {
    calibrated_probabilities: [
      {
        outcome_id: string
        calibrated_probability: number
        confidence_interval: {lower: number, upper: number}
        source_breakdown: {
          simulation: {probability: number, effective_weight: number}
          got: {probability: number, effective_weight: number}
          mcts: {probability: number, effective_weight: number}
          debate: {probability: number, effective_weight: number}
        }
      }
    ]
    quality_metrics: {overall_confidence: number, engine_agreement: number}
    prediction_summary: {most_likely_outcome: object, uncertainty_level: string}
  }

  reasoning_context: {
    got_reasoning_summary: string       // From GoT engine
    got_causal_graph: {nodes: [], edges: []}
    got_counterfactuals: [{scenario, insight}]
    debate_key_insights: [{insight, source_role, impact}]
    debate_historical_precedents: [{event, date, similarity_score, outcome}]
    mcts_tail_risks: [{probability, impact_description, trigger_conditions}]
    mcts_discovered_scenarios: [{description, probability, significance}]
    simulation_convergence: object
  }
}
```

### Output

```
ExplanationResult {
  explanation_id: string              // UUID v4
  task_id: string
  product: string
  generated_at: string                // ISO 8601

  explanation_text: {
    headline: string                  // 1-sentence prediction summary (max 150 chars)
    summary: string                   // 2-3 paragraph accessible explanation

    sections: [
      {
        title: string
        content: string
        type: "overview" | "key_drivers" | "evidence" | "scenarios" | "risks" | "methodology" | "confidence"
      }
    ]

    key_drivers_narrative: string     // Paragraph explaining top 3-5 factors
    uncertainty_narrative: string     // Paragraph explaining what could change the prediction
    historical_context: string        // How this compares to historical precedents

    detail_level: "concise" | "standard" | "technical"  // Based on product
  }

  shap_factors: [
    {
      variable: string               // Key variable name
      category: string               // Variable category
      shap_value: number             // Contribution magnitude (-1.0 to 1.0)
      direction: "positive" | "negative"  // Direction of influence on most likely outcome
      rank: number                   // Importance ranking (1 = most important)
      explanation: string            // 1-sentence explanation of this factor's contribution
      data_point: {                  // The actual data behind this factor
        value: any
        source: string
        as_of: string               // Date of the data point
      }
    }
  ]

  outcome_explanations: [            // Per-outcome detailed explanation
    {
      outcome_id: string
      probability: number
      why_likely: string[]           // Factors supporting this outcome
      why_unlikely: string[]         // Factors working against this outcome
      what_would_change: string[]    // Conditions that would increase this outcome's probability
    }
  ]

  visualizations: {                  // Data for frontend visualization
    probability_bar_chart: {
      labels: string[]
      values: number[]
      confidence_intervals: [{lower: number, upper: number}]
    }
    shap_waterfall: {
      base_value: number             // Prior/base probability
      features: [{name: string, value: number, cumulative: number}]
      final_value: number
    }
    engine_agreement_radar: {
      axes: string[]                 // Engine names
      values_per_outcome: [{outcome_id: string, values: number[]}]
    }
    causal_chain: {                  // Simplified causal graph for display
      nodes: [{id: string, label: string, importance: number}]
      edges: [{source: string, target: string, weight: number}]
    }
  }

  metadata: {
    sonnet_tokens_used: {input: number, output: number}
    generation_time_ms: number
    model: string
  }
}
```

### API Endpoints (if applicable)

```
POST /api/v1/explanation/generate
  Request:  ExplanationRequest
  Response: ExplanationResult
  Auth:     Internal service token (or user token for direct access)
  Timeout:  30s

GET /api/v1/explanation/:explanation_id
  Response: ExplanationResult

GET /api/v1/explanation/:explanation_id/shap
  Response: { shap_factors: ShapFactor[] }

GET /api/v1/explanation/:explanation_id/text
  Response: { explanation_text: ExplanationText }

GET /api/v1/explanation/:explanation_id/visualizations
  Response: { visualizations: Visualizations }
```

## Data Formats

### SHAP Factor Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["variable", "category", "shap_value", "direction", "rank", "explanation"],
  "properties": {
    "variable": { "type": "string" },
    "category": { "type": "string", "enum": ["demographic", "economic", "political", "sentiment", "environmental", "behavioral"] },
    "shap_value": { "type": "number", "minimum": -1, "maximum": 1 },
    "direction": { "type": "string", "enum": ["positive", "negative"] },
    "rank": { "type": "integer", "minimum": 1 },
    "explanation": { "type": "string", "maxLength": 200 },
    "data_point": {
      "type": "object",
      "properties": {
        "value": {},
        "source": { "type": "string" },
        "as_of": { "type": "string", "format": "date" }
      }
    }
  }
}
```

### Detail Level Mapping

```json
{
  "lite": {
    "detail_level": "concise",
    "max_sections": 3,
    "max_shap_factors": 5,
    "summary_max_words": 150,
    "include_methodology": false,
    "include_engine_breakdown": false,
    "include_historical_precedents": false
  },
  "studio": {
    "detail_level": "standard",
    "max_sections": 7,
    "max_shap_factors": 15,
    "summary_max_words": 500,
    "include_methodology": true,
    "include_engine_breakdown": true,
    "include_historical_precedents": true
  },
  "exchange": {
    "detail_level": "technical",
    "max_sections": 5,
    "max_shap_factors": 10,
    "summary_max_words": 300,
    "include_methodology": true,
    "include_engine_breakdown": true,
    "include_historical_precedents": false,
    "include_calibration_details": true,
    "include_signal_metadata": true
  }
}
```

### SHAP Value Computation Method

```
SHAP-like attribution is computed by measuring each variable's marginal contribution:

1. For each key_variable V:
   a. Collect V's sensitivity from simulation agent data
   b. Collect V's causal edge weights from GoT causal graph
   c. Collect V's impact from MCTS variable changes along paths
   d. Collect V's mention frequency and argument strength from debate

2. Combine signals:
   shap_value(V) = w_sim * sim_sensitivity(V) + w_got * causal_weight(V) +
                   w_mcts * mcts_impact(V) + w_debate * debate_mention_score(V)

3. Normalize:
   shap_values are normalized so that sum(|shap_value(V)|) = 1.0

Note: This is a SHAP-like approximation, not exact Shapley values, due to the
non-decomposable nature of LLM-based reasoning engines.
```

## Dependencies

- **Depends on:**
  - `ensemble-aggregator` -- provides calibrated probabilities, source breakdown, and quality metrics
  - `got-engine` -- provides reasoning summaries, causal graph, and counterfactuals
  - `debate-engine` -- provides key insights, historical precedents, and role assessments
  - `mcts-engine` -- provides tail risks and discovered scenarios
  - `simulation-engine` -- provides convergence data and variable sensitivity
  - LLM Provider (Claude Sonnet) -- generates natural language explanation text

- **Depended by:**
  - Lite product frontend -- displays headline, summary, and top SHAP factors
  - Studio product frontend -- displays full explanation with all sections and visualizations
  - Exchange product API -- provides technical explanation alongside signal data

## Performance Requirements

- **Latency:** p50 < 5s, p95 < 10s, p99 < 15s
- **Token budget:** Max 4,000 input tokens + 3,000 output tokens per Sonnet call; typically 2 calls (one for explanation text, one for SHAP narrative)
- **SHAP factors:** Must produce at least 3 and at most 15 ranked factors; all factors must have non-zero shap_value
- **Explanation quality:** Explanation text must reference at least 2 specific data points and at least 1 historical precedent (when available)
- **Consistency:** Explanation text must not contradict the calibrated probabilities; most-likely outcome in text must match most-likely outcome in probabilities
- **Readability:** Lite explanations target Flesch-Kincaid grade level 8-10; Studio targets 10-12; Exchange targets 12-14
- **Visualization data:** All visualization data structures must be complete and valid for frontend rendering; no null values in chart data
- **Caching:** Explanations cached for 1 hour; invalidated if ensemble result is updated
- **Availability:** 99.9% -- this is user-facing output
