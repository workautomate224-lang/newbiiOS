# Contract: Debate Engine
Version: 1.0
Last Updated: 2026-02-06

## Description

The Debate Engine implements a structured multi-perspective deliberation process where five distinct roles engage in a three-round debate about the prediction question. Each role is instantiated as a separate LLM persona with explicit instructions to argue from its designated perspective. The five roles are: Optimist (argues for positive outcomes), Pessimist (argues for negative/risk scenarios), Contrarian (challenges majority assumptions), Historian (draws on historical precedent and base rates), and Judge (synthesizes arguments and renders a balanced assessment). The debate format surfaces disagreements, stress-tests assumptions, and produces a consensus-weighted probability distribution. Arguments are scored for logical strength, evidence quality, and novelty. The Judge's final assessment, informed by all perspectives, becomes the Debate Engine's output. It carries a 15% weight in the ensemble aggregation.

## Interface

### Input

```
DebateRequest {
  task_id: string
  prediction_context: {
    task: PredictionTask              // Original prediction task
    outcomes: [{id, label, description}]
    key_variables: [{name, category, importance, current_value}]
    simulation_summary: {
      final_distribution: [{outcome_id, probability}]
      key_findings: string[]
    }
    data_summary: {
      region: string
      timeframe: {start, end}
      economic_highlights: string[]
      sentiment_highlights: string[]
      data_gaps: string[]
    }
  }
  config: {
    rounds: number                    // Number of debate rounds (default: 3)
    roles: string[]                   // Default: ["optimist", "pessimist", "contrarian", "historian", "judge"]
    max_argument_length: number       // Max tokens per argument (default: 500)
    scoring_criteria: string[]        // Default: ["logical_strength", "evidence_quality", "novelty"]
    judge_weight: number              // Weight of judge's assessment vs. role consensus (default: 0.6)
  }
}
```

### Output

```
DebateResult {
  debate_id: string                   // UUID v4
  task_id: string
  completed_at: string                // ISO 8601

  debate_log: {
    rounds: [
      {
        round_number: number          // 1, 2, or 3
        phase: "opening" | "rebuttal" | "closing"
        arguments: [
          {
            role: "optimist" | "pessimist" | "contrarian" | "historian" | "judge"
            argument: string          // The argument text
            outcome_supported: string // outcome_id this argument supports
            evidence_cited: string[]  // References to data or historical precedents
            scores: {
              logical_strength: number    // 0.0-1.0
              evidence_quality: number    // 0.0-1.0
              novelty: number             // 0.0-1.0
              composite: number           // Weighted average
            }
            rebuts: string[]          // role(s) being rebutted (rounds 2-3 only)
          }
        ]
        round_summary: {
          dominant_argument: string   // Role with strongest argument this round
          key_disagreements: string[] // Points of contention
          emerging_consensus: [{outcome_id: string, direction: "toward" | "away"}]
        }
      }
    ]
  }

  consensus_score: number             // 0.0-1.0; how much agreement among roles
  disagreement_map: [                 // Where roles diverge
    {
      topic: string
      positions: [{role: string, stance: string, strength: number}]
      resolved: boolean
    }
  ]

  probability_distribution: [
    {
      outcome_id: string
      probability: number             // Debate-derived probability
      role_assessments: [             // Each role's individual probability
        {
          role: string
          probability: number
          confidence: number
        }
      ]
      judge_probability: number       // Judge's specific assessment
      consensus_probability: number   // Average across all roles
    }
  ]

  key_insights: [                     // Novel insights surfaced during debate
    {
      insight: string
      source_role: string
      round: number
      impact: "high" | "medium" | "low"
      affected_outcomes: string[]
    }
  ]

  historical_precedents: [            // Cited by the Historian role
    {
      event: string
      date: string
      similarity_score: number        // 0.0-1.0
      outcome: string
      relevance: string
    }
  ]

  metadata: {
    total_arguments: number
    sonnet_tokens_used: {input: number, output: number}
    sonnet_calls: number              // 5 roles x 3 rounds = 15 base calls + scoring
    wall_clock_time_ms: number
    model: string
  }
}
```

### API Endpoints (if applicable)

```
POST /api/v1/reasoning/debate
  Request:  DebateRequest
  Response: DebateResult
  Auth:     Internal service token
  Timeout:  120s

GET /api/v1/reasoning/debate/:debate_id
  Response: DebateResult

GET /api/v1/reasoning/debate/:debate_id/round/:round_number
  Response: { round: Round }

GET /api/v1/reasoning/debate/:debate_id/role/:role_name
  Response: { arguments: Argument[] } (all arguments from that role)

GET /api/v1/reasoning/debate/:debate_id/consensus
  Response: { consensus_score, probability_distribution, disagreement_map }
```

## Data Formats

### Role System Prompts

