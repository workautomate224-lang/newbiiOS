-- Phase 5: Performance indexes
create index if not exists idx_predictions_user_id on public.predictions(user_id);
create index if not exists idx_predictions_status on public.predictions(status);
create index if not exists idx_predictions_public on public.predictions(is_public) where is_public = true;
create index if not exists idx_predictions_created on public.predictions(created_at desc);
create index if not exists idx_markets_status on public.markets(status);
create index if not exists idx_market_positions_market on public.market_positions(market_id);
create index if not exists idx_market_positions_user on public.market_positions(user_id);
create index if not exists idx_drift_events_type on public.drift_events(drift_type);
create index if not exists idx_drift_events_detected on public.drift_events(detected_at desc);
create index if not exists idx_studio_projects_user on public.studio_projects(user_id);
