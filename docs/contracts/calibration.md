# Contract: Calibration
Version: 1.0
Last Updated: 2026-02-06

## Description

The Calibration module is responsible for tracking and improving the accuracy of FutureOS predictions over time. It maintains a historical record of all predictions paired with their actual outcomes, computes Brier scores as the primary accuracy metric, performs historical backtesting against known outcomes, and fits Platt scaling parameters that correct systematic biases in the prediction engine's raw probabilities. The module ensures that when FutureOS says an outcome has a 70% probability, it actually occurs approximately 70% of the time across a sufficient sample. Calibration parameters are segmented by prediction type and time horizon, since the engine may be better calibrated for some categories than others. The module provides Platt scaling parameters to the Ensemble Aggregator for real-time calibration and feeds accuracy metrics to the Drift Monitor for degradation detection.

## Interface

### Input

```
// 1. Recording a prediction for future calibration tracking
PredictionRecord {
  task_id: string                    // UUID of the prediction task
  prediction_type: string            // "political", "economic", etc.
  region_code: string
  time_horizon: "short" | "medium" | "long"
  predicted_at: string               // ISO 8601

  predicted_distribution: [
    {
      outcome_id: string
      outcome_label: string
      raw_probability: number        // Before calibration
      calibrated_probability: number // After Platt scaling
    }
  ]

  ensemble_metadata: {
    engines_used: string[]
    overall_confidence: number
    engine_agreement: number
  }

  resolution_deadline: string        // ISO 8601 -- when this prediction should be resolved by
}

// 2. Recording an actual outcome (resolution)
OutcomeResolution {
  task_id: string
  actual_outcome_id: string          // Which outcome actually occurred
  resolved_at: string                // ISO 8601
  resolution_source: string          // How the outcome was determined
  resolution_confidence: number      // How certain we are about the resolution (0.0-1.0)
  notes?: string
}

// 3. Backtesting request
BacktestRequest {
  prediction_type?: string           // Filter by type
  time_horizon?: string              // Filter by horizon
  region_code?: string               // Filter by region
  date_range: {start: string, end: string}  // Period to backtest
  min_sample_size: number            // Minimum resolved predictions (default: 30)
}

// 4. Platt parameter request
PlattParameterRequest {
  prediction_type: string
  time_horizon: "short" | "medium" | "long"
  min_sample_size: number            // Minimum resolved predictions for reliable params (default: 30)
}
```

### Output

