-- Studio 项目
create table public.studio_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  status text default 'draft' check (status in ('draft','active','archived')),
  settings jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 数据源连接
create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.studio_projects(id) on delete cascade,
  name text not null,
  source_type text not null check (source_type in ('csv','api','database','manual')),
  config jsonb not null,
  schema jsonb,
  last_synced_at timestamptz,
  freshness_status text default 'fresh' check (freshness_status in ('fresh','stale','expired')),
  freshness_expiry interval default '7 days',
  row_count int default 0,
  created_at timestamptz default now()
);

-- 数据快照
create table public.data_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.data_sources(id) on delete cascade,
  data jsonb not null,
  quality_score float,
  row_count int,
  captured_at timestamptz default now()
);

-- 人口模型
create table public.population_models (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.studio_projects(id) on delete cascade,
  name text not null,
  agent_count int default 1000,
  distribution jsonb not null,
  constraints jsonb,
  agents jsonb,
  network jsonb,
  created_at timestamptz default now()
);

-- 情景
create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.studio_projects(id) on delete cascade,
  name text not null,
  version int default 1,
  causal_graph jsonb not null,
  variables jsonb not null,
  description text,
  is_baseline boolean default false,
  parent_scenario_id uuid references public.scenarios(id),
  created_at timestamptz default now()
);

-- 仿真运行
create table public.simulation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.studio_projects(id) on delete cascade,
  scenario_id uuid references public.scenarios(id),
  population_id uuid references public.population_models(id),
  status text default 'pending' check (status in ('pending','running','completed','failed','cancelled')),
  config jsonb,
  results jsonb,
  metrics jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- 仿真分支
create table public.simulation_branches (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.simulation_runs(id) on delete cascade,
  branch_name text not null,
  variable_overrides jsonb,
  results jsonb,
  created_at timestamptz default now()
);

-- 报告
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.studio_projects(id) on delete cascade,
  title text not null,
  content jsonb,
  template text default 'standard',
  export_urls jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table public.studio_projects enable row level security;
alter table public.data_sources enable row level security;
alter table public.data_snapshots enable row level security;
alter table public.population_models enable row level security;
alter table public.scenarios enable row level security;
alter table public.simulation_runs enable row level security;
alter table public.simulation_branches enable row level security;
alter table public.reports enable row level security;

create policy "Own projects" on public.studio_projects for all using (auth.uid() = user_id);
create policy "Own data sources" on public.data_sources for all using (
  exists (select 1 from public.studio_projects p where p.id = project_id and p.user_id = auth.uid())
);
create policy "Own snapshots" on public.data_snapshots for all using (
  exists (select 1 from public.data_sources ds join public.studio_projects p on ds.project_id = p.id where ds.id = source_id and p.user_id = auth.uid())
);
create policy "Own populations" on public.population_models for all using (
  exists (select 1 from public.studio_projects p where p.id = project_id and p.user_id = auth.uid())
);
create policy "Own scenarios" on public.scenarios for all using (
  exists (select 1 from public.studio_projects p where p.id = project_id and p.user_id = auth.uid())
);
create policy "Own sim runs" on public.simulation_runs for all using (
  exists (select 1 from public.studio_projects p where p.id = project_id and p.user_id = auth.uid())
);
create policy "Own branches" on public.simulation_branches for all using (
  exists (select 1 from public.simulation_runs r join public.studio_projects p on r.project_id = p.id where r.id = run_id and p.user_id = auth.uid())
);
create policy "Own reports" on public.reports for all using (
  exists (select 1 from public.studio_projects p where p.id = project_id and p.user_id = auth.uid())
);

-- 触发器
create trigger studio_projects_updated before update on public.studio_projects for each row execute function update_updated_at();
create trigger reports_updated before update on public.reports for each row execute function update_updated_at();
