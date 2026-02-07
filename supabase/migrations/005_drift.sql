-- 漂移检测记录
create table public.drift_events (
  id uuid primary key default gen_random_uuid(),
  drift_type text not null check (drift_type in ('data_expiry','causal_decay','agent_drift','calibration_drift','signal_divergence')),
  severity text default 'info' check (severity in ('info','warning','critical')),
  entity_type text,
  entity_id uuid,
  details jsonb not null,
  auto_action_taken text,
  resolved boolean default false,
  detected_at timestamptz default now(),
  resolved_at timestamptz
);

-- 因果边衰减追踪
create table public.causal_edge_weights (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid references public.predictions(id),
  edge_source text not null,
  edge_target text not null,
  original_weight float not null,
  current_weight float not null,
  decay_rate float default 0.03,
  last_validated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.drift_events enable row level security;
alter table public.causal_edge_weights enable row level security;
create policy "Drift events readable" on public.drift_events for select using (true);
create policy "Edge weights readable" on public.causal_edge_weights for select using (true);