```
// 1. Calibration metrics
CalibrationMetrics {
  metrics_id: string                 // UUID v4
  computed_at: string                // ISO 8601
  scope: {
    prediction_type: string | "all"
    time_horizon: string | "all"
    region_code: string | "all"
    date_range: {start: string, end: string}
  }

  brier_score: {
    overall: number                  // 0.0 (perfect) to 2.0 (worst)
    decomposition: {
      reliability: number            // Calibration component
      resolution: number             // Discrimination component
      uncertainty: number            // Base rate uncertainty
    }
    by_type: [
      {
        prediction_type: string
        brier_score: number
        sample_count: number
      }
    ]
    by_horizon: [
      {
        time_horizon: string
        brier_score: number
        sample_count: number
      }
    ]
    rolling_30day: number
    rolling_90day: number
    trend: "improving" | "stable" | "degrading"
  }

  calibration_curve: {
    bins: [
      {
        bin_center: number           // e.g., 0.05, 0.15, ..., 0.95
        predicted_avg: number        // Average predicted probability in this bin
        observed_frequency: number   // Fraction of times the outcome actually occurred
        sample_count: number         // Number of predictions in this bin
        confidence_interval: {lower: number, upper: number}  // 95% CI on observed_frequency
      }
    ]
    expected_calibration_error: number  // ECE metric
    max_calibration_error: number       // MCE metric
  }

  accuracy_summary: {
    total_predictions: number
    resolved_predictions: number
    pending_predictions: number
    correct_top_outcome_pct: number   // % where most-likely outcome was correct
    mean_predicted_probability_of_actual: number  // Higher is better
    log_loss: number                  // Alternative accuracy metric
  }

  sample_size: number
  statistically_reliable: boolean    // True if sample_size >= min_sample_size
}

// 2. Adjusted probabilities (Platt scaling output)
PlattCalibrationResult {
  platt_id: string
  fitted_at: string                  // ISO 8601
  scope: {
    prediction_type: string
    time_horizon: string
  }

  parameters: {
    a: number                        // Platt scaling slope
    b: number                        // Platt scaling intercept
    fitted_on_n: number              // Sample size used for fitting
  }

  validation: {
    pre_calibration_ece: number      // ECE before Platt scaling
    post_calibration_ece: number     // ECE after Platt scaling
    improvement_pct: number          // How much ECE improved
    cross_validation_scores: number[]  // 5-fold CV Brier scores
  }

  adjusted_probabilities?: [         // If specific predictions were passed for adjustment
    {
      outcome_id: string
      raw_probability: number
      adjusted_probability: number
    }
  ]

  valid_until: string                // ISO 8601 -- refit recommended after this date
  status: "active" | "stale" | "insufficient_data"
}

// 3. Backtest result
BacktestResult {
  backtest_id: string
  executed_at: string

  scope: {
    prediction_type: string | "all"
    time_horizon: string | "all"
    date_range: {start: string, end: string}
  }

  results: {
    total_predictions_evaluated: number
    brier_score: number
    calibration_curve: object         // Same format as CalibrationMetrics
    accuracy_by_month: [
      {month: string, brier_score: number, sample_count: number}
    ]
    best_performing_type: {type: string, brier_score: number}
    worst_performing_type: {type: string, brier_score: number}
  }

  recommendations: [
    {
      area: string
      issue: string
      suggested_action: string
    }
  ]
}
```

### API Endpoints (if applicable)

```
POST /api/v1/calibration/record-prediction
  Request:  PredictionRecord
  Response: { recorded: true, task_id: string }

POST /api/v1/calibration/resolve
  Request:  OutcomeResolution
  Response: { resolved: true, brier_score: number }

GET /api/v1/calibration/metrics
  Query:    ?type=political&horizon=short&from=2025-01-01&to=2025-12-31
  Response: CalibrationMetrics

GET /api/v1/calibration/platt-params
  Query:    ?type=political&horizon=short
  Response: PlattCalibrationResult

POST /api/v1/calibration/refit-platt
  Request:  PlattParameterRequest
  Response: PlattCalibrationResult

POST /api/v1/calibration/backtest
  Request:  BacktestRequest
  Response: BacktestResult

GET /api/v1/calibration/curve
  Query:    ?type=political&bins=10
  Response: { calibration_curve: CalibrationCurve }

GET /api/v1/calibration/history
  Query:    ?metric=brier&granularity=weekly&from=:date&to=:date
  Response: { history: [{period, value, sample_count}] }
```

## Data Formats

### Platt Scaling Formula

```
calibrated_p = 1 / (1 + exp(-(a * raw_p + b)))

Where:
  - raw_p: uncalibrated probability from ensemble aggregator
  - a, b: parameters fitted via maximum likelihood on historical (prediction, outcome) pairs
  - For multi-class: applied independently to each outcome, then re-normalized to sum to 1.0

Fitting procedure:
  1. Collect all resolved predictions for given (type, horizon) scope
  2. Require minimum 30 resolved predictions
  3. Fit a, b via logistic regression: outcome ~ raw_probability
  4. Validate via 5-fold cross-validation
  5. Accept if post_calibration_ece < pre_calibration_ece; otherwise retain previous parameters
  6. Refit recommended every 30 days or after 50 new resolutions, whichever comes first
```

### Brier Score Decomposition

