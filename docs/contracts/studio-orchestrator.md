# Contract: Studio Orchestrator
Version: 1.0
Last Updated: 2026-02-06

## Description

The Studio Orchestrator manages the workflow and state for the FutureOS Studio product -- the professional workflow platform for prediction analysts. Studio provides five interconnected workbenches that allow users to inspect, customize, and control every stage of the prediction pipeline: Data Workbench (explore and configure data sources), Population Workbench (inspect and adjust synthetic populations), Scenario Workbench (define and compare what-if scenarios), Simulation Console (run, monitor, and replay simulations), and Report Generator (create presentation-ready prediction reports). The orchestrator manages project state, coordinates transitions between workbenches, handles save/load of project configurations, tracks user modifications at each stage, and ensures that changes in upstream workbenches properly propagate to downstream stages. It serves as the backbone of the Studio user experience.

## Interface

### Input

```
// Project lifecycle operations
ProjectCreate {
  user_id: string
  team_id?: string                   // For collaborative projects
  project_name: string
  description?: string
  initial_query?: string             // Optional starting prediction query
  template_id?: string               // Start from a saved template
}

ProjectLoad {
  project_id: string
  user_id: string
  version?: number                   // Load specific version (default: latest)
}

// Workbench operations
WorkbenchAction {
  project_id: string
  user_id: string
  workbench: "data" | "population" | "scenario" | "simulation" | "report"
  action: string                     // Workbench-specific action
  payload: object                    // Action-specific parameters
}

// Data Workbench actions
DataWorkbenchPayload {
  action: "explore_sources" | "configure_source" | "preview_data" | "override_value" | "add_custom_source" | "refresh_data"
  source_name?: string
  configuration?: object
  override?: { field: string, value: any, reason: string }
}

// Population Workbench actions
PopulationWorkbenchPayload {
  action: "view_archetypes" | "adjust_distribution" | "edit_archetype" | "resize_population" | "regenerate" | "view_network"
  adjustment?: { dimension: string, target: object }
  archetype_id?: string
  edits?: object
  target_size?: number
}

// Scenario Workbench actions
ScenarioWorkbenchPayload {
  action: "create_scenario" | "edit_scenario" | "duplicate_scenario" | "delete_scenario" | "compare_scenarios" | "run_scenario"
  scenario_id?: string
  scenario_config?: {
    name: string
    description: string
    variable_overrides: [{variable: string, value: any}]
    population_adjustments?: object
    shock_events?: [{tick: number, variable: string, magnitude: number}]
  }
  compare_ids?: string[]
}

// Simulation Console actions
SimulationConsolePayload {
  action: "run" | "pause" | "resume" | "stop" | "replay" | "step_forward" | "step_backward" | "inject_shock" | "export_data"
  simulation_config?: object
  tick?: number                       // For replay positioning
  shock?: { variable: string, magnitude: number }
  export_format?: "csv" | "json" | "parquet"
}

// Report Generator actions
ReportGeneratorPayload {
  action: "generate" | "customize" | "export" | "schedule" | "add_annotation"
  report_config?: {
    template: "executive_summary" | "detailed_analysis" | "comparison" | "custom"
    sections: string[]                // Which sections to include
    branding?: { logo_url?: string, colors?: object }
    include_charts: boolean
    include_methodology: boolean
  }
  export_format?: "pdf" | "pptx" | "html" | "docx"
  annotation?: { section: string, text: string, author: string }
  schedule?: { frequency: string, recipients: string[] }
}
```

### Output

```
// Project state
ProjectState {
  project_id: string                 // UUID v4
  user_id: string
  team_id?: string
  project_name: string
  description: string
  created_at: string                 // ISO 8601
  updated_at: string
  version: number                    // Auto-incrementing version on each save

  status: "draft" | "data_ready" | "population_ready" | "scenarios_defined" | "simulated" | "complete"

  // Pipeline state references
  prediction_task_id?: string
  data_package_id?: string
  population_id?: string
  scenarios: [
    {
      scenario_id: string
      name: string
      description: string
      status: "defined" | "running" | "completed" | "failed"
      simulation_id?: string
      ensemble_id?: string
    }
  ]

  // Workbench states
  workbench_states: {
    data: {
      status: "not_started" | "in_progress" | "complete"
      overrides: [{field: string, value: any, reason: string}]
      custom_sources: [{name: string, type: string, config: object}]
      last_accessed: string
    }
    population: {
      status: "not_started" | "in_progress" | "complete"
      adjustments: [{dimension: string, original: object, modified: object}]
      last_accessed: string
    }
    scenario: {
      status: "not_started" | "in_progress" | "complete"
      scenario_count: number
      last_accessed: string
    }
    simulation: {
      status: "not_started" | "running" | "paused" | "complete"
      current_tick?: number
      total_ticks?: number
      last_accessed: string
    }
    report: {
      status: "not_started" | "in_progress" | "complete"
      report_id?: string
      last_accessed: string
    }
  }

  // Modification tracking
  modification_log: [
    {
      timestamp: string
      user_id: string
      workbench: string
      action: string
      summary: string
      reversible: boolean
    }
  ]

  // Collaboration state
  collaborators: [
    {
      user_id: string
      role: "owner" | "editor" | "viewer"
      last_active: string
    }
  ]
  active_users: string[]              // Currently viewing/editing users
}

// Workbench action response
WorkbenchResponse {
  project_id: string
  workbench: string
  action: string
  success: boolean
  result: object                     // Action-specific result data

  state_changes: {
    project_status_changed: boolean
    downstream_invalidated: string[] // Workbenches that need re-running
    warnings: string[]               // e.g., "Population must be re-generated after data changes"
  }

  updated_project_state: ProjectState
}

// Report output
GeneratedReport {
  report_id: string
  project_id: string
  generated_at: string

  content: {
    title: string
    sections: [
      {
        title: string
        type: string
        content_html: string
        charts: [{chart_type: string, data: object, config: object}]
      }
    ]
    appendix: {
      methodology: string
      data_sources: string[]
      calibration_metrics: object
      caveats: string[]
    }
  }

  export_urls: {
    pdf?: string
    pptx?: string
    html?: string
  }
}
```

