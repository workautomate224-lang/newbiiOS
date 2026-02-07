# Contract: Exchange Signal Fusion
Version: 1.0
Last Updated: 2026-02-06

## Description

The Exchange Signal Fusion module is the core mechanism of the FutureOS Exchange product -- the prediction protocol where users can trade on prediction outcomes. It implements a triple-signal architecture that requires three independent signals to converge before producing a tradeable prediction price. The three signals are: (1) AI Signal -- the calibrated probability from the FutureOS prediction engine (ensemble aggregator output); (2) Financial Signal -- derived from market prices, order flow, and liquidity on the Exchange itself, reflecting the collective intelligence of market participants; and (3) Reputation Signal -- weighted by the historical track records of users who have taken positions, giving more influence to consistently accurate predictors. The triple-signal requirement is a core design principle of Exchange: no single signal source can dominate, and the fused output reflects a synthesis of machine intelligence, market wisdom, and proven human judgment. The module outputs a fused probability with a full breakdown of each signal's contribution.

## Interface

### Input

```
SignalFusionRequest {
  market_id: string                  // Exchange market identifier
  task_id: string                    // Underlying prediction task
  outcomes: [{id: string, label: string}]

  ai_signal: {
    source: "futureos_engine"
    ensemble_id: string
    distribution: [
      {
        outcome_id: string
        probability: number          // Calibrated probability from ensemble aggregator
        confidence_interval: {lower: number, upper: number}
      }
    ]
    overall_confidence: number       // 0.0-1.0
    engine_agreement: number         // 0.0-1.0
    calibration_quality: {
      platt_applied: boolean
      historical_brier: number
      sample_size: number
    }
    generated_at: string             // ISO 8601
    staleness_hours: number          // How old this signal is
  }

  financial_signal: {
    source: "exchange_market"
    market_state: {
      status: "pre_market" | "active" | "suspended" | "closed"
      opened_at: string
      total_volume: number           // Total tokens/currency traded
      total_positions: number        // Number of open positions
      liquidity_depth: number        // Market depth metric
    }
    price_distribution: [
      {
        outcome_id: string
        last_price: number           // Most recent trade price (0.0-1.0)
        bid: number                  // Best bid
        ask: number                  // Best ask
        spread: number               // bid-ask spread
        volume_24h: number           // 24-hour volume for this outcome
        vwap_24h: number             // Volume-weighted average price
        price_history: [             // Recent price snapshots
          {timestamp: string, price: number, volume: number}
        ]
      }
    ]
    order_flow: {
      net_buy_pressure: number       // Positive = more buying; -1.0 to 1.0
      large_order_activity: boolean  // Whether institutional-size orders detected
      momentum: "bullish" | "bearish" | "neutral"
    }
  }

  reputation_signal: {
    source: "user_track_records"
    position_weighted_distribution: [
      {
        outcome_id: string
        weighted_probability: number // Position-weighted by reputation scores
        raw_position_count: number   // Number of users holding this position
        total_reputation_weight: number  // Sum of reputation scores backing this outcome
      }
    ]
    top_predictors: [                // Top 10 by reputation score who have positions
      {
        user_id: string              // Anonymized
        reputation_score: number     // 0.0-1.0
        historical_accuracy: number  // Brier score (lower = better)
        position_outcome_id: string
        position_size: number
        track_record: {
          total_predictions: number
          correct_predictions: number
          avg_brier_score: number
          specialization: string[]   // Prediction types they're best at
        }
      }
    ]
    consensus_strength: number       // How much top predictors agree (0.0-1.0)
    participation_rate: number       // % of reputation-weighted users who have taken a position
  }

  fusion_config: {
    ai_weight: number                // Default: 0.40
    financial_weight: number         // Default: 0.35
    reputation_weight: number        // Default: 0.25
    min_signals_required: number     // Default: 3 (triple-signal requirement)
    staleness_penalty: boolean       // Reduce AI signal weight if stale (default: true)
    low_liquidity_adjustment: boolean  // Adjust financial signal weight in thin markets (default: true)
    reputation_minimum_participants: number  // Min reputation-weighted users for valid signal (default: 5)
  }
}
```

### Output