```json
{
  "optimist": {
    "system_prompt": "You are the Optimist. Your role is to identify and argue for the most positive plausible outcomes. Focus on growth factors, positive trends, resilience, and opportunities. Ground your arguments in real data but emphasize upside scenarios. You must assign probabilities to each outcome from your perspective.",
    "bias_direction": "positive outcomes",
    "evidence_preference": "growth indicators, success precedents, enabling factors"
  },
  "pessimist": {
    "system_prompt": "You are the Pessimist. Your role is to identify risks, vulnerabilities, and negative scenarios. Focus on structural weaknesses, historical failures, systemic risks, and downside tail events. Be rigorous about worst-case analysis while remaining evidence-based.",
    "bias_direction": "negative outcomes and risks",
    "evidence_preference": "risk indicators, failure precedents, vulnerability analysis"
  },
  "contrarian": {
    "system_prompt": "You are the Contrarian. Your role is to challenge the prevailing assumptions of other debaters. If most argue for outcome A, argue for outcome B. Question hidden assumptions, identify overlooked factors, and propose alternative framings. Your value is in stress-testing the group's reasoning.",
    "bias_direction": "against majority opinion",
    "evidence_preference": "overlooked data, alternative interpretations, assumption challenges"
  },
  "historian": {
    "system_prompt": "You are the Historian. Your role is to ground the debate in historical precedent and base rates. Identify analogous past events, cite empirical frequencies, and evaluate whether this situation truly differs from historical patterns. Reference specific dates, outcomes, and lessons learned.",
    "bias_direction": "base rate alignment",
    "evidence_preference": "historical events, statistical base rates, pattern recognition"
  },
  "judge": {
    "system_prompt": "You are the Judge. Your role is to evaluate the quality of all arguments, identify the strongest evidence, resolve contradictions, and render a balanced final assessment. You score each argument on logical strength, evidence quality, and novelty. Your final probability distribution should reflect the weight of all evidence presented, not your personal opinion.",
    "bias_direction": "balanced synthesis",
    "evidence_preference": "strongest arguments regardless of source"
  }
}
```

### Argument Scoring Schema

```json
{
  "scoring_rubric": {
    "logical_strength": {
      "0.0-0.3": "Weak logic, contains fallacies or unsupported leaps",
      "0.3-0.6": "Moderate logic, mostly sound but with some gaps",
      "0.6-0.8": "Strong logic, well-structured with minor issues",
      "0.8-1.0": "Exceptional logic, airtight reasoning chain"
    },
    "evidence_quality": {
      "0.0-0.3": "Anecdotal or no evidence cited",
      "0.3-0.6": "Some evidence but incomplete or outdated",
      "0.6-0.8": "Solid evidence from credible sources",
      "0.8-1.0": "Comprehensive evidence with multiple corroborating sources"
    },
    "novelty": {
      "0.0-0.3": "Repeats commonly known points",
      "0.3-0.6": "Adds some new perspective or connection",
      "0.6-0.8": "Introduces a meaningfully new angle",
      "0.8-1.0": "Reveals a genuinely surprising and valid insight"
    }
  },
  "composite_weights": {
    "logical_strength": 0.4,
    "evidence_quality": 0.4,
    "novelty": 0.2
  }
}
```

## Dependencies

- **Depends on:**
  - `simulation-engine` -- provides simulation summary for debate grounding
  - `data-orchestrator` -- provides data summaries as factual basis for arguments
  - LLM Provider (Claude Sonnet) -- generates arguments for each role and scoring evaluations
  - `intent-parser` -- provides outcome definitions for probability assessment

- **Depended by:**
  - `ensemble-aggregator` -- debate probability distribution carries 15% weight in ensemble
  - `explanation-generator` -- key insights and historical precedents enrich explanations

## Performance Requirements

- **Latency:** p50 < 45s, p95 < 75s, p99 < 100s for 5 roles x 3 rounds
- **LLM calls:** 15 argument generation calls (5 roles x 3 rounds) + 15 scoring calls + 1 final synthesis = 31 Sonnet calls minimum
- **Parallelism:** Within each round, all 5 role arguments can be generated in parallel (except Judge in final round, who needs all other arguments first)
- **Token budget:** Max 600 input tokens + 500 output tokens per argument call; total budget: ~25,000 input + ~20,000 output tokens
- **Argument quality:** At least 80% of arguments must score > 0.4 composite; arguments scoring < 0.2 are regenerated (max 1 retry)
- **Consensus metric:** Consensus score calculated as 1 - (standard deviation of role probabilities / max possible std dev); must be computed for each outcome
- **Historical precedents:** Historian must cite at least 2 historical precedents with dates and outcomes
- **Round progression:** Each round must show measurable evolution -- arguments in round 3 must reference points from rounds 1-2
- **Memory:** All debate state held in memory during execution; persisted to PostgreSQL on completion
- **Availability:** 99.5% uptime; if fewer than 5 roles can be generated, engine reports partial result with reduced confidence
