-- 预测市场
create table public.markets (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid references public.predictions(id),
  title text not null,
  description text,
  category text default 'general',
  status text default 'open' check (status in ('open','closed','resolved','cancelled')),
  resolution text,
  resolved_at timestamptz,
  close_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- 交易/下注
create table public.market_positions (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references public.markets(id) on delete cascade,
  user_id uuid references public.profiles(id),
  outcome_name text not null,
  amount float not null,
  price float not null,
  created_at timestamptz default now()
);

-- 市场价格历史
create table public.market_prices (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references public.markets(id) on delete cascade,
  outcome_name text not null,
  price float not null,
  source text not null check (source in ('ai','crowd','reputation')),
  recorded_at timestamptz default now()
);

-- 三重信号记录
create table public.signal_snapshots (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references public.markets(id) on delete cascade,
  ai_signal jsonb not null,
  crowd_signal jsonb,
  reputation_signal jsonb,
  fused_signal jsonb not null,
  recorded_at timestamptz default now()
);

-- 异常检测日志
create table public.anomaly_logs (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references public.markets(id),
  anomaly_type text not null,
  severity text default 'warning',
  details jsonb,
  detected_at timestamptz default now()
);

-- RLS
alter table public.markets enable row level security;
alter table public.market_positions enable row level security;
alter table public.market_prices enable row level security;
alter table public.signal_snapshots enable row level security;
alter table public.anomaly_logs enable row level security;

create policy "Markets readable by all" on public.markets for select using (true);
create policy "Auth users create markets" on public.markets for insert with check (auth.uid() = created_by);
create policy "Own positions" on public.market_positions for all using (auth.uid() = user_id);
create policy "Positions readable" on public.market_positions for select using (true);
create policy "Prices readable" on public.market_prices for select using (true);
create policy "Signals readable" on public.signal_snapshots for select using (true);
create policy "Anomalies readable" on public.anomaly_logs for select using (true);
