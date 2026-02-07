# 🚀 FutureOS Phase 5: Production Ready — 上线前最后冲刺
# Phase 3 功能全部完成，Phase 4 测试全绿。现在把产品从"能跑"变成"能上线"。

---

先阅读 docs/BLUEPRINT.md 和 docs/sessions/current.md 和 docs/sessions/test-report.md 恢复上下文。

所有功能已实现并测试通过(187后端+78E2E+7前端=272测试)。
现在做上线前最后冲刺：真实数据源、性能优化、安全加固、SEO、监控、UI极致打磨。

原则：
- 不加新功能，只打磨已有功能
- 每改一处跑一次相关测试确认不回归
- 自主决策，完成后汇报

---

# ═══════════════════════════════════════════
# PART I: 真实数据源接入
# ═══════════════════════════════════════════

## 阶段 O: 替换Mock数据为真实数据

现在Pipeline Stage 2 用的是硬编码Mock数据。接入真实免费API。

### O1: 世界银行经济数据
创建 `api/app/services/data_providers/worldbank.py`:

```python
"""
世界银行 Open Data API
https://api.worldbank.org/v2/
免费，无需API Key
"""
import httpx

BASE_URL = "https://api.worldbank.org/v2"

async def get_gdp(country_code: str = "MYS", years: int = 5) -> dict:
    """获取GDP数据"""
    url = f"{BASE_URL}/country/{country_code}/indicator/NY.GDP.MKTP.CD"
    params = {"format": "json", "per_page": years, "date": f"2020:2025"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, params=params)
        data = resp.json()
    # 解析返回 [{year, value, country}]
    return _parse_wb_response(data)

async def get_population(country_code: str = "MYS") -> dict:
    """获取人口数据"""
    url = f"{BASE_URL}/country/{country_code}/indicator/SP.POP.TOTL"
    params = {"format": "json", "per_page": 5, "date": "2020:2025"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, params=params)
        data = resp.json()
    return _parse_wb_response(data)

async def get_unemployment(country_code: str = "MYS") -> dict:
    """失业率"""
    url = f"{BASE_URL}/country/{country_code}/indicator/SL.UEM.TOTL.ZS"
    params = {"format": "json", "per_page": 5, "date": "2020:2025"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, params=params)
        data = resp.json()
    return _parse_wb_response(data)

async def get_inflation(country_code: str = "MYS") -> dict:
    """通胀率"""
    url = f"{BASE_URL}/country/{country_code}/indicator/FP.CPI.TOTL.ZG"
    params = {"format": "json", "per_page": 5, "date": "2020:2025"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, params=params)
        data = resp.json()
    return _parse_wb_response(data)

def _parse_wb_response(data) -> list:
    """解析世界银行API响应"""
    if not data or len(data) < 2:
        return []
    return [
        {"year": item["date"], "value": item["value"], "country": item["country"]["value"]}
        for item in data[1] if item["value"] is not None
    ]
```

### O2: 新闻/情感数据
创建 `api/app/services/data_providers/news.py`:

