# Contract: Drift Monitor
Version: 1.0
Last Updated: 2026-02-06

## Description

The Drift Monitor is a continuous background service that watches for four categories of drift that could degrade prediction quality: (1) Data freshness drift -- detecting when source data becomes stale beyond acceptable thresholds; (2) Causal edge decay -- identifying causal relationships in the knowledge graph that have weakened due to time or contradicting evidence; (3) Agent behavioral drift -- detecting when the synthetic population's behavioral assumptions no longer align with observed real-world behavior; and (4) Brier score drift -- monitoring whether the prediction engine's calibration is degrading over time by tracking rolling Brier scores against resolved predictions. When drift is detected beyond configurable thresholds, the monitor triggers appropriate recalibration actions: data refresh, causal graph pruning, population re-synthesis, or Platt parameter re-fitting.

## Interface

### Input

```
// The Drift Monitor continuously ingests from multiple sources:

DriftMonitorInputs {
  // 1. Data freshness tracking
  data_sources: [
    {
      source_name: string           // e.g., "census_acs", "fred_economic", "news_sentiment"
      source_type: "census" | "economic" | "sentiment"
      last_fetch_at: string         // ISO 8601
      last_data_vintage: string     // ISO 8601 -- when the data itself was produced
      fetch_frequency: string       // Expected: "daily", "weekly", "monthly", "quarterly"
      status: "active" | "degraded" | "unavailable"
    }
  ]

  // 2. Causal graph state
  causal_graph_snapshot: {
    total_edges: number
    edges_by_age: [                 // Distribution of edge ages
      {age_months: number, count: number, avg_weight: number}
    ]
    unreinforced_edges: number      // Edges not confirmed by any prediction in 6+ months
    avg_confidence: number
    lowest_confidence_edges: [{source, target, confidence, age_months}]
  }

  // 3. Agent behavioral signals
  behavioral_signals: [
    {
      variable: string              // Key variable being tracked
      predicted_sensitivity: number // What the population model assumed
      observed_sensitivity: number  // What real-world data suggests
      deviation: number             // |predicted - observed|
      sample_source: string         // Where the observed data comes from
      sample_date: string
    }
  ]

  // 4. Prediction accuracy tracking
  resolved_predictions: [
    {
      task_id: string
      prediction_type: string
      predicted_distribution: [{outcome_id: string, probability: number}]
      actual_outcome_id: string
      resolved_at: string           // ISO 8601
      brier_score: number           // For this individual prediction
      time_horizon: "short" | "medium" | "long"
    }
  ]

  // Configuration
  config: {
    check_interval_minutes: number  // How often to run drift checks (default: 60)
    data_freshness_thresholds: {
      census: { warn_days: 365, critical_days: 730 }
      economic: { warn_days: 30, critical_days: 90 }
      sentiment: { warn_days: 3, critical_days: 7 }
    }
    causal_decay_threshold: number   // Edge weight below which to flag (default: 0.1)
    behavioral_drift_threshold: number  // Deviation threshold (default: 0.15)
    brier_drift_threshold: number    // Rolling Brier score increase threshold (default: 0.05)
    brier_window_size: number        // Number of recent predictions for rolling average (default: 50)
  }
}
```

### Output

```
DriftReport {
  report_id: string                  // UUID v4
  generated_at: string               // ISO 8601
  check_type: "scheduled" | "manual" | "triggered"

  overall_status: "healthy" | "warning" | "critical"

  data_freshness: {
    status: "healthy" | "warning" | "critical"
    sources: [
      {
        source_name: string
        status: "fresh" | "stale" | "critical" | "unavailable"
        age_days: number
        threshold_days: number
        action_required: string | null  // e.g., "refresh_census_data"
      }
    ]
    stale_count: number
    critical_count: number
  }

  causal_drift: {
    status: "healthy" | "warning" | "critical"
    total_edges_monitored: number
    decayed_edges: [
      {
        source: string
        target: string
        current_weight: number
        original_weight: number
        age_months: number
        last_reinforced: string
        recommendation: "reinforce" | "decay" | "remove"
      }
    ]
    edges_flagged: number
    edges_recommended_removal: number
  }

  behavioral_drift: {
    status: "healthy" | "warning" | "critical"
    drifted_variables: [
      {
        variable: string
        predicted_sensitivity: number
        observed_sensitivity: number
        deviation: number
        trend: "increasing" | "decreasing" | "stable"
        recommendation: string       // e.g., "re-synthesize population for region X"
      }
    ]
    variables_flagged: number
    population_resynthesis_needed: boolean
  }

  brier_drift: {
    status: "healthy" | "warning" | "critical"
    current_rolling_brier: number     // Rolling average over window
    baseline_brier: number            // Historical baseline
    drift_magnitude: number           // current - baseline
    trend: "improving" | "stable" | "degrading"
    by_type: [                        // Breakdown by prediction type
      {
        prediction_type: string
        rolling_brier: number
        sample_count: number
        trend: string
      }
    ]
    recalibration_needed: boolean
  }

  triggered_actions: [
    {
      action_id: string
      action_type: "data_refresh" | "causal_prune" | "population_resynth" | "platt_refit" | "alert"
      trigger_reason: string
      target: string                  // What entity is being acted on
      priority: "low" | "medium" | "high" | "critical"
      status: "pending" | "in_progress" | "completed" | "failed"
      triggered_at: string
    }
  ]

  next_check_at: string              // ISO 8601
}
```

### API Endpoints (if applicable)