```
SignalFusionResult {
  fusion_id: string                  // UUID v4
  market_id: string
  task_id: string
  fused_at: string                   // ISO 8601

  fused_probability: [
    {
      outcome_id: string
      probability: number            // Fused probability
      confidence_interval: {lower: number, upper: number}
    }
  ]

  signal_breakdown: {
    ai: {
      effective_weight: number       // Actual weight after adjustments
      distribution: [{outcome_id: string, probability: number}]
      quality_score: number          // Signal quality assessment (0.0-1.0)
      adjustments_applied: string[]  // e.g., ["staleness_penalty: -10%"]
    }
    financial: {
      effective_weight: number
      distribution: [{outcome_id: string, probability: number}]
      quality_score: number
      adjustments_applied: string[]  // e.g., ["low_liquidity_discount: -15%"]
    }
    reputation: {
      effective_weight: number
      distribution: [{outcome_id: string, probability: number}]
      quality_score: number
      adjustments_applied: string[]  // e.g., ["insufficient_participants: -20%"]
    }
  }

  signal_agreement: {
    pairwise: {
      ai_vs_financial: number        // Correlation -1.0 to 1.0
      ai_vs_reputation: number
      financial_vs_reputation: number
    }
    three_way_agreement: number      // Overall agreement across all 3 signals (0.0-1.0)
    divergence_alerts: [             // Significant disagreements between signals
      {
        signal_a: string
        signal_b: string
        outcome_id: string
        probability_diff: number
        interpretation: string       // e.g., "Market pricing significantly higher than AI model"
      }
    ]
  }

  market_impact: {
    suggested_fair_value: [{outcome_id: string, fair_value: number}]
    mispricing_detected: [           // Outcomes where market price diverges from fused probability
      {
        outcome_id: string
        market_price: number
        fused_probability: number
        mispricing_magnitude: number
        direction: "overpriced" | "underpriced"
      }
    ]
  }

  signal_validity: {
    all_signals_present: boolean
    signals_present: string[]
    signals_missing: string[]
    triple_signal_met: boolean       // Core requirement
    degraded_mode: boolean           // True if < 3 signals; fused output marked as provisional
    validity_warnings: string[]
  }

  metadata: {
    fusion_computation_time_ms: number
    signal_ages: {
      ai_hours: number
      financial_hours: number        // Based on last trade time
      reputation_hours: number       // Based on last position update
    }
  }
}
```

### API Endpoints (if applicable)

```
POST /api/v1/exchange/fuse
  Request:  SignalFusionRequest
  Response: SignalFusionResult
  Auth:     Exchange service token
  Timeout:  5s

GET /api/v1/exchange/market/:market_id/fusion
  Response: SignalFusionResult (latest)

GET /api/v1/exchange/market/:market_id/fusion/history
  Query:    ?from=:date&to=:date&granularity=hourly
  Response: { history: [{timestamp, fused_probability, signal_breakdown}] }

GET /api/v1/exchange/market/:market_id/signals
  Response: { ai: object, financial: object, reputation: object }

GET /api/v1/exchange/market/:market_id/mispricing
  Response: { mispricing: MispricingAlert[] }

WebSocket /ws/v1/exchange/market/:market_id/fusion-stream
  Emits:    Real-time fused probability updates on any signal change

// Reputation management
GET /api/v1/exchange/reputation/:user_id
  Response: { reputation_score, track_record, ranking }

GET /api/v1/exchange/reputation/leaderboard
  Query:    ?type=:prediction_type&period=:period
  Response: { leaderboard: [{user_id, score, accuracy, rank}] }
```

## Data Formats

### Weight Adjustment Rules

```json
{
  "adjustment_rules": {
    "staleness_penalty": {
      "description": "Reduce AI signal weight when prediction is stale",
      "formula": "ai_weight *= max(0.5, 1.0 - (staleness_hours / 48))",
      "threshold": "Applied when staleness_hours > 6",
      "max_reduction": "50%"
    },
    "low_liquidity_adjustment": {
      "description": "Reduce financial signal weight in thin markets",
      "formula": "financial_weight *= min(1.0, log10(total_volume) / log10(min_volume_threshold))",
      "threshold": "Applied when total_volume < 10,000",
      "max_reduction": "60%"
    },
    "reputation_participation": {
      "description": "Reduce reputation signal weight when few reputable users have positions",
      "formula": "reputation_weight *= min(1.0, active_reputation_users / reputation_minimum_participants)",
      "threshold": "Applied when active users < reputation_minimum_participants",
      "max_reduction": "80%"
    },
    "renormalization": {
      "description": "After all adjustments, weights are re-normalized to sum to 1.0",
      "formula": "effective_weight(s) = adjusted_weight(s) / sum(adjusted_weight(all))"
    }
  }
}
```

### Reputation Score Computation