```
Brier Score = Reliability - Resolution + Uncertainty

Reliability = (1/N) * sum(n_k * (predicted_k - observed_k)^2)
  -- How well calibrated the probabilities are
  -- Lower is better; 0 means perfectly calibrated

Resolution = (1/N) * sum(n_k * (observed_k - base_rate)^2)
  -- How well the model discriminates between outcomes
  -- Higher is better

Uncertainty = base_rate * (1 - base_rate)
  -- Inherent uncertainty of the prediction problem
  -- Cannot be reduced by a better model
```

### PostgreSQL Schema

```sql
CREATE TABLE prediction_records (
  task_id UUID PRIMARY KEY,
  prediction_type VARCHAR(50) NOT NULL,
  region_code VARCHAR(20),
  time_horizon VARCHAR(20) NOT NULL,
  predicted_at TIMESTAMP NOT NULL,
  predicted_distribution JSONB NOT NULL,
  ensemble_metadata JSONB,
  resolution_deadline TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE outcome_resolutions (
  task_id UUID PRIMARY KEY REFERENCES prediction_records(task_id),
  actual_outcome_id VARCHAR(100) NOT NULL,
  resolved_at TIMESTAMP NOT NULL,
  resolution_source VARCHAR(255),
  resolution_confidence NUMERIC(4, 3),
  brier_score NUMERIC(10, 6),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE platt_parameters (
  platt_id UUID PRIMARY KEY,
  prediction_type VARCHAR(50) NOT NULL,
  time_horizon VARCHAR(20) NOT NULL,
  param_a NUMERIC(10, 6) NOT NULL,
  param_b NUMERIC(10, 6) NOT NULL,
  fitted_on_n INTEGER NOT NULL,
  pre_ece NUMERIC(10, 6),
  post_ece NUMERIC(10, 6),
  fitted_at TIMESTAMP NOT NULL,
  valid_until TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(prediction_type, time_horizon, status)
);

CREATE INDEX idx_predictions_type ON prediction_records(prediction_type, time_horizon);
CREATE INDEX idx_predictions_date ON prediction_records(predicted_at DESC);
CREATE INDEX idx_resolutions_date ON outcome_resolutions(resolved_at DESC);
CREATE INDEX idx_platt_active ON platt_parameters(prediction_type, time_horizon) WHERE status = 'active';
```

## Dependencies

- **Depends on:**
  - `ensemble-aggregator` -- provides predicted probability distributions to record
  - Outcome resolution feeds -- external or manual confirmation of actual outcomes
  - PostgreSQL -- stores all prediction records, resolutions, and Platt parameters
  - SciPy -- for logistic regression fitting of Platt parameters and statistical tests

- **Depended by:**
  - `ensemble-aggregator` -- consumes Platt scaling parameters for real-time calibration
  - `drift-monitor` -- reads Brier score history and trends for drift detection
  - Admin dashboard -- displays calibration curves and accuracy metrics
  - Exchange product -- calibration metrics inform user-facing accuracy disclosures

## Performance Requirements

- **Recording latency:** < 50ms to record a new prediction or resolution
- **Metrics computation:** < 2s for CalibrationMetrics over up to 10,000 resolved predictions
- **Platt fitting:** < 5s for parameter fitting including cross-validation
- **Backtest:** < 30s for full backtest over 1 year of predictions
- **Platt parameter staleness:** Parameters re-fitted when: (a) 30 days elapsed, (b) 50 new resolutions accumulated, or (c) Drift Monitor triggers recalibration
- **Minimum sample sizes:** 30 for reliable Platt parameters; 10 for preliminary metrics with "unreliable" flag; below 10 returns insufficient_data status
- **Calibration curve bins:** 10 bins by default (0-10%, 10-20%, ..., 90-100%); configurable from 5 to 20
- **Data retention:** Prediction records and resolutions retained indefinitely; Platt parameter history retained for 2 years
- **Availability:** 99.9% for read endpoints; 99.5% for write/compute endpoints
- **Consistency:** All Brier scores computed at write time (when resolution is recorded) to avoid recalculation overhead