```python
"""
新闻数据 — 使用免费的 NewsData.io 或 GNews API
如果没有API Key，用LLM生成模拟新闻摘要
"""
import httpx
import os

NEWSDATA_API_KEY = os.environ.get("NEWSDATA_API_KEY", "")

async def get_news_sentiment(query: str, country: str = "my", count: int = 10) -> dict:
    """获取相关新闻并分析情感"""
    articles = await _fetch_news(query, country, count)
    
    if not articles:
        # Fallback: 用LLM生成当前事件摘要
        return await _llm_news_fallback(query)
    
    # 用LLM分析新闻情感
    from app.core.llm import call_llm_json
    sentiment = await call_llm_json("sentiment_analysis", [{
        "role": "user",
        "content": f"""Analyze the sentiment of these news headlines related to "{query}":
{chr(10).join([f'- {a["title"]}' for a in articles[:10]])}

Return JSON: {{
  "overall_sentiment": -1.0 to 1.0,
  "positive_themes": ["theme1", "theme2"],
  "negative_themes": ["theme1"],
  "key_events": ["event1", "event2"],
  "summary": "2-3 sentence summary"
}}"""
    }])
    
    return {
        "articles": articles[:5],
        "sentiment": sentiment,
        "source": "newsdata" if NEWSDATA_API_KEY else "llm_generated"
    }

async def _fetch_news(query: str, country: str, count: int) -> list:
    """从新闻API获取文章"""
    if not NEWSDATA_API_KEY:
        return []
    
    url = "https://newsdata.io/api/1/news"
    params = {
        "apikey": NEWSDATA_API_KEY,
        "q": query,
        "country": country,
        "language": "en,ms",
        "size": count
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params)
            data = resp.json()
        return [{"title": a["title"], "source": a["source_id"], "date": a["pubDate"]} 
                for a in data.get("results", [])]
    except Exception:
        return []

async def _llm_news_fallback(query: str) -> dict:
    """无新闻API时用LLM生成上下文"""
    from app.core.llm import call_llm_json
    return await call_llm_json("data_gap_fill", [{
        "role": "user",
        "content": f"""Based on your knowledge, provide current context about: "{query}"

Return JSON: {{
  "articles": [],
  "sentiment": {{
    "overall_sentiment": 0.0,
    "positive_themes": [],
    "negative_themes": [],
    "key_events": [],
    "summary": "summary based on general knowledge"
  }},
  "source": "llm_knowledge"
}}"""
    }])
```

### O3: 马来西亚特定数据
创建 `api/app/services/data_providers/malaysia.py`:

```python
"""
马来西亚特定数据 (选举/人口/经济)
来源: DOSM (Department of Statistics Malaysia) Open Data
https://open.dosm.gov.my/
"""

# 硬编码但真实的马来西亚数据 (来自DOSM 2023年统计)
MALAYSIA_DEMOGRAPHICS = {
    "total_population": 33_200_000,
    "ethnic_distribution": {
        "Bumiputera": 0.697,
        "Chinese": 0.228,
        "Indian": 0.067,
        "Others": 0.008
    },
    "age_distribution": {
        "0-14": 0.234,
        "15-24": 0.166,
        "25-54": 0.433,
        "55-64": 0.094,
        "65+": 0.073
    },
    "urban_rural": {"urban": 0.779, "rural": 0.221},
    "states": {
        "Selangor": {"population": 6_900_000, "seats": 22},
        "Johor": {"population": 4_010_000, "seats": 26},
        "Sabah": {"population": 3_900_000, "seats": 25},
        "Sarawak": {"population": 2_820_000, "seats": 31},
        "Perak": {"population": 2_500_000, "seats": 24},
        "Kedah": {"population": 2_190_000, "seats": 15},
        "Penang": {"population": 1_770_000, "seats": 13},
        "Kelantan": {"population": 1_930_000, "seats": 14},
        "Pahang": {"population": 1_680_000, "seats": 14},
        "Terengganu": {"population": 1_270_000, "seats": 8},
        "N.Sembilan": {"population": 1_170_000, "seats": 8},
        "Melaka": {"population": 940_000, "seats": 6},
        "Perlis": {"population": 260_000, "seats": 3},
        "KL": {"population": 1_980_000, "seats": 11},
        "Putrajaya": {"population": 110_000, "seats": 1},
        "Labuan": {"population": 100_000, "seats": 1}
    }
}

# GE15 真实选举结果 (2022年11月)
GE15_RESULTS = {
    "date": "2022-11-19",
    "coalitions": {
        "PH": {"seats": 82, "popular_vote_pct": 0.378, "parties": ["PKR", "DAP", "Amanah"]},
        "PN": {"seats": 73, "popular_vote_pct": 0.332, "parties": ["PAS", "Bersatu"]},
        "BN": {"seats": 30, "popular_vote_pct": 0.225, "parties": ["UMNO", "MCA", "MIC"]},
        "GPS": {"seats": 23, "popular_vote_pct": 0.041},
        "GRS": {"seats": 6, "popular_vote_pct": 0.015},
        "Others": {"seats": 8, "popular_vote_pct": 0.009}
    },
    "total_seats": 222,
    "turnout": 0.7387,
    "result": "Hung parliament → Unity government (PH + BN + GPS + GRS)"
}

# GE14 (2018) for comparison
GE14_RESULTS = {
    "date": "2018-05-09",
    "coalitions": {
        "PH": {"seats": 113, "popular_vote_pct": 0.488},
        "BN": {"seats": 79, "popular_vote_pct": 0.337},
        "PAS": {"seats": 18, "popular_vote_pct": 0.168}
    },
    "turnout": 0.8221,
    "result": "PH won → First change of government since independence"
}

def get_demographics() -> dict:
    return MALAYSIA_DEMOGRAPHICS

def get_election_history() -> dict:
    return {"ge15": GE15_RESULTS, "ge14": GE14_RESULTS}

def get_state_data(state: str) -> dict:
    return MALAYSIA_DEMOGRAPHICS["states"].get(state, {})
```

