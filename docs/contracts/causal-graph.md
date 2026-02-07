# Contract: Causal Graph
Version: 1.0
Last Updated: 2026-02-06

## Description

The Causal Graph module manages a persistent causal knowledge graph that captures the relationships between variables, events, and outcomes discovered through the FutureOS prediction pipeline. The graph is stored in Neo4j as the primary store and cached in PostgreSQL for fast query access. Nodes represent variables (e.g., "unemployment_rate"), events (e.g., "fed_rate_hike"), conditions (e.g., "recession"), and outcomes. Edges represent causal relationships with associated weights (strength), directionality, confidence scores, and temporal decay. The graph is a living structure: new predictions contribute edges discovered by the GoT Engine, and the Drift Monitor decays stale edges over time. The graph serves as institutional memory for the prediction engine, allowing future predictions to leverage previously discovered causal relationships rather than re-deriving them from scratch.

## Interface

### Input

```
// For writing new causal knowledge
CausalGraphUpdate {
  task_id: string                    // Source prediction that generated this knowledge
  source_engine: "got" | "mcts" | "debate" | "manual"  // Which engine discovered this

  nodes: [
    {
      node_id?: string              // If updating existing node; omit for new nodes
      label: string                 // Variable or event name (canonical form)
      type: "variable" | "event" | "condition" | "outcome"
      category: string              // "demographic", "economic", "political", etc.
      region?: string               // Geographic scope (ISO code or "global")
      attributes: {
        current_value?: any
        unit?: string
        last_observed?: string      // ISO 8601
        description?: string
      }
    }
  ]

  edges: [
    {
      source_label: string          // Source node label (matched or created)
      target_label: string          // Target node label (matched or created)
      weight: number                // Causal strength: -1.0 to 1.0
      direction: "positive" | "negative" | "conditional"
      mechanism: string             // Brief description of causal mechanism
      confidence: number            // 0.0-1.0
      evidence: {
        type: "statistical" | "theoretical" | "observed" | "simulated"
        source: string
        sample_size?: number
      }
      temporal: {
        lag?: string                // e.g., "3_months" -- delay between cause and effect
        decay_rate?: number         // How fast this relationship weakens over time (0.0-1.0 per month)
      }
    }
  ]
}

// For querying the causal graph
CausalGraphQuery {
  query_type: "subgraph" | "path" | "neighbors" | "impact" | "ancestry"
  parameters: {
    // For subgraph: extract relevant portion of graph
    center_node?: string            // Node label to center the subgraph on
    radius?: number                 // Hops from center (default: 2)
    min_confidence?: number         // Filter edges below this confidence

    // For path: find causal path between two nodes
    from_node?: string
    to_node?: string
    max_hops?: number

    // For neighbors: direct connections to a node
    node_label?: string
    direction?: "incoming" | "outgoing" | "both"

    // For impact: how changing one variable affects others
    variable?: string
    change_magnitude?: number
    propagation_depth?: number

    // For ancestry: what causes a given outcome
    outcome_label?: string
    min_weight?: number

    // Common filters
    region?: string
    categories?: string[]
    min_edge_confidence?: number
    exclude_decayed?: boolean       // Exclude edges whose weight has decayed below threshold
  }
}
```

### Output

```
CausalGraphResult {
  query_id: string                   // UUID v4
  executed_at: string                // ISO 8601

  // For update operations
  update_result?: {
    nodes_created: number
    nodes_updated: number
    nodes_merged: number             // Existing nodes matched by label
    edges_created: number
    edges_updated: number
    edges_strengthened: number       // Existing edges with reinforced weight
  }

  // For query operations
  query_result?: {
    nodes: [
      {
        node_id: string
        label: string
        type: string
        category: string
        region: string
        attributes: object
        centrality: number           // PageRank or betweenness centrality
        in_degree: number
        out_degree: number
        created_at: string
        last_updated: string
        contributing_tasks: string[] // task_ids that contributed to this node
      }
    ]
    edges: [
      {
        edge_id: string
        source: string               // node_id
        target: string               // node_id
        source_label: string
        target_label: string
        weight: number               // Current weight (may be decayed)
        original_weight: number      // Weight when first established
        direction: string
        mechanism: string
        confidence: number
        evidence: object
        temporal: object
        created_at: string
        last_reinforced: string      // Last time this edge was confirmed
        decay_applied: boolean
        contributing_tasks: string[]
      }
    ]

    // For path queries
    paths?: [
      {
        path_nodes: string[]         // Ordered node labels
        path_edges: string[]         // Ordered edge_ids
        total_weight: number         // Product of edge weights along path
        total_confidence: number     // Product of edge confidences
        description: string          // Human-readable path description
      }
    ]

    // For impact queries
    impact_analysis?: [
      {
        affected_node: string
        estimated_impact: number     // Propagated effect magnitude
        hops_away: number
        pathway: string              // Description of transmission path
      }
    ]
  }

  cache_hit: boolean                 // Whether result came from PostgreSQL cache
  neo4j_query_time_ms: number
}
```

### API Endpoints (if applicable)