```
GET /api/v1/drift/status
  Response: DriftReport (latest)
  Auth:     Internal service token or admin token

GET /api/v1/drift/history?from=:date&to=:date
  Response: { reports: DriftReport[] }

POST /api/v1/drift/check
  Request:  { check_type: "manual", scope?: "all" | "data" | "causal" | "behavioral" | "brier" }
  Response: DriftReport

GET /api/v1/drift/actions
  Response: { actions: TriggeredAction[] }

POST /api/v1/drift/actions/:action_id/execute
  Response: { action: TriggeredAction, result: object }

PUT /api/v1/drift/config
  Request:  Partial<DriftConfig>
  Response: { config: DriftConfig }

GET /api/v1/drift/brier-history
  Response: { scores: [{date, rolling_brier, sample_count}] }
```

## Data Formats

### Drift Alert Schema

```json
{
  "type": "object",
  "required": ["alert_id", "severity", "category", "message", "detected_at"],
  "properties": {
    "alert_id": { "type": "string", "format": "uuid" },
    "severity": { "type": "string", "enum": ["info", "warning", "critical"] },
    "category": { "type": "string", "enum": ["data_freshness", "causal_decay", "behavioral_drift", "brier_drift"] },
    "message": { "type": "string" },
    "details": { "type": "object" },
    "detected_at": { "type": "string", "format": "date-time" },
    "acknowledged": { "type": "boolean", "default": false },
    "resolved": { "type": "boolean", "default": false },
    "auto_action_taken": { "type": "boolean" },
    "auto_action_id": { "type": "string" }
  }
}
```

### Brier Score Computation

```
Brier Score = (1/N) * sum((predicted_probability_of_actual_outcome - 1)^2 +
              sum((predicted_probability_of_non_actual_outcome)^2))

For binary outcomes:
  Brier = (1/N) * sum((f_i - o_i)^2)
  Where f_i = predicted probability, o_i = 1 if outcome occurred, 0 otherwise

Rolling Brier:
  Computed over the most recent `brier_window_size` resolved predictions
  Drift = rolling_brier - baseline_brier
  Recalibration triggered when drift > brier_drift_threshold
```

### PostgreSQL Monitoring Tables

```sql
CREATE TABLE drift_reports (
  report_id UUID PRIMARY KEY,
  generated_at TIMESTAMP NOT NULL,
  check_type VARCHAR(20) NOT NULL,
  overall_status VARCHAR(20) NOT NULL,
  data_freshness_status VARCHAR(20),
  causal_drift_status VARCHAR(20),
  behavioral_drift_status VARCHAR(20),
  brier_drift_status VARCHAR(20),
  report_json JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE drift_actions (
  action_id UUID PRIMARY KEY,
  report_id UUID REFERENCES drift_reports(report_id),
  action_type VARCHAR(50) NOT NULL,
  trigger_reason TEXT NOT NULL,
  target VARCHAR(255),
  priority VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  triggered_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  result_json JSONB
);

CREATE TABLE brier_scores (
  score_id UUID PRIMARY KEY,
  task_id UUID NOT NULL,
  prediction_type VARCHAR(50),
  brier_score NUMERIC(10, 6) NOT NULL,
  resolved_at TIMESTAMP NOT NULL,
  time_horizon VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_brier_resolved ON brier_scores(resolved_at DESC);
CREATE INDEX idx_brier_type ON brier_scores(prediction_type, resolved_at DESC);
CREATE INDEX idx_drift_reports_date ON drift_reports(generated_at DESC);
```

## Dependencies

- **Depends on:**
  - All data source APIs (census, economic, sentiment) -- for freshness checks via health endpoints
  - `causal-graph` -- for querying edge ages, weights, and reinforcement history
  - `pop-synthesizer` -- for behavioral sensitivity assumptions to compare against observed data
  - `calibration` -- for Brier score history and baseline metrics
  - `ensemble-aggregator` -- for resolved prediction tracking
  - PostgreSQL -- for storing drift reports, actions, and Brier score history
  - Alerting system (e.g., PagerDuty, Slack webhook) -- for critical drift notifications

- **Depended by:**
  - `calibration` -- drift detection triggers recalibration
  - `causal-graph` -- drift monitor triggers edge decay and pruning
  - `data-orchestrator` -- drift monitor triggers data refresh
  - `pop-synthesizer` -- behavioral drift triggers population re-synthesis
  - Admin dashboard -- displays drift status and action history

## Performance Requirements

- **Check frequency:** Default every 60 minutes; configurable from 15 minutes to 24 hours
- **Check latency:** Full drift check across all four categories must complete within 30 seconds
- **Data freshness check:** < 2s (simple age comparison against thresholds)
- **Causal drift check:** < 10s (Neo4j query for edge ages and weights)
- **Behavioral drift check:** < 10s (comparison of predicted vs. observed sensitivities)
- **Brier drift check:** < 5s (rolling average computation over recent predictions)
- **Alert delivery:** Critical alerts delivered within 60 seconds of detection
- **Action execution:** Triggered actions queued within 5 seconds; execution time depends on action type (data refresh: minutes, Platt refit: seconds, population resynth: minutes)
- **History retention:** Drift reports retained for 90 days; Brier scores retained indefinitely
- **False positive rate:** Target < 5% false critical alerts; achieved through hysteresis (must exceed threshold for 2 consecutive checks before alerting)
- **Availability:** 99.9% -- drift monitoring is critical for prediction quality assurance