### O4: 升级 Pipeline Stage 2
修改 `api/app/services/prediction_pipeline.py` 的 Stage 2 (DataCollection):

```python
async def stage_2_data_collection(context: dict) -> dict:
    """收集真实数据 + LLM补全"""
    from app.services.data_providers import worldbank, news, malaysia
    
    region = context.get("region", "MY")
    query = context["query"]
    
    # 并行获取多源数据
    import asyncio
    wb_gdp, wb_pop, wb_unemp, wb_inflation, news_data, my_demo = await asyncio.gather(
        worldbank.get_gdp(_region_to_code(region)),
        worldbank.get_population(_region_to_code(region)),
        worldbank.get_unemployment(_region_to_code(region)),
        worldbank.get_inflation(_region_to_code(region)),
        news.get_news_sentiment(query, _region_to_news_code(region)),
        asyncio.coroutine(lambda: malaysia.get_demographics())() if region == "MY" else asyncio.coroutine(lambda: {})(),
        return_exceptions=True
    )
    
    # 容错: 任何数据源失败不影响整体
    economic_data = {}
    if not isinstance(wb_gdp, Exception): economic_data["gdp"] = wb_gdp
    if not isinstance(wb_unemp, Exception): economic_data["unemployment"] = wb_unemp
    if not isinstance(wb_inflation, Exception): economic_data["inflation"] = wb_inflation
    
    census_data = {}
    if not isinstance(wb_pop, Exception): census_data["population"] = wb_pop
    if not isinstance(my_demo, Exception) and my_demo: census_data["demographics"] = my_demo
    
    sentiment_data = news_data if not isinstance(news_data, Exception) else {}
    
    # LLM 补全缺失数据
    from app.core.llm import call_llm_json
    gap_fill = await call_llm_json("data_gap_fill", [{
        "role": "user",
        "content": f"""Based on available data and your knowledge, fill in missing context for: "{query}"

Available data:
- Economic: {json.dumps(economic_data, default=str)[:1000]}
- Census: {json.dumps(census_data, default=str)[:1000]}
- Sentiment: {json.dumps(sentiment_data, default=str)[:500]}

Identify what's missing and provide reasonable estimates.
Return JSON: {{
  "filled_gaps": [{{"field": "name", "value": "estimated value", "confidence": 0.0-1.0, "source": "llm_estimate"}}],
  "data_quality_assessment": "brief assessment",
  "overall_quality_score": 0.0-1.0
}}"""
    }])
    
    return {
        "economic": economic_data,
        "census": census_data,
        "sentiment": sentiment_data,
        "gap_fill": gap_fill,
        "sources": ["worldbank", "newsdata" if sentiment_data.get("source") != "llm_knowledge" else "llm", "dosm"],
        "quality_score": gap_fill.get("overall_quality_score", 0.5)
    }

def _region_to_code(region: str) -> str:
    mapping = {"MY": "MYS", "US": "USA", "CN": "CHN", "SG": "SGP", "ID": "IDN"}
    return mapping.get(region, region)

def _region_to_news_code(region: str) -> str:
    mapping = {"MY": "my", "US": "us", "CN": "cn", "SG": "sg"}
    return mapping.get(region, "my")
```

