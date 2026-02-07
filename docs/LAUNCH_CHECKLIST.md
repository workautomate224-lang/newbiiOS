# FutureOS Launch Checklist

## Pre-Deployment

- [ ] All tests pass (see final-acceptance-report.md)
- [ ] .env.production configured:
  - [ ] SUPABASE_URL (production)
  - [ ] SUPABASE_ANON_KEY (production)
  - [ ] SUPABASE_SERVICE_ROLE_KEY (production)
  - [ ] OPENROUTER_API_KEY (production — current key expired, needs new one)
  - [ ] REDIS_URL (Railway Redis)
  - [ ] SENTRY_DSN (frontend and backend, optional)
  - [ ] NEWSDATA_API_KEY (optional)
- [ ] Railway environment variables set
- [ ] Supabase production database migrations executed (001-006)
- [ ] Supabase RLS policies verified

## Deployment

- [ ] git push to main branch → Railway auto-deploy
- [ ] API health check passes (GET /health → 200)
- [ ] Frontend homepage accessible (GET / → 200)
- [ ] All routes accessible (no unexpected 404s)

## Post-Deployment Verification

- [ ] Register new user → success
- [ ] Login → redirect to Lite
- [ ] Create prediction → progress page → result page (full pipeline)
- [ ] Causal graph renders correctly
- [ ] Variable sliders draggable → probability changes
- [ ] Studio → create project → all workbenches accessible
- [ ] Exchange → market list → market detail viewable
- [ ] Share link opens correctly
- [ ] Mobile test (phone browser)

## Monitoring Confirmation

- [ ] Sentry Dashboard receives events
- [ ] No unexpected errors
- [ ] LLM calls working (not timeout/error)
- [ ] Health check shows services status

## Optional: Custom Domain

- [ ] Purchase domain (e.g., futureos.app)
- [ ] Railway custom domain configuration
- [ ] SSL active (automatic)
- [ ] Frontend NEXT_PUBLIC_APP_URL updated
- [ ] API CORS updated with new domain
- [ ] OG Meta URLs updated
