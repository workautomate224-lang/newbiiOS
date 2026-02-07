-- FutureOS MVP Database Schema
-- 001_init.sql

-- 启用扩展
create extension if not exists "vector";
-- pg_cron: 需要 Supabase Pro 计划，MVP 阶段跳过

-- 用户资料（与 Supabase Auth 联动）
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  reputation_score float default 0,
  prediction_count int default 0,
  accuracy_score float default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 预测记录
create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  query text not null,
  status text default 'pending' check (status in ('pending','processing','stage_1_done','stage_2_done','stage_3_done','stage_4_done','stage_5_done','stage_6_done','completed','failed','cancelled')),
  prediction_type text default 'standard',
  region text,
  timeframe text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz,
  cost_usd float default 0,
  is_public boolean default true
);

-- 预测结果（大 JSON 存储因果图+推理+概率）
create table public.prediction_results (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid unique references public.predictions(id) on delete cascade,
  outcomes jsonb not null,           -- [{name, probability, confidence_interval}]
  causal_graph jsonb not null,       -- {nodes:[], edges:[]}
  reasoning jsonb,                   -- {got_tree, shap_factors, explanation_text}
  variables jsonb,                   -- [{name, current, range, impact}]
  metadata jsonb,                    -- {agent_count, sim_ticks, engines, time_s, cost}
  created_at timestamptz default now()
);

-- Agent 记忆（向量搜索）
create table public.agent_memories (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid references public.predictions(id),
  agent_type text,
  content text,
  embedding vector(1536),
  metadata jsonb,
  created_at timestamptz default now()
);

-- 校准日志
create table public.calibration_logs (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid references public.predictions(id),
  brier_score float,
  actual_outcome text,
  predicted_probabilities jsonb,
  domain text,
  evaluated_at timestamptz default now()
);

-- 审计日志
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz default now()
);

-- RLS 策略
alter table public.profiles enable row level security;
alter table public.predictions enable row level security;
alter table public.prediction_results enable row level security;
alter table public.agent_memories enable row level security;
alter table public.calibration_logs enable row level security;
alter table public.audit_logs enable row level security;

-- profiles: 自己可读写，公开可读基础信息
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Public profiles readable" on public.profiles for select using (true);

-- predictions: 自己可读写，公开预测所有人可读
create policy "Users can create predictions" on public.predictions for insert with check (auth.uid() = user_id);
create policy "Users can view own predictions" on public.predictions for select using (auth.uid() = user_id);
create policy "Public predictions readable" on public.predictions for select using (is_public = true);

-- prediction_results: 跟随 prediction 权限
create policy "Results follow prediction access" on public.prediction_results for select using (
  exists (select 1 from public.predictions p where p.id = prediction_id and (p.user_id = auth.uid() or p.is_public = true))
);

-- 新用户注册自动创建 profile
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 更新时间戳触发器
create or replace function update_updated_at()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;

create trigger predictions_updated_at before update on public.predictions for each row execute function update_updated_at();
create trigger profiles_updated_at before update on public.profiles for each row execute function update_updated_at();