为真实API调用写测试 (mock httpx):
- test_worldbank_api.py
- test_news_api.py
- test_malaysia_data.py
- test_stage2_real_data.py

### O5: 环境变量更新
在 .env.example 中新增:
```
# 可选: 新闻API (没有也能跑，用LLM fallback)
NEWSDATA_API_KEY=
```

---

# ═══════════════════════════════════════════
# PART II: 性能优化
# ═══════════════════════════════════════════

## 阶段 P: 速度 + 缓存 + 并发

### P1: Redis 缓存层
创建 `api/app/core/cache.py`:

```python
"""
Redis缓存 — 减少重复LLM调用和数据库查询
"""
import redis.asyncio as redis
import json
import hashlib
import os

_redis = None

async def get_redis():
    global _redis
    if _redis is None:
        _redis = redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379"))
    return _redis

async def cache_get(key: str):
    r = await get_redis()
    val = await r.get(key)
    return json.loads(val) if val else None

async def cache_set(key: str, value, ttl: int = 3600):
    r = await get_redis()
    await r.setex(key, ttl, json.dumps(value, default=str))

async def cache_delete(key: str):
    r = await get_redis()
    await r.delete(key)

def make_cache_key(prefix: str, *args) -> str:
    """生成缓存key"""
    raw = f"{prefix}:" + ":".join(str(a) for a in args)
    return hashlib.md5(raw.encode()).hexdigest()
```

### P2: 缓存策略
在以下地方加入缓存:

1. **世界银行数据**: TTL=24小时 (经济数据不常变)
```python
async def get_gdp_cached(country_code):
    key = make_cache_key("wb_gdp", country_code)
    cached = await cache_get(key)
    if cached: return cached
    data = await get_gdp(country_code)
    await cache_set(key, data, ttl=86400)  # 24h
    return data
```

2. **新闻数据**: TTL=1小时
3. **trending预测列表**: TTL=5分钟
4. **排行榜**: TTL=10分钟
5. **用户profile**: TTL=30分钟 (更新时主动清除)

### P3: LLM调用优化
修改 `api/app/core/llm.py`:

```python
# 1. 超时控制
async def call_llm(task, messages, timeout=60, **kwargs):
    import asyncio
    try:
        return await asyncio.wait_for(
            _raw_call(task, messages, **kwargs),
            timeout=timeout
        )
    except asyncio.TimeoutError:
        # 降级到更快的模型重试
        fallback_model = Models.HAIKU
        return await _raw_call_with_model(fallback_model, messages, **kwargs)

# 2. 重试机制
async def _raw_call(task, messages, max_retries=2, **kwargs):
    for attempt in range(max_retries + 1):
        try:
            return await _do_call(task, messages, **kwargs)
        except Exception as e:
            if attempt == max_retries:
                raise
            await asyncio.sleep(1 * (attempt + 1))  # 递增等待

# 3. 成本追踪
import time
_cost_log = []

async def _do_call(task, messages, **kwargs):
    model = TASK_MODEL.get(task, Models.HAIKU)
    start = time.time()
    resp = await client.chat.completions.create(model=model, messages=messages, **kwargs)
    elapsed = time.time() - start
    _cost_log.append({
        "task": task, "model": model, "elapsed": elapsed,
        "tokens_in": resp.usage.prompt_tokens if resp.usage else 0,
        "tokens_out": resp.usage.completion_tokens if resp.usage else 0,
    })
    return resp.choices[0].message.content
```

