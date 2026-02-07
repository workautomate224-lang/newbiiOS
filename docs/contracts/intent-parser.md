# Contract: Intent Parser
Version: 1.0
Last Updated: 2026-02-06

## Description

The Intent Parser module is the entry point of the FutureOS prediction pipeline. It receives raw natural language queries from users and transforms them into structured `PredictionTask` objects that downstream modules can process deterministically. The parser leverages an LLM (Claude Sonnet) to extract semantic intent, identify geographic scope, determine temporal boundaries, enumerate possible outcomes, and isolate the key variables that will drive the prediction. It handles ambiguity resolution, query normalization, and validation before emitting a well-formed task. This module serves all three products: Lite (single query input), Studio (workbench query builder), and Exchange (signal request parsing).

## Interface

### Input

```
RawQuery {
  query: string              // Natural language prediction question from the user
  user_id: string            // Authenticated user identifier
  product: "lite" | "studio" | "exchange"  // Which product originated the query
  context?: {                // Optional context for follow-up or refinement
    previous_task_id?: string
    constraints?: string[]
    preferred_region?: string
    preferred_timeframe?: string
  }
}
```

### Output

```
PredictionTask {
  task_id: string                // UUID v4 unique identifier
  type: string                   // Category: "political", "economic", "social", "technological", "environmental", "demographic"
  region: {
    level: "country" | "state" | "city" | "district" | "custom"
    code: string                 // ISO 3166 code or custom geo identifier
    name: string                 // Human-readable region name
    coordinates?: {lat: number, lng: number, radius_km: number}
  }
  timeframe: {
    start: string                // ISO 8601 date
    end: string                  // ISO 8601 date
    horizon: "short" | "medium" | "long"  // <3mo, 3-12mo, >12mo
  }
  outcomes: [                    // 2-10 mutually exclusive, collectively exhaustive outcomes
    {
      id: string
      label: string              // Short outcome description
      description: string        // Detailed outcome description
      boundary_conditions: string[]  // What defines this outcome as having occurred
    }
  ]
  key_variables: [               // Variables that influence the prediction
    {
      name: string
      category: "demographic" | "economic" | "political" | "sentiment" | "environmental" | "behavioral"
      importance: "high" | "medium" | "low"
      data_source_hint?: string  // Suggested data source
    }
  ]
  raw_query: string              // Original query preserved for audit
  confidence: number             // Parser confidence in interpretation (0.0-1.0)
  created_at: string             // ISO 8601 timestamp
}
```

### API Endpoints (if applicable)

```
POST /api/v1/parse-intent
  Request:  RawQuery
  Response: PredictionTask
  Auth:     Bearer token (JWT)
  Rate:     100 req/min (Lite), 500 req/min (Studio), 1000 req/min (Exchange)

GET /api/v1/parse-intent/:task_id
  Response: PredictionTask (cached result)

POST /api/v1/parse-intent/validate
  Request:  PredictionTask (partial)
  Response: { valid: boolean, errors: string[], suggestions: string[] }
```

## Data Formats

### PredictionTask JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["task_id", "type", "region", "timeframe", "outcomes", "key_variables", "raw_query", "confidence", "created_at"],
  "properties": {
    "task_id": { "type": "string", "format": "uuid" },
    "type": { "type": "string", "enum": ["political", "economic", "social", "technological", "environmental", "demographic"] },
    "region": {
      "type": "object",
      "required": ["level", "code", "name"],
      "properties": {
        "level": { "type": "string", "enum": ["country", "state", "city", "district", "custom"] },
        "code": { "type": "string" },
        "name": { "type": "string" },
        "coordinates": {
          "type": "object",
          "properties": {
            "lat": { "type": "number" },
            "lng": { "type": "number" },
            "radius_km": { "type": "number" }
          }
        }
      }
    },
    "timeframe": {
      "type": "object",
      "required": ["start", "end", "horizon"],
      "properties": {
        "start": { "type": "string", "format": "date" },
        "end": { "type": "string", "format": "date" },
        "horizon": { "type": "string", "enum": ["short", "medium", "long"] }
      }
    },
    "outcomes": {
      "type": "array",
      "minItems": 2,
      "maxItems": 10,
      "items": {
        "type": "object",
        "required": ["id", "label", "description", "boundary_conditions"],
        "properties": {
          "id": { "type": "string" },
          "label": { "type": "string" },
          "description": { "type": "string" },
          "boundary_conditions": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "key_variables": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "category", "importance"],
        "properties": {
          "name": { "type": "string" },
          "category": { "type": "string", "enum": ["demographic", "economic", "political", "sentiment", "environmental", "behavioral"] },
          "importance": { "type": "string", "enum": ["high", "medium", "low"] },
          "data_source_hint": { "type": "string" }
        }
      }
    },
    "raw_query": { "type": "string" },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "created_at": { "type": "string", "format": "date-time" }
  }
}
```

## Dependencies

- **Depends on:**
  - LLM Provider (Claude Sonnet) -- for natural language understanding and structured extraction
  - Authentication service -- for user identity and product-tier resolution
  - Region database -- for geographic code validation and normalization

- **Depended by:**
  - `data-orchestrator` -- consumes PredictionTask to determine which data sources to query

## Performance Requirements

- **Latency:** p50 < 1.5s, p95 < 3s, p99 < 5s (including LLM round-trip)
- **Throughput:** Must handle 100 concurrent parse requests
- **Token budget:** Max 2,000 input tokens + 1,500 output tokens per parse call to Sonnet
- **Accuracy:** Parser confidence score must exceed 0.7 for auto-acceptance; queries scoring below 0.7 trigger a clarification request back to the user
- **Availability:** 99.9% uptime; graceful degradation to rule-based parsing if LLM is unavailable
- **Caching:** Identical queries from the same user within 5 minutes return cached PredictionTask
- **Validation:** 100% of emitted PredictionTasks must pass JSON Schema validation before being forwarded downstream
