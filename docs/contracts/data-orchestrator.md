# Contract: Data Orchestrator
Version: 1.0
Last Updated: 2026-02-06

## Description

The Data Orchestrator is the central data acquisition and assembly layer of the FutureOS prediction pipeline. It receives a structured `PredictionTask` from the Intent Parser and coordinates parallel data collection from multiple heterogeneous sources: census/demographic databases, economic indicators, and media sentiment feeds. The orchestrator normalizes, validates, and packages this data into a unified `DataPackage` that downstream modules (particularly the Population Synthesizer) can consume without needing to understand individual source APIs. It also performs gap analysis, identifying missing or stale data that could impact prediction quality, and reports these gaps explicitly so downstream modules can compensate or flag uncertainty.

## Interface

### Input

```
PredictionTask {
  task_id: string
  type: string                   // Prediction category
  region: {
    level: string
    code: string
    name: string
    coordinates?: {lat: number, lng: number, radius_km: number}
  }
  timeframe: {
    start: string
    end: string
    horizon: "short" | "medium" | "long"
  }
  outcomes: [{id, label, description, boundary_conditions}]
  key_variables: [{name, category, importance, data_source_hint?}]
}
```

### Output

```
DataPackage {
  package_id: string             // UUID v4
  task_id: string                // Reference to originating PredictionTask
  collected_at: string           // ISO 8601 timestamp

  census: {
    region_code: string
    population: number
    demographics: {
      age_distribution: [{bracket: string, count: number, percentage: number}]
      gender_distribution: [{gender: string, count: number, percentage: number}]
      ethnicity_distribution: [{group: string, count: number, percentage: number}]
      education_distribution: [{level: string, count: number, percentage: number}]
      income_distribution: [{bracket: string, count: number, percentage: number}]
      urban_rural_split: {urban: number, rural: number}
    }
    housing: {owner_occupied: number, renter: number, median_value: number}
    source: string               // e.g., "US Census ACS 2024"
    vintage: string              // Data vintage year
  }

  economic: {
    region_code: string
    indicators: [
      {
        name: string             // e.g., "unemployment_rate", "gdp_growth", "cpi"
        value: number
        unit: string
        period: string           // e.g., "2025-Q4"
        source: string           // e.g., "BLS", "BEA", "FRED"
        trend: "rising" | "falling" | "stable"
        historical: [{period: string, value: number}]  // Last 8 periods
      }
    ]
  }

  sentiment: {
    region_code: string
    overall_score: number        // -1.0 to 1.0
    topic_scores: [
      {
        topic: string            // Mapped to key_variables
        score: number            // -1.0 to 1.0
        volume: number           // Number of mentions
        trend: "rising" | "falling" | "stable"
        sample_texts: string[]   // Up to 5 representative snippets
      }
    ]
    sources: string[]            // e.g., ["news_api", "reddit", "twitter"]
    collection_window: {start: string, end: string}
  }

  gaps: [
    {
      field: string              // Dot-notation path, e.g., "census.demographics.ethnicity_distribution"
      severity: "critical" | "moderate" | "minor"
      reason: string             // e.g., "Data unavailable for region", "Data older than 2 years"
      fallback_used: boolean     // Whether a fallback/proxy was substituted
      fallback_description?: string
    }
  ]

  quality_score: number          // 0.0-1.0 overall data quality assessment
  source_count: number           // Number of distinct data sources queried
}
```

### API Endpoints (if applicable)

```
POST /api/v1/data/orchestrate
  Request:  PredictionTask
  Response: DataPackage
  Auth:     Internal service token
  Timeout:  30s

GET /api/v1/data/package/:package_id
  Response: DataPackage (from cache/store)

GET /api/v1/data/sources
  Response: { sources: [{name, type, status, last_updated}] }

POST /api/v1/data/refresh/:package_id
  Response: DataPackage (re-collected)
```

## Data Formats