### P4: 数据库查询优化
1. 添加索引:
```sql
-- supabase/migrations/006_indexes.sql
create index idx_predictions_user_id on public.predictions(user_id);
create index idx_predictions_status on public.predictions(status);
create index idx_predictions_public on public.predictions(is_public) where is_public = true;
create index idx_predictions_created on public.predictions(created_at desc);
create index idx_markets_status on public.markets(status);
create index idx_market_positions_market on public.market_positions(market_id);
create index idx_market_positions_user on public.market_positions(user_id);
create index idx_drift_events_type on public.drift_events(drift_type);
create index idx_drift_events_detected on public.drift_events(detected_at desc);
create index idx_studio_projects_user on public.studio_projects(user_id);
```

2. 分页: 所有列表API确保有分页 (page + page_size, 默认20)

### P5: 前端性能
```bash
cd web
pnpm add @next/bundle-analyzer
```

1. **图片优化**: 所有图片用 next/image
2. **懒加载**: D3因果图、PixiJS Agent、Recharts 都用 `dynamic(() => import(...), { ssr: false })`
3. **虚拟滚动**: Agent列表(可能1000+行)用 react-window
4. **Prefetch**: 从进度页预加载结果页组件
5. **Skeleton Loading**: 所有数据加载页用 Skeleton 占位

---

# ═══════════════════════════════════════════
# PART III: 安全加固
# ═══════════════════════════════════════════

## 阶段 Q: 安全

### Q1: API安全
创建 `api/app/core/security.py`:

```python
"""安全中间件"""
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
import time

# 1. Rate Limiting (简单版，生产用Redis)
class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_requests=100, window=60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window = window
        self._requests = {}  # IP → [(timestamp)]
    
    async def dispatch(self, request: Request, call_next):
        ip = request.client.host
        now = time.time()
        
        # 清理过期记录
        self._requests[ip] = [t for t in self._requests.get(ip, []) if now - t < self.window]
        
        if len(self._requests.get(ip, [])) >= self.max_requests:
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
        
        self._requests.setdefault(ip, []).append(now)
        return await call_next(request)

# 2. CORS 收紧
ALLOWED_ORIGINS = [
    "https://web-production-240e7.up.railway.app",
    "https://futureos.app",
    "http://localhost:3000",
]

# 3. 输入清理
def sanitize_input(text: str, max_length: int = 1000) -> str:
    """防止prompt injection和XSS"""
    if not text: return ""
    text = text[:max_length]
    # 移除可能的prompt injection标记
    dangerous_patterns = ["<system>", "</system>", "<|", "|>", "ignore previous"]
    for pattern in dangerous_patterns:
        text = text.replace(pattern, "")
    return text.strip()
```

在 main.py 中:
```python
app.add_middleware(RateLimitMiddleware, max_requests=60, window=60)
# 收紧CORS
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, ...)
```

### Q2: 输入验证加固
检查所有 Pydantic schema:
- query字段最大1000字符
- 所有ID字段用UUID验证
- 金额字段设置最大值(10000积分)
- 文件上传限制大小(10MB)

### Q3: 环境变量安全
- 确保 .env 在 .gitignore 中
- Railway环境变量不暴露到前端
- SUPABASE_SERVICE_ROLE_KEY 只在后端使用
- 前端只有 NEXT_PUBLIC_ 开头的变量

---

# ═══════════════════════════════════════════
# PART IV: SEO + 国际化 + UI打磨
# ═══════════════════════════════════════════

## 阶段 R: 上线打磨