```
POST /api/v1/causal-graph/update
  Request:  CausalGraphUpdate
  Response: CausalGraphResult (update_result)
  Auth:     Internal service token
  Timeout:  10s

POST /api/v1/causal-graph/query
  Request:  CausalGraphQuery
  Response: CausalGraphResult (query_result)
  Auth:     Internal service token (or user token for Studio)
  Timeout:  5s

GET /api/v1/causal-graph/node/:label
  Response: { node: Node, neighbors: Node[], edges: Edge[] }

GET /api/v1/causal-graph/stats
  Response: {
    total_nodes: number,
    total_edges: number,
    avg_confidence: number,
    categories: [{name, node_count}],
    regions: [{code, node_count}],
    stale_edges_count: number
  }

POST /api/v1/causal-graph/decay
  Request:  { decay_function: string, threshold: number }
  Response: { edges_decayed: number, edges_removed: number }

POST /api/v1/causal-graph/export
  Request:  { format: "graphml" | "json" | "cypher", filters?: object }
  Response: File download or JSON
```

## Data Formats

### Neo4j Node Schema (Cypher)

```cypher
CREATE (n:CausalNode {
  node_id: randomUUID(),
  label: "unemployment_rate",
  type: "variable",
  category: "economic",
  region: "US",
  current_value: 4.2,
  unit: "percent",
  last_observed: datetime("2025-12-01"),
  description: "U.S. national unemployment rate (seasonally adjusted)",
  created_at: datetime(),
  last_updated: datetime(),
  contributing_tasks: ["task_uuid_1", "task_uuid_2"]
})
```

### Neo4j Edge Schema (Cypher)

```cypher
CREATE (a)-[r:CAUSES {
  edge_id: randomUUID(),
  weight: -0.72,
  original_weight: -0.72,
  direction: "negative",
  mechanism: "Rising unemployment reduces household income, lowering consumer confidence",
  confidence: 0.85,
  evidence_type: "statistical",
  evidence_source: "BLS/Michigan Consumer Sentiment correlation 2020-2025",
  lag: "1_month",
  decay_rate: 0.05,
  created_at: datetime(),
  last_reinforced: datetime(),
  contributing_tasks: ["task_uuid_1"]
}]->(b)
```

### PostgreSQL Cache Schema

```sql
CREATE TABLE causal_graph_cache (
  cache_key VARCHAR(255) PRIMARY KEY,    -- Hash of query parameters
  query_type VARCHAR(50) NOT NULL,
  result_json JSONB NOT NULL,
  node_count INTEGER,
  edge_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,         -- TTL-based expiration
  hit_count INTEGER DEFAULT 0
);

CREATE INDEX idx_cache_expires ON causal_graph_cache(expires_at);
CREATE INDEX idx_cache_query_type ON causal_graph_cache(query_type);
```

### Edge Decay Formula

```
decayed_weight(t) = original_weight * exp(-decay_rate * months_since_last_reinforced)

Where:
  - decay_rate: per-month exponential decay (default: 0.05)
  - months_since_last_reinforced: time since edge was last confirmed by a prediction
  - Edge is marked "stale" when |decayed_weight| < 0.1
  - Edge is removed when |decayed_weight| < 0.01 or age > 24 months without reinforcement
```

## Dependencies

- **Depends on:**
  - `got-engine` -- primary source of new causal edges and node discoveries
  - `mcts-engine` -- contributes scenario-path-derived causal relationships
  - `debate-engine` -- contributes historically-grounded causal claims
  - `drift-monitor` -- triggers edge decay and staleness detection
  - Neo4j -- primary graph database (v5.x+)
  - PostgreSQL -- cache layer for frequent queries

- **Depended by:**
  - `got-engine` -- reads existing causal knowledge to inform new reasoning
  - `explanation-generator` -- queries causal chains for explanation visualization
  - `drift-monitor` -- monitors edge weights and staleness
  - Studio product (Data Workbench) -- visualizes and allows manual editing of causal graph

## Performance Requirements

- **Query latency:** p50 < 50ms (cache hit), p50 < 200ms (cache miss / Neo4j query), p95 < 500ms, p99 < 1s
- **Write latency:** p50 < 100ms for batch of 10 nodes + 20 edges
- **Graph size:** Must support up to 100,000 nodes and 500,000 edges
- **Cache hit rate:** Target > 60% for query operations; cache TTL: 15 minutes for subgraph queries, 1 hour for stats
- **Merge accuracy:** Node label matching must use normalized canonical forms; "Unemployment Rate", "unemployment_rate", and "US Unemployment" should merge to the same node
- **Decay processing:** Batch decay computation for all edges must complete within 5 minutes for full graph; run daily
- **Backup:** Neo4j graph exported to GraphML nightly; PostgreSQL cache is ephemeral and rebuilt on demand
- **Availability:** Neo4j: 99.5%; PostgreSQL cache: 99.9%; system continues with direct Neo4j queries if cache is unavailable
- **Concurrency:** Must handle 50 concurrent read queries and 10 concurrent write operations without conflicts; writes use optimistic locking on edge weights