### API Endpoints (if applicable)

```
// Project management
POST   /api/v1/studio/projects                    -- Create project
GET    /api/v1/studio/projects                    -- List user's projects
GET    /api/v1/studio/projects/:id                -- Get project state
PUT    /api/v1/studio/projects/:id                -- Update project metadata
DELETE /api/v1/studio/projects/:id                -- Delete project
GET    /api/v1/studio/projects/:id/versions       -- List project versions
POST   /api/v1/studio/projects/:id/duplicate      -- Duplicate project

// Workbench operations
POST   /api/v1/studio/projects/:id/workbench/:workbench/action  -- Execute workbench action
GET    /api/v1/studio/projects/:id/workbench/:workbench/state   -- Get workbench state

// Report operations
POST   /api/v1/studio/projects/:id/report/generate  -- Generate report
GET    /api/v1/studio/projects/:id/report/:rid       -- Get report
POST   /api/v1/studio/projects/:id/report/:rid/export -- Export report

// Collaboration
POST   /api/v1/studio/projects/:id/collaborators     -- Add collaborator
DELETE /api/v1/studio/projects/:id/collaborators/:uid -- Remove collaborator

// Real-time updates
WebSocket /ws/v1/studio/projects/:id                 -- Project state updates, simulation streaming, collaboration cursors

// Templates
GET    /api/v1/studio/templates                      -- List available templates
POST   /api/v1/studio/templates                      -- Save project as template
```

## Data Formats

### Project State Schema (PostgreSQL)

```sql
CREATE TABLE studio_projects (
  project_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  team_id UUID,
  project_name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  prediction_task_id UUID,
  data_package_id UUID,
  population_id UUID,
  workbench_states JSONB NOT NULL DEFAULT '{}',
  modification_log JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP                -- Soft delete
);

CREATE TABLE studio_project_versions (
  version_id UUID PRIMARY KEY,
  project_id UUID REFERENCES studio_projects(project_id),
  version_number INTEGER NOT NULL,
  state_snapshot JSONB NOT NULL,       -- Full project state at this version
  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, version_number)
);

CREATE TABLE studio_scenarios (
  scenario_id UUID PRIMARY KEY,
  project_id UUID REFERENCES studio_projects(project_id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  config JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'defined',
  simulation_id UUID,
  ensemble_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE studio_reports (
  report_id UUID PRIMARY KEY,
  project_id UUID REFERENCES studio_projects(project_id),
  template VARCHAR(50),
  content JSONB NOT NULL,
  export_urls JSONB DEFAULT '{}',
  generated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_projects_user ON studio_projects(user_id, deleted_at);
CREATE INDEX idx_projects_team ON studio_projects(team_id, deleted_at);
CREATE INDEX idx_scenarios_project ON studio_scenarios(project_id);
CREATE INDEX idx_versions_project ON studio_project_versions(project_id, version_number DESC);
```

### Workflow Dependency Graph

```json
{
  "workflow": {
    "stages": ["data", "population", "scenario", "simulation", "report"],
    "dependencies": {
      "data": [],
      "population": ["data"],
      "scenario": ["population"],
      "simulation": ["scenario"],
      "report": ["simulation"]
    },
    "invalidation_rules": {
      "data_changed": ["population", "scenario", "simulation", "report"],
      "population_changed": ["scenario", "simulation", "report"],
      "scenario_changed": ["simulation", "report"],
      "simulation_changed": ["report"]
    }
  }
}
```

## Dependencies

- **Depends on:**
  - `intent-parser` -- parses initial query into PredictionTask
  - `data-orchestrator` -- handles data collection for Data Workbench
  - `pop-synthesizer` -- generates populations for Population Workbench
  - `simulation-engine` -- runs simulations for Simulation Console
  - `got-engine`, `mcts-engine`, `debate-engine` -- reasoning for scenario evaluation
  - `ensemble-aggregator` -- produces calibrated predictions per scenario
  - `explanation-generator` -- generates report content
  - `causal-graph` -- visualized in Data Workbench
  - PostgreSQL -- project state, versions, scenarios, reports
  - Redis -- session management, real-time collaboration state
  - S3 or equivalent -- report file storage (PDF, PPTX exports)

- **Depended by:**
  - Studio frontend application -- consumes all API endpoints and WebSocket events
  - Admin analytics -- tracks Studio usage patterns and project lifecycle metrics

## Performance Requirements

- **Project operations:** Create, load, save < 500ms
- **Workbench actions:** p50 < 1s for UI state changes; long-running actions (data refresh, population regeneration, simulation run) return immediately with a job ID and stream progress via WebSocket
- **Version snapshots:** Project state serialized to JSON < 200ms; max snapshot size 10MB
- **Concurrent users:** Support 10 concurrent collaborators per project with real-time cursor and state sync via WebSocket (< 100ms latency)
- **Project limits:** Max 20 scenarios per project; max 50 versions retained (older versions archived)
- **Report generation:** PDF/PPTX export < 30s for standard reports; < 60s for detailed reports with all charts
- **Auto-save:** Project state auto-saved every 30 seconds during active editing
- **Recovery:** Unsaved changes recoverable from Redis session state for up to 24 hours after disconnect
- **Availability:** 99.9% for project CRUD; 99.5% for report generation (depends on rendering service)
- **Storage:** Project state < 5MB per project (excluding report exports); report exports retained for 90 days