### R1: SEO
修改 `src/app/layout.tsx`:
```typescript
export const metadata: Metadata = {
  title: "FutureOS — AI预测引擎 | 探索任何问题的未来",
  description: "基于多Agent仿真和三引擎推理的AI预测平台。因果图可视化，实时变量操控，专业级分析。",
  keywords: ["AI预测", "因果推理", "预测市场", "Agent仿真", "FutureOS"],
  openGraph: {
    title: "FutureOS — AI预测引擎",
    description: "探索任何问题的未来",
    url: "https://futureos.app",
    siteName: "FutureOS",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    locale: "zh_CN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FutureOS — AI预测引擎",
    description: "探索任何问题的未来",
  },
  robots: { index: true, follow: true },
};
```

每个主要页面都加 generateMetadata:
- /lite: "Lite — 快速AI预测"
- /studio: "Studio — 专业预测工作台"
- /exchange: "Exchange — 预测市场"
- /lite/[id]/result: 动态标题 "预测: {query}"

### R2: OG Image
创建 `public/og-image.png`:
- 用代码生成: 1200×630 深色背景 + Logo + Tagline
- 或者创建 `src/app/api/og/route.tsx` 用 @vercel/og 动态生成

### R3: 国际化基础
不做完整i18n，但确保:
- 所有UI文字统一 (不要中英混杂)
- 主要选择中文 UI + 英文技术术语
- LLM prompt统一用英文 (效果更好)
- 用户输入支持中英文

### R4: UI极致打磨
逐页检查并修复:

**全局:**
- 深色主题一致性 (所有页面统一配色)
- 加载状态: 每个数据加载都有Skeleton
- 空状态: 每个列表空时有友好提示 + 引导操作
- 错误状态: 统一错误页面/toast
- 过渡动画: 页面切换有fade transition
- Favicon: 创建favicon.ico + apple-touch-icon

**Landing Page:**
- Hero动画: 微妙的粒子/网格背景动画 (用CSS, 不用heavy库)
- 社会证明: 真实数据 "已有X个预测" "平均准确度Y%"
- 加载速度: Lighthouse Performance > 90

**Lite结果页:**
- 因果图: 初始加载动画 (节点逐个出现)
- 变量滑块: 拖动时有实时数字反馈
- 概率变化: 数字跳动动画 (countup effect)

**Studio:**
- React Flow: 节点样式美化 (圆角、阴影、颜色编码)
- 仪表盘: 数字用大字体突出

### R5: 错误边界
创建 `src/components/error-boundary.tsx`:
- React Error Boundary 包裹每个主要区块
- 报错时显示友好界面 + "重试" 按钮
- 不影响其他区块

### R6: 404页面
创建 `src/app/not-found.tsx`:
- 友好的404页面
- 搜索框 + 返回首页按钮

---

# ═══════════════════════════════════════════
# PART V: 监控 + 日志
# ═══════════════════════════════════════════

## 阶段 S: 可观测性

### S1: Sentry错误监控
后端:
```bash
cd api && poetry add sentry-sdk[fastapi]
```
```python
# api/app/main.py
import sentry_sdk
sentry_sdk.init(dsn=os.environ.get("SENTRY_DSN", ""), traces_sample_rate=0.1)
```

前端:
```bash
cd web && pnpm add @sentry/nextjs
```
```javascript
// sentry.client.config.ts
Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, tracesSampleRate: 0.1 });
```

### S2: 健康检查增强
修改 `GET /api/v1/health`:
```json
{
  "status": "healthy",
  "version": "1.5.0",
  "services": {
    "database": "connected",
    "redis": "connected",
    "openrouter": "reachable"
  },
  "uptime_seconds": 12345,
  "last_prediction_at": "2026-02-07T..."
}
```

### S3: API日志
每个API请求记录:
- 路径 + 方法 + 状态码 + 耗时
- LLM调用: task + model + tokens + 耗时 + 成本
- 写入audit_logs表

### S4: 成本仪表盘 API
```
GET /api/v1/admin/costs → {
  "today": {"total_usd": 1.23, "calls": 45, "by_model": {...}},
  "this_week": {...},
  "this_month": {...}
}
```

从LLM调用日志中聚合。帮助你监控OpenRouter花费。