```
reputation_score(user) = accuracy_component * 0.5 +
                          consistency_component * 0.3 +
                          volume_component * 0.2

Where:
  accuracy_component = 1 - normalized_brier_score(user)
    -- Brier score normalized to 0-1 range across all users
    -- Lower Brier = higher accuracy = higher component score

  consistency_component = 1 - std_dev(user_brier_scores_per_prediction)
    -- How consistent the user is across predictions
    -- Lower variance = higher consistency

  volume_component = min(1.0, total_resolved_predictions / 50)
    -- Ramps up to 1.0 at 50 resolved predictions
    -- Ensures new users don't get high reputation from 1-2 lucky predictions

Decay:
  -- Reputation decays by 5% per month of inactivity
  -- Fully recalculated monthly from all resolved predictions
```

### Mispricing Detection

```json
{
  "mispricing_threshold": 0.05,
  "description": "Mispricing flagged when |market_price - fused_probability| > threshold",
  "conditions": {
    "overpriced": "market_price > fused_probability + threshold",
    "underpriced": "market_price < fused_probability - threshold"
  },
  "confidence_requirement": "Only flag mispricing when fused_probability confidence_interval does not contain market_price",
  "alert_levels": {
    "minor": "5-10% divergence",
    "moderate": "10-20% divergence",
    "major": "> 20% divergence"
  }
}
```

### PostgreSQL Schema

```sql
CREATE TABLE exchange_markets (
  market_id UUID PRIMARY KEY,
  task_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pre_market',
  outcomes JSONB NOT NULL,
  opened_at TIMESTAMP,
  closes_at TIMESTAMP,
  resolved_at TIMESTAMP,
  actual_outcome_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE signal_fusions (
  fusion_id UUID PRIMARY KEY,
  market_id UUID REFERENCES exchange_markets(market_id),
  fused_at TIMESTAMP NOT NULL,
  fused_probabilities JSONB NOT NULL,
  signal_breakdown JSONB NOT NULL,
  signal_agreement JSONB NOT NULL,
  signal_validity JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_reputations (
  user_id UUID PRIMARY KEY,
  reputation_score NUMERIC(6, 4) NOT NULL DEFAULT 0.0,
  accuracy_component NUMERIC(6, 4),
  consistency_component NUMERIC(6, 4),
  volume_component NUMERIC(6, 4),
  total_predictions INTEGER DEFAULT 0,
  resolved_predictions INTEGER DEFAULT 0,
  avg_brier_score NUMERIC(10, 6),
  specializations JSONB DEFAULT '[]',
  last_active TIMESTAMP,
  last_recalculated TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_fusions_market ON signal_fusions(market_id, fused_at DESC);
CREATE INDEX idx_reputation_score ON user_reputations(reputation_score DESC);
CREATE INDEX idx_markets_status ON exchange_markets(status);
```

## Dependencies

- **Depends on:**
  - `ensemble-aggregator` -- provides the AI signal (calibrated probabilities)
  - Exchange trading engine -- provides financial signal (prices, volume, order flow)
  - `calibration` -- provides historical accuracy context for AI signal quality assessment
  - PostgreSQL -- stores fusion history, market state, user reputations
  - Redis -- real-time signal aggregation and WebSocket pub/sub

- **Depended by:**
  - Exchange frontend -- displays fused probabilities and signal breakdown to users
  - Exchange trading engine -- uses fused probability as reference price for market making
  - Exchange risk management -- monitors mispricing alerts and signal divergence
  - `calibration` -- Exchange market outcomes feed back into calibration tracking

## Performance Requirements

- **Fusion latency:** p50 < 100ms, p95 < 250ms, p99 < 500ms (fusion computation only)
- **Real-time updates:** Fused probability re-computed within 500ms of any signal change; streamed to subscribers via WebSocket within 100ms of computation
- **Signal freshness:** AI signal accepted up to 48 hours old (with staleness penalty); financial signal uses latest trade (must be within 1 hour for "active" status); reputation signal recalculated every 5 minutes
- **Triple-signal requirement:** Fusion result marked as "degraded_mode" and "provisional" if fewer than 3 signals are available; provisional results clearly flagged in API response and UI
- **Throughput:** Handle 1,000 concurrent market fusion updates (for Exchange at scale)
- **Reputation recalculation:** Full reputation recalculation for 100,000 users < 5 minutes (batch job, monthly); incremental updates on each prediction resolution < 100ms
- **Mispricing detection:** Mispricing alerts generated within 1 second of fusion computation
- **Weight bounds:** No single signal's effective weight may exceed 0.60 after adjustments; ensures no single signal dominates
- **Numerical precision:** Fused probabilities sum to 1.0 (+/- 1e-6); all probabilities clipped to [0.01, 0.99]
- **Availability:** 99.95% -- Exchange is a trading platform and requires high availability
- **Audit trail:** Every fusion computation logged with full input signals and parameters; retained for 2 years for regulatory compliance