### DataPackage JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["package_id", "task_id", "collected_at", "census", "economic", "sentiment", "gaps", "quality_score", "source_count"],
  "properties": {
    "package_id": { "type": "string", "format": "uuid" },
    "task_id": { "type": "string", "format": "uuid" },
    "collected_at": { "type": "string", "format": "date-time" },
    "census": {
      "type": "object",
      "required": ["region_code", "population", "demographics", "source", "vintage"],
      "properties": {
        "region_code": { "type": "string" },
        "population": { "type": "integer" },
        "demographics": { "type": "object" },
        "housing": { "type": "object" },
        "source": { "type": "string" },
        "vintage": { "type": "string" }
      }
    },
    "economic": {
      "type": "object",
      "required": ["region_code", "indicators"],
      "properties": {
        "region_code": { "type": "string" },
        "indicators": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["name", "value", "unit", "period", "source"],
            "properties": {
              "name": { "type": "string" },
              "value": { "type": "number" },
              "unit": { "type": "string" },
              "period": { "type": "string" },
              "source": { "type": "string" },
              "trend": { "type": "string", "enum": ["rising", "falling", "stable"] },
              "historical": { "type": "array" }
            }
          }
        }
      }
    },
    "sentiment": {
      "type": "object",
      "required": ["region_code", "overall_score", "topic_scores", "sources", "collection_window"],
      "properties": {
        "region_code": { "type": "string" },
        "overall_score": { "type": "number", "minimum": -1, "maximum": 1 },
        "topic_scores": { "type": "array" },
        "sources": { "type": "array", "items": { "type": "string" } },
        "collection_window": { "type": "object" }
      }
    },
    "gaps": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["field", "severity", "reason", "fallback_used"],
        "properties": {
          "field": { "type": "string" },
          "severity": { "type": "string", "enum": ["critical", "moderate", "minor"] },
          "reason": { "type": "string" },
          "fallback_used": { "type": "boolean" },
          "fallback_description": { "type": "string" }
        }
      }
    },
    "quality_score": { "type": "number", "minimum": 0, "maximum": 1 },
    "source_count": { "type": "integer" }
  }
}
```

### Source Adapters

Each data source is accessed through a normalized adapter interface:

```
SourceAdapter {
  name: string
  type: "census" | "economic" | "sentiment"
  fetch(region: string, params: object): Promise<RawSourceData>
  normalize(raw: RawSourceData): NormalizedData
  healthCheck(): Promise<{status: "up" | "down", latency_ms: number}>
}
```

## Dependencies

- **Depends on:**
  - `intent-parser` -- provides the PredictionTask that defines what data to collect
  - Census API (US Census Bureau ACS, international equivalents)
  - Economic data APIs (FRED, BLS, BEA, World Bank)
  - Sentiment/media APIs (NewsAPI, Reddit API, social media feeds)
  - PostgreSQL -- for caching collected data packages
  - Redis -- for request deduplication and rate limit tracking

- **Depended by:**
  - `pop-synthesizer` -- consumes DataPackage to build agent populations
  - `simulation-engine` -- uses economic and sentiment data for simulation variables
  - `got-engine` -- reads data package for contextual reasoning
  - `mcts-engine` -- uses data context for search initialization
  - `debate-engine` -- provides factual grounding for debate participants

## Performance Requirements

- **Latency:** p50 < 8s, p95 < 15s, p99 < 25s (parallel source collection)
- **Throughput:** 50 concurrent orchestration requests
- **Parallelism:** All three source categories (census, economic, sentiment) must be fetched concurrently; total wall-clock time should not exceed the slowest single source + 2s overhead
- **Caching:** DataPackages are cached for 1 hour (sentiment) to 24 hours (census); cache key is (region_code, task_type, timeframe_hash)
- **Retry policy:** Each source adapter retries up to 3 times with exponential backoff (1s, 2s, 4s)
- **Gap tolerance:** Pipeline continues even if one source category fails entirely; the gap is logged with severity "critical"
- **Data freshness:** Census data accepted if vintage <= 2 years; economic data must be within last completed quarter; sentiment data must be within last 7 days
- **Availability:** 99.9% for the orchestrator itself; individual source availability tracked independently