---

# ═══════════════════════════════════════════
# PART VI: 部署优化
# ═══════════════════════════════════════════

## 阶段 T: Railway生产配置

### T1: Dockerfile优化
确保 `api/Dockerfile` 多阶段构建:
```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
COPY pyproject.toml poetry.lock ./
RUN pip install poetry && poetry export -f requirements.txt > requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /app/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

### T2: Railway Service配置
每个Service确保:
- web: `pnpm build && pnpm start`
- api: Dockerfile部署, 2 workers
- worker: 同Dockerfile, CMD改为Celery worker
- Redis: Railway插件, 持久化开启
- 健康检查路径配置

### T3: 自定义域名准备
如果有域名 futureos.app:
- Railway自定义域名配置
- SSL自动(Railway处理)
- 前端 NEXT_PUBLIC_API_URL 指向API域名

---

# ═══════════════════════════════════════════
# PART VII: 最终验证
# ═══════════════════════════════════════════

## 阶段 U: Production Checklist

### U1: 运行全部测试
```bash
cd api && pytest -v --cov=app --tb=short
cd web && pnpm test
cd web && npx playwright test
cd web && pnpm build
```
全部必须通过，不能有回归。

### U2: Lighthouse审计
用 Playwright 或手动跑 Lighthouse:
- / (Landing): Performance > 85, Accessibility > 90, SEO > 90
- /lite: Performance > 80
- /lite/[id]/result: Performance > 70 (D3重，可接受)

### U3: 真实数据验证
1. 输入"2026马来西亚大选谁赢" → 检查Stage 2是否拉到世界银行真实GDP数据
2. 检查因果图的数据是否比之前mock更丰富
3. 检查新闻情感分析是否有内容

### U4: 安全扫描
- 确认 .env 不在git中
- 确认前端无敏感key泄露
- 确认CORS只允许指定域名
- 确认Rate Limit工作

---

## 完成标准

```
=== 真实数据 ===
[ ] 世界银行API: GDP/人口/失业/通胀数据可获取
[ ] 新闻API: 有fallback(无key用LLM)
[ ] 马来西亚数据: 真实人口/选举数据
[ ] Pipeline Stage 2使用真实数据
[ ] 数据获取失败不影响整体流程

=== 性能 ===
[ ] Redis缓存层工作
[ ] 世界银行数据缓存24h
[ ] Trending列表缓存5min
[ ] LLM超时→降级到Haiku
[ ] LLM重试机制
[ ] 数据库索引已创建
[ ] 所有列表API有分页
[ ] 前端懒加载(D3/PixiJS/Recharts)
[ ] Skeleton Loading

=== 安全 ===
[ ] Rate Limiting (60/min)
[ ] CORS收紧
[ ] 输入清理(防prompt injection)
[ ] Pydantic schema有长度限制
[ ] .env在.gitignore中
[ ] 前端无敏感key

=== SEO + UI ===
[ ] 全局meta tags
[ ] OG Image
[ ] 每页有generateMetadata
[ ] Favicon
[ ] 404页面
[ ] Error Boundary
[ ] 深色主题一致
[ ] Skeleton Loading全覆盖
[ ] 空状态友好提示

=== 监控 ===
[ ] Sentry后端接入
[ ] Sentry前端接入
[ ] 健康检查增强
[ ] API请求日志
[ ] LLM成本追踪

=== 部署 ===
[ ] Dockerfile多阶段构建
[ ] Railway配置优化
[ ] 所有测试通过(无回归)
[ ] pnpm build无错误

=== 真实流程验证 ===
[ ] 输入问题→真实数据→三引擎→因果图→变量→概率变化 全流程
[ ] Studio全流程: 数据→人口→情景→仿真→报告→PDF
[ ] Exchange: 市场→三信号→下注
[ ] 漂移仪表盘有数据
```

开始。按 O→P→Q→R→S→T→U 顺序。自主决策，完成后汇报。
