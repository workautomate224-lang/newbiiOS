# FutureOS 完整开发蓝图 (Development Blueprint)
## 从MVP到百亿平台的落地方案 — Claude Code自主开发指南

---

# 📜 PART 1: 项目宪法 (CONSTITUTION)

> 这个文件是整个项目的最高准则。所有开发会话必须首先读取此文件。

## 1.1 产品定义 (不可改变)
- **FutureOS** = 未来计算引擎 (Future Computation Engine)
- 不是聊天机器人，不是预测工具，是让用户探索因果空间的引擎
- 三产品线: Lite(探索器) + Studio(工作流平台) + Exchange(预测协议)
- 共享一个底层Core Engine

## 1.2 架构决策 (重大变更需审批)
- **前端**: Next.js 15 (App Router) + TypeScript
- **后端**: FastAPI (Python 3.12) + Rust (仿真核心, V2.0阶段)
- **BaaS**: Supabase (PostgreSQL + Auth + Realtime + Storage + pgvector)
- **图数据库**: Neo4j Aura (因果知识图谱)
- **缓存/队列**: Redis (Railway插件) — 缓存+任务队列+Pub/Sub
- **AI**: OpenRouter API (模型路由层) — 通过一个API调用Claude/GPT/Gemini/DeepSeek
- **AI编排**: LangGraph (Agent工作流, 通过OpenAI兼容接口连接OpenRouter)
- **仿真渲染**: PixiJS v8 (2D Agent) + D3.js (因果图)
- **实时通信**: Supabase Realtime (基础) + Socket.IO (复杂仿真流)
- **部署**: Railway (全部服务: 前端+后端+Worker+Redis)
- **CI/CD**: GitHub Actions → Railway自动部署
- **监控**: Railway Metrics + Sentry + 自建健康检查面板

## 1.3 设计原则 (所有代码必须遵守)
1. **每个概率必须可解释** — 黑盒数字没有价值
2. **三重信号不可妥协** — Exchange必须有AI+金融+信誉三独立信号
3. **漂移免疫是核心属性** — 不是可选功能，是系统DNA
4. **95/5 多模型策略** — 通过OpenRouter智能路由: 95%请求用Haiku/Gemini-Flash/规则引擎，5%关键决策用Claude Opus/Sonnet
5. **测试即记忆** — 每个功能必须有测试，测试覆盖率>80%
6. **模块独立性** — 只通过contracts/接口通信，禁止跨模块内部依赖
7. **因果图是核心** — 不是装饰，是产品灵魂

## 1.4 非功能需求
- Lite首次结果: <30秒 (有缓存) / <5分钟 (完整推理)
- 变量调整响应: <3秒
- 单次Lite预测成本: <$0.50
- Studio并发项目: 50+
- Exchange延迟: <500ms (订单撮合)
- 系统可用性: 99.9%
- 数据保留: 3年

---

# 🔧 PART 2: 完整技术栈详细清单

## 2.1 前端技术栈

```
框架: Next.js 15.x (App Router)
语言: TypeScript 5.x (strict mode)
状态管理: Zustand 5.x (轻量) + React Query/TanStack Query (服务器状态)
UI组件库: shadcn/ui (基于Radix UI + Tailwind)
样式: Tailwind CSS 4.x
可视化:
  - D3.js 7.x — 因果图 (力导向图+时间轴)
  - PixiJS 8.x — Agent 2D渲染
  - Recharts 2.x — 数据图表 (Brier Score/概率分布/仪表盘)
  - React Flow 12.x — 情景工作台因果图编辑器 (拖拽+连线)
实时: @supabase/supabase-js (Realtime订阅) + Socket.IO Client 4.x (仿真流)
表单: React Hook Form + Zod (验证)
富文本: Tiptap (报告编辑器)
拖拽: @dnd-kit/core (工作台拖拽)
动画: Framer Motion 11.x
认证: @supabase/auth-helpers-nextjs (Supabase Auth)
HTTP: Axios (API调用)
测试:
  - Vitest (单元)
  - Playwright (E2E)
  - Storybook 8.x (组件文档)
```

## 2.2 后端技术栈

```
框架: FastAPI 0.115.x (Python 3.12)
数据库ORM: supabase-py (Supabase Python SDK) + asyncpg (直连需要时)
迁移: Supabase Migrations (SQL文件) — 不用Alembic,直接用Supabase CLI管理
任务队列: Celery 5.x + Redis (Railway Redis插件)
AI编排: LangGraph 0.2.x (Agent工作流)
AI调用: OpenRouter API — 通过 openai Python SDK (OpenAI兼容接口)
  ┌─────────────────────────────────────────────────┐
  │ OpenRouter 模型路由策略 (核心成本控制)            │
  │                                                  │
  │ 🔴 深度推理层 (5%调用, 高质量):                   │
  │   - anthropic/claude-opus-4    → GoT图推理         │
  │   - anthropic/claude-sonnet-4  → 因果发现/报告     │
  │                                                  │
  │ 🟡 中间层 (15%调用, 平衡):                        │
  │   - anthropic/claude-sonnet-4  → 辩论/情感分析     │
  │   - google/gemini-2.0-pro     → 数据分析/补全      │
  │                                                  │
  │ 🟢 批量层 (80%调用, 成本优先):                     │
  │   - anthropic/claude-haiku     → Persona生成       │
  │   - google/gemini-2.0-flash   → 数据解析/分类      │
  │   - deepseek/deepseek-chat    → 简单推理/翻译      │
  │                                                  │
  │ OpenRouter优势: 单API Key+自动降级+成本追踪       │
  │ 配置: OPENROUTER_API_KEY + base_url + model选择    │
  └─────────────────────────────────────────────────┘
向量搜索: pgvector (Supabase PostgreSQL扩展, 替代独立ChromaDB)
图数据库: Neo4j Aura (免费/Pro) + neo4j-driver (因果图谱)
缓存: Redis (Railway插件) — 会话/缓存/限流/Pub-Sub
消息队列: Redis Streams (替代Kafka, MVP足够) → 未来按需迁移Kafka
搜索: Supabase PostgreSQL全文搜索 (MVP) → 未来按需加Meilisearch
文件存储: Supabase Storage (替代MinIO/S3)
PDF生成: WeasyPrint (报告导出)
PPT生成: python-pptx (报告导出)
数据分析: pandas + numpy + scipy + statsmodels
ML: PyTorch 2.x + scikit-learn
MARL: RLlib (Ray) 2.x
网络分析: NetworkX + igraph
统计检验: scipy.stats (KS检验/PSI)
API文档: 自动OpenAPI (FastAPI内置)
测试:
  - pytest 8.x (单元+集成)
  - pytest-asyncio (异步测试)
  - httpx (API测试)
  - factory-boy (测试数据工厂)
  - coverage.py (覆盖率)
```

## 2.3 仿真核心 (Rust — V2.0阶段)

```
MVP阶段: 纯Python实现仿真 (够用,先跑通)
V2.0阶段: Rust重写核心循环 (10x性能提升)
  语言: Rust 1.82+
  框架: tokio (异步运行时)
  序列化: serde + serde_json
  FFI: PyO3 (Python绑定)
  并行: rayon (数据并行)
  随机: rand (Agent行为随机性)
```

## 2.4 基础设施 (Railway为核心)

```
部署平台: Railway
  ┌─────────────────────────────────────────────────┐
  │ Railway 服务架构                                  │
  │                                                  │
  │ Service 1: web (Next.js前端)                      │
  │   - 自动从GitHub部署                               │
  │   - 域名: futureos.app (自定义域名)                │
  │                                                  │
  │ Service 2: api (FastAPI后端)                       │
  │   - Dockerfile部署                                │
  │   - 环境变量: OPENROUTER_API_KEY, SUPABASE_*等     │
  │                                                  │
  │ Service 3: worker (Celery Worker)                  │
  │   - 长时间仿真任务执行                              │
  │   - 可水平扩展(多实例)                              │
  │                                                  │
  │ Plugin: Redis                                     │
  │   - 缓存 + Celery Broker + Pub/Sub                │
  │                                                  │
  │ 外部服务 (不在Railway上):                           │
  │   - Supabase: PostgreSQL + Auth + Realtime + Storage│
  │   - Neo4j Aura: 因果图谱                           │
  │   - OpenRouter: LLM调用                            │
  │   - Sentry: 错误追踪                               │
  └─────────────────────────────────────────────────┘

本地开发: Docker Compose (Supabase Local + Redis + Neo4j)
CI/CD: GitHub Actions (测试) → Railway (自动部署, 连接GitHub)
包管理: pnpm (前端) + Poetry (Python)
代码质量: ESLint + Prettier (前端) + Ruff (Python)
Git钩子: Husky + lint-staged
环境变量: Railway环境变量管理 (不用Vault)
监控: Railway Metrics (基础) + Sentry (错误) + 自建/health端点
日志: structlog (Python) + Railway日志面板
```

## 2.5 Supabase 详细配置

```
项目结构:
  supabase/
  ├── migrations/          # SQL迁移文件 (Supabase CLI管理)
  │   ├── 001_init.sql
  │   ├── 002_predictions.sql
  │   └── ...
  ├── functions/           # Supabase Edge Functions (可选)
  ├── seed.sql             # 测试数据
  └── config.toml          # 本地配置

PostgreSQL扩展 (在Supabase中启用):
  - pgvector        — 向量搜索 (Agent记忆/语义搜索)
  - pg_cron         — 定时任务 (数据新鲜度检查/漂移扫描)
  - pg_stat_statements — 查询性能监控
  - pgjwt           — JWT生成 (API内部认证)

表设计 (核心):
  - auth.users      — Supabase Auth自动管理
  - public.profiles — 用户资料+信誉积分
  - public.predictions — 预测记录
  - public.prediction_results — 预测结果+因果图JSON
  - public.scenarios — Studio情景
  - public.simulations — 仿真记录+快照
  - public.agent_memories — 向量存储 (pgvector embedding列)
  - public.causal_edges — 因果关系缓存 (同步自Neo4j)
  - public.calibration_logs — 校准记录
  - public.audit_logs — 审计日志
  - public.markets — Exchange市场
  - public.orders — Exchange订单
  - public.reputation_scores — 信誉积分历史

行级安全 (RLS):
  - 每个表启用RLS
  - 用户只能读写自己的数据
  - admin角色可以读写所有
  - public预测可被所有人读取

Realtime:
  - predictions表变更 → 前端实时更新进度
  - markets表变更 → Exchange实时价格
  - 仿真Tick流 → 通过Redis Pub/Sub (Supabase Realtime不够快)

Storage Buckets:
  - reports/ — 导出的PDF/PPT
  - uploads/ — 用户上传的数据文件
  - avatars/ — 用户头像
```

## 2.6 OpenRouter 调用封装

```python
# api/app/core/llm.py — OpenRouter统一调用封装

from openai import AsyncOpenAI

# OpenRouter使用OpenAI兼容API
client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
    default_headers={
        "HTTP-Referer": "https://futureos.app",
        "X-Title": "FutureOS"
    }
)

# 模型常量 — 集中管理,便于切换
class Models:
    # 深度推理 (最贵,最强)
    OPUS = "anthropic/claude-opus-4"
    # 通用推理 (平衡)
    SONNET = "anthropic/claude-sonnet-4"
    # 批量/简单 (最便宜)
    HAIKU = "anthropic/claude-haiku"
    FLASH = "google/gemini-2.0-flash-001"
    DEEPSEEK = "deepseek/deepseek-chat"
    
    # 任务→模型映射 (95/5策略的具体实现)
    TASK_MODEL_MAP = {
        "intent_parse": SONNET,        # 意图解析需要理解力
        "persona_generate": HAIKU,      # 批量生成用最便宜的
        "data_gap_fill": SONNET,        # 数据补全需要推理
        "sentiment_analysis": FLASH,    # 情感分析Flash足够
        "got_reasoning": OPUS,          # 核心推理用最强
        "mcts_evaluate": SONNET,        # 评估需要判断力
        "debate": SONNET,              # 辩论需要论证能力
        "explanation": SONNET,          # 解释生成需要表达力
        "causal_discovery": OPUS,       # 因果发现是核心
        "report_writing": SONNET,       # 报告需要专业写作
        "report_review": HAIKU,         # 审查可以用便宜的
        "translation": DEEPSEEK,        # 翻译DeepSeek很强
        "schema_mapping": FLASH,        # Schema映射简单
        "quality_check": HAIKU,         # 质量检查简单
    }

async def call_llm(task: str, messages: list, **kwargs):
    """统一LLM调用入口 — 根据任务自动选择模型"""
    model = Models.TASK_MODEL_MAP.get(task, Models.HAIKU)  # 默认最便宜
    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        **kwargs
    )
    # 记录调用成本 (OpenRouter返回usage信息)
    log_llm_cost(task, model, response.usage)
    return response

# LangGraph集成 — 用ChatOpenAI连接OpenRouter
from langchain_openai import ChatOpenAI

def get_langchain_llm(task: str):
    """为LangGraph节点获取正确的LLM实例"""
    model = Models.TASK_MODEL_MAP.get(task, Models.HAIKU)
    return ChatOpenAI(
        model=model,
        openai_api_base="https://openrouter.ai/api/v1",
        openai_api_key=os.environ["OPENROUTER_API_KEY"],
        default_headers={
            "HTTP-Referer": "https://futureos.app",
            "X-Title": "FutureOS"
        }
    )
```

## 2.7 MCP Servers (Claude Code 会用到)

```
核心MCP:
  - @anthropic/mcp-server-filesystem — 读写项目文件
  - @anthropic/mcp-server-git — Git操作
  - @anthropic/mcp-server-fetch — HTTP请求/API调用
  - supabase-mcp-server — Supabase数据库操作 (社区MCP)

开发辅助MCP:
  - @anthropic/mcp-server-puppeteer — 前端E2E测试截图
  - @anthropic/mcp-server-sequential-thinking — 复杂问题分解
  
数据采集MCP (Studio/Lite用, 自建):
  - census-data-server — 人口数据API
  - economic-data-server — 经济指标API
  - media-sentiment-server — 新闻+社媒情感
  - web-research-server — Web搜索+文档分析
```

## 2.8 环境变量清单

```bash
# .env (本地开发) / Railway环境变量 (生产)

# === Supabase ===
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # 后端用,不暴露给前端
SUPABASE_DB_URL=postgresql://...       # 直连URL (后端ORM需要)

# === OpenRouter ===
OPENROUTER_API_KEY=sk-or-v1-...

# === Redis (Railway自动注入) ===
REDIS_URL=redis://default:xxx@xxx.railway.app:6379

# === Neo4j Aura ===
NEO4J_URI=neo4j+s://xxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=xxx

# === 应用配置 ===
NEXT_PUBLIC_API_URL=https://api.futureos.app
CORS_ORIGINS=https://futureos.app
ENVIRONMENT=production  # development/staging/production

# === 监控 ===
SENTRY_DSN=https://xxx@sentry.io/xxx
```

---

# 🤖 PART 3: Claude Code 自主开发配置

## 3.1 Claude Code 安装与设置

```bash
# 安装 Claude Code
npm install -g @anthropic-ai/claude-code

# 初始化项目
mkdir futureos && cd futureos
claude-code init

# 配置 .claude/settings.json
{
  "model": "claude-sonnet-4-20250514",
  "maxTokens": 16000,
  "permissions": {
    "allowedTools": ["bash", "editor", "browser"],
    "allowedCommands": ["npm", "pnpm", "python", "pytest", "docker", "git"]
  }
}
```

## 3.2 Claude Code 项目配置文件 (CLAUDE.md)

> 这个文件放在项目根目录，Claude Code每次启动都会读取

```markdown
# CLAUDE.md — FutureOS Project Context

## 项目概述
FutureOS是一个未来计算引擎。三产品: Lite + Studio + Exchange。
详细架构见 docs/CONSTITUTION.md

## 开发规则
1. 每次开始前读取: docs/CONSTITUTION.md + 相关 contracts/ + sessions/current.md
2. 使用TypeScript(前端) + Python(后端)
3. 每个功能必须写测试（覆盖率>80%）
4. 提交前运行: pnpm lint && pnpm test && cd api && pytest
5. 遵循模块契约(contracts/)接口，不跨模块直接依赖
6. 每次会话结束更新 sessions/current.md

## 项目结构
futureos/
├── CLAUDE.md                 # 本文件(Claude Code读取)
├── docs/
│   ├── CONSTITUTION.md       # 项目宪法(最高准则)
│   ├── contracts/            # 模块接口契约
│   ├── specs/                # 模块实现规格
│   ├── sessions/             # 会话状态
│   └── decisions/            # 决策日志
├── web/                      # Next.js前端
│   ├── app/                  # App Router页面
│   ├── components/           # 共享组件
│   ├── lib/                  # 工具函数
│   ├── stores/               # Zustand stores
│   └── tests/                # 前端测试
├── api/                      # FastAPI后端
│   ├── app/
│   │   ├── core/             # 配置/数据库/认证
│   │   ├── models/           # Pydantic数据模型
│   │   ├── schemas/          # Pydantic schemas
│   │   ├── routers/          # API路由
│   │   ├── services/         # 业务逻辑
│   │   └── agents/           # LangGraph Agent
│   └── tests/                # 后端测试
├── engine/                   # Rust仿真核心
│   ├── src/
│   └── tests/
├── shared/                   # 共享类型定义
│   └── types/                # TypeScript+Python共享接口
├── mcp-servers/              # 自建MCP servers
├── supabase/                 # Supabase迁移+配置
│   ├── migrations/
│   └── config.toml
├── docker-compose.yml        # 本地开发 (Redis+Neo4j)
└── .github/workflows/        # CI/CD

## 技术命令
- 启动本地: supabase start && docker-compose up -d && pnpm dev & cd api && uvicorn app.main:app --reload
- 前端测试: cd web && pnpm test
- 后端测试: cd api && pytest -v --cov=app --cov-report=term-missing
- E2E测试: cd web && pnpm test:e2e
- 类型检查: cd web && pnpm tsc --noEmit
- Lint: pnpm lint && cd api && ruff check .
- 数据库迁移: supabase db push
- Railway部署: git push (自动触发)
```

## 3.3 让Claude Code自主开发的关键: Task分解协议

> 每次给Claude Code下达任务时，使用以下格式:

```
任务: [明确的功能描述]
上下文: 读取 contracts/[相关模块].md 和 specs/[相关模块].md
验收标准:
  1. [具体的可测试的标准]
  2. [具体的可测试的标准]
  3. 所有现有测试通过
  4. 新功能测试覆盖>80%
完成后:
  1. 更新 sessions/current.md
  2. 提交代码 (git commit -m "[模块]: [功能描述]")
```

## 3.4 Claude Code 自主Debug流程

```
当遇到错误时:
1. 读取错误信息全文
2. 检查相关contract/接口定义
3. 运行最小复现测试
4. 修复 → 运行全部相关测试
5. 确认不破坏其他模块 (运行回归测试)
6. 记录Bug和修复在 sessions/current.md
```

## 3.5 Claude Code 自主测试流程

```
每个功能完成后:
1. 写单元测试 (函数/组件级别)
2. 写集成测试 (API端到端)
3. 写E2E测试 (用户流程)  [仅关键路径]
4. 运行全部测试: pytest && pnpm test
5. 检查覆盖率: pytest --cov 确认>80%
6. 前端: Storybook组件文档更新
```

---

# 📋 PART 4: 外部记忆系统 — 完整文件模板

## 4.1 sessions/current.md 模板

```markdown
# 当前开发状态
更新时间: [时间戳]
当前Phase: [MVP-0 / MVP-1 / ...]
开发者: Claude Code

## ✅ 已完成
- [x] 功能A — 日期 — 测试通过
- [x] 功能B — 日期 — 测试通过

## 🔧 进行中
- [ ] 功能C — 当前状态描述 — 已知问题

## 🐛 已知Bug
- BUG-001: [描述] — 严重度:[高/中/低] — 影响模块:[名]

## 📝 下次需要做
1. [具体任务]
2. [具体任务]

## ⚠️ 重要决策待定
- [问题描述] — 选项A vs 选项B — 需要人类决策
```

## 4.2 contracts/ 模板 (每个模块一个)

```markdown
# Contract: [模块名]
版本: 1.0
最后更新: [日期]

## 接口定义

### API Endpoints
POST /api/v1/[endpoint]
  Request: { field1: string, field2: number }
  Response: { result: object, status: string }
  错误码: 400(参数错误) 401(未认证) 500(内部错误)

### 内部接口 (供其他模块调用)
function_name(param: Type) -> ReturnType
  描述: [做什么]
  前置条件: [什么条件必须满足]
  后置条件: [调用后的状态变化]

## 数据格式
```json
{
  "PredictionTask": {
    "type": "string (election|business|geopolitical|policy|tech|custom)",
    "region": "string (ISO 3166)",
    "timeframe": "string (ISO 8601 duration)",
    "outcomes": ["string"],
    "variables": [{"name": "string", "range": [min, max]}]
  }
}
```

## 依赖
- 依赖模块: [列表]
- 被依赖: [列表]

## 性能要求
- 响应时间: <Xms
- 并发: X请求/秒
```

## 4.3 decisions/ 模板

```markdown
# Decision: [主题]
日期: [YYYY-MM-DD]
决策者: [人名]
状态: 已决定

## 问题
[描述需要决策的问题]

## 选项
A. [选项描述] — 优点: ... — 缺点: ...
B. [选项描述] — 优点: ... — 缺点: ...

## 决定
选择 [A/B]

## 理由
[为什么选这个]

## 影响范围
- 影响的模块: [列表]
- 需要修改的contract: [列表]
```

---

# 🏗️ PART 5: MVP-0 (周1-2) — 基础设施搭建

> 目标: 项目脚手架 + 外部记忆系统 + CI/CD + 所有contracts初始版

## 5.1 Claude Code 任务清单

### Task 0.1: 项目初始化
```
任务: 初始化FutureOS项目结构
步骤:
1. 创建monorepo结构 (pnpm workspace)
2. 初始化Next.js 15 (web/)
3. 初始化FastAPI (api/)
4. 初始化Supabase项目 (supabase init + 本地: supabase start)
5. 创建docker-compose.yml (Redis+Neo4j — 本地开发用)
6. Railway项目创建 (3个Service: web+api+worker + Redis插件)
7. 创建CLAUDE.md + docs/目录结构
8. 配置环境变量 (.env.local + Railway环境变量)

验收:
- [ ] pnpm install 无错误
- [ ] supabase start 启动本地Supabase (localhost:54321)
- [ ] docker-compose up Redis+Neo4j正常
- [ ] cd web && pnpm dev → localhost:3000 显示页面
- [ ] cd api && uvicorn app.main:app → localhost:8000/docs 显示API文档
- [ ] Railway Dashboard显示3个Service
```

### Task 0.2: 数据库Schema初始化
```
任务: 创建所有数据库表的初始Schema
步骤:
1. Supabase PostgreSQL表 (supabase/migrations/001_init.sql):
   - profiles, predictions, prediction_results, scenarios, 
   - simulations, reports, audit_logs, markets, orders, reputation_scores
2. 启用pgvector扩展: agent_memories表(embedding vector(1536)列)
3. 启用pg_cron扩展: 定时漂移检测任务
4. Neo4j Aura: 因果图Schema (节点类型+边类型+约束)
5. Redis: 缓存key命名规范文档
6. Supabase RLS策略: 每张表配置行级安全

验收:
- [ ] supabase db push 成功
- [ ] Supabase Dashboard显示所有表
- [ ] pgvector扩展启用 (SELECT * FROM pg_extension)
- [ ] RLS启用 (每张表有policy)
- [ ] Neo4j节点/边类型+约束创建确认
```

### Task 0.3: 认证系统
```
任务: 集成Supabase Auth认证
步骤:
1. web/: @supabase/auth-helpers-nextjs 配置
   - middleware.ts (session刷新)
   - lib/supabase-client.ts (浏览器端)
   - lib/supabase-server.ts (服务端)
2. 登录页: /auth/login (Email+Google OAuth)
3. api/: Supabase JWT验证中间件 (验证Authorization header)
4. 受保护路由+RLS联动测试

验收:
- [ ] /auth/login 页面正常显示
- [ ] Email注册+登录成功
- [ ] Google OAuth登录成功
- [ ] 登录后获取Supabase JWT
- [ ] API用JWT调用受保护端点返回200
- [ ] 无JWT调用返回401
- [ ] RLS: 用户只能查自己的predictions
```

### Task 0.4: CI/CD管线
```
任务: GitHub Actions + Railway自动部署
步骤:
1. .github/workflows/ci.yml:
   - 前端: lint + type-check + test
   - 后端: ruff + pytest
2. Railway连接GitHub repo → main分支自动部署
3. PR必须通过CI才能合并
4. 配置Railway环境变量 (OPENROUTER_API_KEY, SUPABASE_*, NEO4J_*)

验收:
- [ ] 推送到PR触发CI
- [ ] lint失败则CI红
- [ ] 测试失败则CI红
- [ ] 全部通过则CI绿
- [ ] 合并到main → Railway自动部署
- [ ] Railway部署后可访问
```

### Task 0.5: 外部记忆系统文件
```
任务: 创建所有docs/文件
步骤:
1. docs/CONSTITUTION.md (从本蓝图Part 1复制)
2. docs/contracts/ 所有模块初始contract:
   - intent-parser.md
   - data-orchestrator.md
   - pop-synthesizer.md
   - simulation-engine.md
   - got-engine.md
   - mcts-engine.md
   - debate-engine.md
   - ensemble-aggregator.md
   - explanation-generator.md
   - causal-graph.md
   - drift-monitor.md
   - calibration.md
   - studio-orchestrator.md
   - exchange-signal-fusion.md
3. docs/sessions/current.md (初始化)
4. docs/decisions/ (空目录+README)

验收:
- [ ] 所有contract文件存在
- [ ] 每个contract至少包含: 接口定义+数据格式+依赖关系
- [ ] sessions/current.md 初始化
```

## 5.2 MVP-0 手动测试Checklist

| # | 测试项 | 预期结果 | 通过标准 |
|---|--------|---------|---------|
| 0.1 | `supabase start` | 本地Supabase启动 | localhost:54321 Studio可访问 |
| 0.2 | `docker-compose up -d` | Redis+Neo4j启动 | `docker ps` 显示 redis/neo4j Up |
| 0.3 | 访问 localhost:3000 | Next.js页面 | 200状态码，页面渲染无错误 |
| 0.4 | 访问 localhost:8000/docs | Swagger UI | API文档正确显示所有端点 |
| 0.5 | 点击登录 | Supabase Auth | Email+Google登录正常 |
| 0.6 | 登录后访问 /dashboard | 受保护页 | 显示用户信息，未登录则重定向 |
| 0.7 | `cd api && pytest` | 全部通过 | 0 failures |
| 0.8 | `cd web && pnpm test` | 全部通过 | 0 failures |
| 0.9 | 推送Git | CI运行 | GitHub Actions绿色 |
| 0.10 | `supabase db push` | 迁移成功 | Supabase Dashboard显示所有表+RLS |
| 0.11 | 检查docs/contracts/ | 文件完整 | 14个contract文件全部存在 |
| 0.12 | OpenRouter测试 | 调用成功 | curl OpenRouter → 模型响应正常 |
| 0.13 | Railway部署 | 三服务运行 | Dashboard显示web+api+worker健康 |

---

# 🏗️ PART 6: MVP-1 (周3-6) — Lite最小核心

> 目标: 输入问题 → 数据采集 → 100 Agent仿真 → GoT单引擎推理 → 基础输出

## 6.1 前端页面开发 (共4页)

### Page 1: 首页 (/lite)
```
任务: 创建Lite首页

组件树:
<LitePage>
  <Header>
    <Logo />
    <NavLinks: [首页, 发现, 我的] />
    <UserButton /> (Supabase Auth)
  </Header>
  <HeroSection>
    <Title: "探索任何问题的未来" />
    <SearchBar>
      <Input placeholder="输入你想预测的问题..." />
      <SubmitButton />
      <VoiceButton /> (Phase2)
    </SearchBar>
    <SuggestedQueries>  (3-5个热门模板)
      <QueryChip: "2026马来西亚大选谁赢?" />
      <QueryChip: "AI会取代多少工作?" />
      <QueryChip: "比特币年底到多少?" />
    </SuggestedQueries>
  </HeroSection>
  <TrendingSection>
    <SectionTitle: "热门预测" />
    <PredictionGrid>
      <PredictionCard> (每张卡片)
        <CategoryBadge />
        <Title />
        <ProbabilityBar />
        <TimeLeft />
        <ViewCount />
      </PredictionCard>
    </PredictionGrid>
  </TrendingSection>
</LitePage>

状态管理 (Zustand):
  useLiteStore:
    - query: string
    - isLoading: boolean
    - predictions: Prediction[]
    - submitQuery(q: string): void

API调用:
  GET /api/v1/predictions/trending → Prediction[]
  POST /api/v1/predictions/create → { id, status }

测试:
  - 组件渲染测试 (Vitest)
  - 搜索输入+提交测试
  - 热门预测加载测试
  - 空状态测试

验收:
  - [ ] 页面在<1秒内加载
  - [ ] 搜索框可输入+提交
  - [ ] 热门预测卡片正确显示
  - [ ] 移动端响应式正常
  - [ ] Lighthouse性能>90
```

### Page 2: 进度页 (/lite/[id]/progress)
```
任务: 创建预测进度页

组件树:
<ProgressPage>
  <ProgressHeader>
    <QueryDisplay: 用户问题 />
    <CancelButton />
  </ProgressHeader>
  <StageProgress>
    <StageItem stage="意图解析" status="done|running|pending" />
    <StageItem stage="数据采集" status="..." />
    <StageItem stage="人口合成" status="..." />
    <StageItem stage="仿真运行" status="..." />
    <StageItem stage="深度推理" status="..." />
    <StageItem stage="解释生成" status="..." />
    <StageItem stage="渲染准备" status="..." />
  </StageProgress>
  <CurrentDetail>
    <AgentAnimation /> (简单CSS动画MVP阶段)
    <StatusText: "正在采集经济数据..." />
    <ProgressBar value={percent} />
  </CurrentDetail>
  <EstimatedTime remaining={seconds} />
</ProgressPage>

实时更新:
  Socket.IO: 连接 /ws/prediction/{id}
  事件: stage_update, progress_update, complete, error

状态管理:
  usePredictionProgress:
    - stages: Stage[]
    - currentStage: number
    - progress: number
    - estimatedRemaining: number

验收:
  - [ ] 7个阶段正确显示
  - [ ] 实时进度更新(Socket.IO)
  - [ ] 完成后自动跳转到结果页
  - [ ] 取消按钮可用
  - [ ] 错误状态正确显示
```

### Page 3: 因果图结果页 (/lite/[id]/result) — 核心页面
```
任务: 创建因果图交互页(Lite核心体验)

组件树:
<ResultPage>
  <TopBar>
    <QueryDisplay />
    <ShareButton />
    <DownloadButton />
  </TopBar>
  <MainLayout style="grid: 1fr 300px / auto">
    <CausalGraphPanel> (主区域)
      <D3CausalGraph>
        {nodes.map(n => <GraphNode
          id={n.id}
          label={n.label}
          probability={n.probability}  // 节点大小
          confidence={n.confidence}    // 节点颜色
          onClick={expandNode}
        />)}
        {edges.map(e => <GraphEdge
          source={e.source}
          target={e.target}
          weight={e.weight}    // 线条粗细
          type={e.type}        // 正/负因果
        />)}
      </D3CausalGraph>
      <TimelineSlider min={0} max={180} /> (MVP简化版)
    </CausalGraphPanel>
    <SidePanel>
      <ProbabilityDashboard>
        <OutcomeCard outcome="A" probability={0.42} confidence={0.08} />
        <OutcomeCard outcome="B" probability={0.31} confidence={0.07} />
        <OutcomeCard outcome="C" probability={0.22} confidence={0.06} />
      </ProbabilityDashboard>
      <VariableSliders>
        <VariableSlider name="经济增长率" min={-5} max={10} value={3} onChange={rerun} />
        <VariableSlider name="油价" min={40} max={150} value={80} onChange={rerun} />
        <VariableSlider name="丑闻曝光" min={0} max={1} value={0} onChange={rerun} />
      </VariableSliders>
      <ViewReasoningButton onClick={openReasoning} />
    </SidePanel>
  </MainLayout>
</ResultPage>

关键交互:
  1. 拖动变量滑块 → POST /api/v1/predictions/{id}/rerun
     → 差分重跑(只重跑受影响子图)
     → Socket.IO推送新概率
     → 因果图平滑动画更新
  2. 点击节点 → 展开因果子图
  3. 时间轴 → 查看不同时间点的概率变化

状态管理:
  useResultStore:
    - graphData: { nodes: Node[], edges: Edge[] }
    - probabilities: OutcomeProbability[]
    - variables: Variable[]
    - isRerunning: boolean
    - updateVariable(name, value): void
    - expandNode(nodeId): void

API:
  GET /api/v1/predictions/{id}/result → FullResult
  POST /api/v1/predictions/{id}/rerun → { jobId }
  WS /ws/prediction/{id} → 实时更新

D3.js配置:
  - 力导向图: forceSimulation + forceManyBody + forceLink + forceCenter
  - 节点大小: d3.scaleSqrt().domain([0,1]).range([10,50])
  - 节点颜色: d3.scaleSequential(d3.interpolateRdYlGn).domain([0,1])
  - 边粗细: d3.scaleLinear().domain([0,1]).range([1,8])
  - 边颜色: 正因果=绿 负因果=红
  - 过渡动画: .transition().duration(500)

验收:
  - [ ] 因果图正确渲染(节点+边)
  - [ ] 节点大小反映概率
  - [ ] 节点颜色反映信心度
  - [ ] 拖动变量→概率实时变(3秒内)
  - [ ] 概率仪表盘同步更新
  - [ ] 点击节点可展开
  - [ ] 移动端可用(手势缩放)
```

### Page 4: 推理链页 (/lite/[id]/reasoning)
```
任务: 创建推理链查看页

组件树:
<ReasoningPage>
  <BackToGraph />
  <ReasoningTabs>
    <Tab: "关键因素">
      <SHAPChart> (水平条形图)
        <FactorBar name="经济增长" impact={0.35} direction="positive" />
        <FactorBar name="丑闻事件" impact={-0.22} direction="negative" />
        ...
      </SHAPChart>
    </Tab>
    <Tab: "推理过程">
      <GoTVisualization>  (简化版: 树形展示)
        <ThoughtNode depth={0} text="问题分解..." />
          <ThoughtNode depth={1} text="经济维度..." />
          <ThoughtNode depth={1} text="政治维度..." />
      </GoTVisualization>
    </Tab>
    <Tab: "辩论记录">  (MVP-3才有)
      <DebateTimeline>
        <DebateEntry role="乐观者" argument="..." />
        <DebateEntry role="悲观者" argument="..." />
        ...
      </DebateTimeline>
    </Tab>
  </ReasoningTabs>
</ReasoningPage>

验收:
  - [ ] SHAP因素归因图正确显示
  - [ ] GoT推理树可展开/折叠
  - [ ] 辩论记录Tab存在(MVP-3前显示"敬请期待")
```

## 6.2 后端API开发

### API 1: 预测创建
```
POST /api/v1/predictions/create

请求:
{
  "query": "2026马来西亚大选谁赢?",
  "options": {
    "precision": "standard",  // standard|high|ultra
    "timeframe": "P6M",       // ISO 8601
    "region": "MY"
  }
}

响应:
{
  "id": "pred_abc123",
  "status": "processing",
  "estimated_seconds": 120,
  "ws_channel": "/ws/prediction/pred_abc123"
}

后端流程:
1. 验证请求 (Pydantic schema)
2. 创建Prediction记录 (PostgreSQL)
3. 启动Celery任务: run_prediction_pipeline
4. 返回ID + WebSocket通道

Celery任务 run_prediction_pipeline:
  Stage 1: IntentParser Agent (LangGraph)
    → call_llm("intent_parse") → OpenRouter → Sonnet: 解析意图
    → 输出: PredictionTask JSON
    → Supabase Realtime: predictions表status更新 → 前端自动订阅

  Stage 2: DataOrchestrator (LangGraph Fan-Out)
    → 并行启动4个Sub-Agent:
      → CensusDataAgent: 调用人口数据API
      → EconomicDataAgent: 调用经济数据API
      → MediaSentimentAgent: OpenRouter → Gemini Flash 情感分析
      → GapFillerAgent: OpenRouter → Sonnet 推断补全
    → Fan-In: 合并数据 + 质量评分
    → Socket.IO emit: { stage: 2, status: "done" }

  Stage 3: PopSynthesizer
    → IPF算法: scipy + numpy
    → PersonaGenerator: OpenRouter → Haiku 批量调用
    → NetworkBuilder: NetworkX
    → 输出: Agent列表 + 社交图
    → Socket.IO emit: { stage: 3, status: "done" }

  Stage 4: SimulationEngine
    → MVP: Python实现 (Rust在V2.0)
    → 100 Agent × 30 Tick (简化版)
    → 每Agent: 规则引擎决策 (MVP不用LLM)
    → Socket.IO emit: { stage: 4, status: "done", progress: X% }

  Stage 5: GoT Reasoning (MVP只有GoT单引擎)
    → call_llm("got_reasoning") → Opus: 图推理
    → Generate → Evaluate → Merge → Refine
    → 输出: ReasoningGraph + 概率分布
    → Socket.IO emit: { stage: 5, status: "done" }

  Stage 6: ExplanationGenerator
    → call_llm("explanation") → Sonnet: 生成解释
    → SHAP归因计算
    → Socket.IO emit: { stage: 6, status: "done" }

  Stage 7: 数据存储 + 通知完成
    → 存储结果到Supabase (predictions + prediction_results表)
    → Socket.IO emit: { stage: 7, status: "done", redirect: "/lite/{id}/result" }

LangGraph工作流定义:
  from langgraph.graph import StateGraph, END
  
  workflow = StateGraph(PredictionState)
  workflow.add_node("intent_parser", intent_parser_node)
  workflow.add_node("data_orchestrator", data_orchestrator_node)
  workflow.add_node("pop_synthesizer", pop_synthesizer_node)
  workflow.add_node("simulation", simulation_node)
  workflow.add_node("got_reasoning", got_reasoning_node)
  workflow.add_node("explanation", explanation_node)
  workflow.add_edge("intent_parser", "data_orchestrator")
  workflow.add_edge("data_orchestrator", "pop_synthesizer")
  workflow.add_edge("pop_synthesizer", "simulation")
  workflow.add_edge("simulation", "got_reasoning")
  workflow.add_edge("got_reasoning", "explanation")
  workflow.add_edge("explanation", END)

测试:
  - test_create_prediction_valid_input()
  - test_create_prediction_invalid_input()
  - test_pipeline_stage_progression()
  - test_websocket_updates()
  - test_prediction_result_storage()

验收:
  - [ ] POST返回prediction ID
  - [ ] WebSocket实时推送7阶段进度
  - [ ] 全流程完成<5分钟
  - [ ] 结果正确存储
  - [ ] 错误情况正确处理(返回错误状态)
```

### API 2: 获取结果
```
GET /api/v1/predictions/{id}/result

响应:
{
  "id": "pred_abc123",
  "query": "...",
  "status": "completed",
  "result": {
    "outcomes": [
      { "name": "PH赢", "probability": 0.42, "confidence_interval": [0.34, 0.50] },
      { "name": "PN赢", "probability": 0.31, "confidence_interval": [0.24, 0.38] },
      { "name": "悬峙议会", "probability": 0.22, "confidence_interval": [0.16, 0.28] }
    ],
    "causal_graph": {
      "nodes": [...],
      "edges": [...]
    },
    "reasoning": {
      "got_tree": {...},
      "shap_factors": [...],
      "explanation_text": "..."
    },
    "variables": [
      { "name": "GDP增长率", "current": 3.0, "range": [-5, 10], "impact": 0.35 }
    ],
    "metadata": {
      "agent_count": 100,
      "simulation_ticks": 30,
      "reasoning_engines": ["got"],
      "total_time_seconds": 180,
      "cost_usd": 0.35
    }
  }
}

验收:
  - [ ] 返回完整概率分布+置信区间
  - [ ] 因果图数据完整(节点+边+权重)
  - [ ] SHAP归因数据可用
  - [ ] 变量列表+范围+影响度
```

### API 3: 变量重跑
```
POST /api/v1/predictions/{id}/rerun

请求:
{
  "variables": {
    "GDP增长率": 5.0,
    "油价": 120
  }
}

响应:
{
  "job_id": "rerun_xyz",
  "estimated_seconds": 3,
  "ws_channel": "/ws/prediction/{id}"
}

后端: 差分重跑
  1. 从因果图中找到受影响的节点子集
  2. 只重跑这些节点的推理
  3. 更新概率分布
  4. Socket.IO推送新结果

验收:
  - [ ] 响应<3秒
  - [ ] 只重跑受影响部分(不全量重跑)
  - [ ] 概率变化合理
```

## 6.3 MVP-1 手动测试Checklist

| # | 测试项 | 操作 | 预期结果 | 通过标准 |
|---|--------|------|---------|---------|
| 1.1 | Lite首页 | 访问/lite | 页面加载 | 搜索框+热门预测显示，<1秒 |
| 1.2 | 输入问题 | 输入"2026大选谁赢" | 提交成功 | 跳转进度页，显示prediction ID |
| 1.3 | 进度显示 | 观察进度页 | 7阶段逐步完成 | 每阶段有状态更新，实时 |
| 1.4 | 结果展示 | 等待完成 | 跳转因果图 | 概率+因果图+变量显示 |
| 1.5 | 因果图渲染 | 查看图 | D3图正确 | 节点大小=概率，颜色=信心 |
| 1.6 | 变量操控 | 拖动GDP滑块 | 概率变化 | <3秒更新，变化合理 |
| 1.7 | 推理查看 | 点击"查看推理" | 推理页 | SHAP归因+GoT树显示 |
| 1.8 | 全流程时间 | 端到端 | <5分钟 | 从输入到看到结果 |
| 1.9 | 错误处理 | 输入无意义文本 | 友好错误 | 显示"无法理解"而非崩溃 |
| 1.10 | 移动端 | 手机访问 | 响应式 | 所有功能可用 |
| 1.11 | API测试 | POST无token | 401 | 正确拒绝未认证 |
| 1.12 | 后端测试 | pytest | 全通过 | 0 failures, 覆盖>80% |
| 1.13 | 前端测试 | pnpm test | 全通过 | 0 failures |
| 1.14 | CI | 推送Git | 绿色 | 所有检查通过 |

---

# 🏗️ PART 7: MVP-2 (周7-10) — 因果图深度交互

> 目标: D3因果图完整交互 + 变量操控台 + 差分重跑 + 推理链详情

## 7.1 开发任务

### Task 2.1: D3因果图增强
```
目标: 从基础渲染升级为完整交互
新增功能:
  - 点击节点展开子图(动画)
  - 双击节点查看详情面板
  - 拖拽节点重排布局
  - 缩放+平移(d3.zoom)
  - 边hover显示因果关系描述
  - 搜索/高亮特定节点
  - 布局算法切换(力导向/层次/径向)
  - 导出为PNG/SVG

验收:
  - [ ] 100+节点流畅渲染(60fps)
  - [ ] 点击展开动画<200ms
  - [ ] 触摸设备手势支持
  - [ ] 深色/浅色主题切换
```

### Task 2.2: 变量操控台增强
```
目标: 从单个滑块升级为完整操控面板
新增:
  - 变量分组(经济/政治/社会/...)
  - 链接变量(改GDP自动影响失业率)
  - 预设情景按钮("乐观"/"悲观"/"基准")
  - 变量重置按钮
  - 变量锁定(固定某变量不变)
  - 敏感度提示(哪个变量影响最大标红)

验收:
  - [ ] 5-10个变量同时显示
  - [ ] 链接变量联动正确
  - [ ] 预设情景一键应用
  - [ ] 敏感度排序正确(SHAP)
```

### Task 2.3: 差分重跑优化
```
目标: 变量修改后只重跑受影响部分

后端:
  1. 从因果图获取变量的下游节点集
  2. 只对这些节点重新推理
  3. 更新概率(保持未变节点不变)
  4. 推送增量更新(不推全量)

验收:
  - [ ] 单变量修改<3秒响应
  - [ ] 多变量同时修改<5秒
  - [ ] 只有相关节点概率变化
  - [ ] 未变节点概率不变
```

## 7.2 MVP-2 手动测试Checklist

| # | 测试项 | 操作 | 预期结果 | 通过标准 |
|---|--------|------|---------|---------|
| 2.1 | 因果图交互 | 点击节点 | 展开子图 | 动画流畅<200ms |
| 2.2 | 缩放平移 | 鼠标滚轮+拖拽 | 缩放+移动 | 流畅60fps |
| 2.3 | 变量分组 | 查看侧栏 | 变量分组显示 | 经济/政治/社会分类 |
| 2.4 | 预设情景 | 点击"悲观" | 变量批量修改 | 概率合理变化<5秒 |
| 2.5 | 差分重跑 | 改一个变量 | 部分更新 | <3秒,只影响下游节点 |
| 2.6 | 边描述 | hover边 | tooltip | 显示因果关系描述 |
| 2.7 | 导出 | 点击PNG导出 | 下载 | 图片清晰完整 |
| 2.8 | 大图性能 | 100+节点 | 流畅 | 无卡顿 |

---

# 🏗️ PART 8: MVP-3 (周11-14) — 三引擎 + 校准

> 目标: GoT + MCTS + 辩论三引擎并行 + 集成聚合 + 历史回测

## 8.1 三引擎实现

### GoT Engine (已有,增强)
```
增强:
  - 更多维度分解(6-8维)
  - 维度间交叉合并
  - 精炼轮次增加到3轮
  - 推理图可视化数据输出

contract变更:
  输出增加: reasoning_graph字段增加可视化元数据
```

### MCTS Engine (新建)
```
实现:
  class MCTSEngine:
    def search(self, state, iterations=200):
      root = MCTSNode(state)
      for i in range(iterations):
        node = self.select(root)        # UCB1
        child = self.expand(node)       # LLM生成
        value = self.evaluate(child)    # LLM评估
        self.backpropagate(child, value)
      return self.get_probability_distribution(root)

  UCB1公式: score = value/visits + C * sqrt(ln(parent_visits)/visits)
  C = 1.414 (标准值,可调)

  LLM调用 (通过OpenRouter):
    expand: Sonnet — 生成可能的未来发展
    evaluate: Sonnet — 评估该发展的可能性(0-1)

  优化:
    - 批量LLM调用(多个节点一次请求)
    - 缓存相似状态评估
    - 早停:收敛后停止(概率分布变化<1%)

验收:
  - [ ] 200迭代<60秒完成
  - [ ] 概率分布与GoT在±15%内一致
  - [ ] 树结构可序列化为JSON
```

### Debate Engine (新建)
```
实现:
  5个辩手角色:
    1. Optimist: 系统提示="找出最有利于积极结果的证据和论据"
    2. Pessimist: 系统提示="找出最有利于消极结果的证据和风险"
    3. Contrarian: 系统提示="质疑多数观点,寻找被忽略的替代解释"
    4. Historian: 系统提示="寻找历史上类似的情况,从中推断可能结果"
    5. Judge: 系统提示="评估各方论据质量,给出加权综合判断"

  辩论流程 (3轮):
    Round 1: 各辩手独立陈述 (Claude Sonnet × 5, 并行)
    Round 2: 各辩手针对其他人的论点反驳/补充 (输入Round1所有论点)
    Round 3: Judge综合评估 → 输出概率分布+共识度

  共识度计算:
    consensus = 1 - std(all_probabilities) / mean(all_probabilities)
    高共识(>0.8) → 高置信
    低共识(<0.5) → 高不确定性

验收:
  - [ ] 5辩手3轮完成<90秒
  - [ ] 辩论记录可序列化
  - [ ] 共识度计算正确
  - [ ] Judge结论包含关键因素权重
```

### Ensemble Aggregator
```
权重: 仿真40% + GoT25% + MCTS20% + 辩论15%
校准: Platt Scaling (scipy.optimize.minimize)
输出: 校准后概率 + 置信区间(Bootstrap)

验收:
  - [ ] 四引擎输出正确加权
  - [ ] Platt校准后概率在[0,1]且sum=1
  - [ ] Bootstrap置信区间计算正确
```

## 8.2 历史回测: GE15选举
```
任务: 用GE15(2022马来西亚大选)数据回测验证准确度

数据准备:
  - 2022年选前6个月数据作为输入
  - 真实选举结果作为验证
  - 222个选区级别数据

回测流程:
  1. 输入: 2022年5月的数据(选前6个月)
  2. 运行完整预测管线
  3. 对比: 预测 vs 真实结果
  4. 计算: Brier Score + 选区级误差

目标:
  - 整体赢家预测正确(PH赢)
  - 选区级误差<10%
  - Brier Score<0.25 (好于随机0.5)

验收:
  - [ ] 回测脚本可重复运行
  - [ ] Brier Score记录在calibration数据库
  - [ ] 误差分析报告生成
```

## 8.3 MVP-3 手动测试Checklist

| # | 测试项 | 操作 | 预期结果 | 通过标准 |
|---|--------|------|---------|---------|
| 3.1 | GoT增强 | 新预测 | 6-8维推理 | 推理图显示多维+合并 |
| 3.2 | MCTS运行 | 新预测 | 200迭代 | <60秒完成,概率合理 |
| 3.3 | 辩论运行 | 新预测 | 5辩手3轮 | <90秒,有辩论记录 |
| 3.4 | 集成聚合 | 查看结果 | 四引擎融合 | 概率=加权平均,有校准 |
| 3.5 | 辩论查看 | 推理页辩论Tab | 辩论展示 | 5辩手论点清晰可读 |
| 3.6 | GE15回测 | 运行回测 | Brier<0.25 | 整体赢家正确 |
| 3.7 | 全流程 | 端到端 | <5分钟 | 三引擎并行不串行 |
| 3.8 | 测试覆盖 | pytest --cov | >80% | 所有引擎有测试 |

---

# 🏗️ PART 9: MVP-4 (周15-18) — Lite完整版 + 社区

## 9.1 Agent 2D渲染 (PixiJS)
```
任务: PixiJS渲染Agent在地图上的行为可视化

组件: <AgentSimulationView>
  - 地图底图(简化版: 区域色块)
  - Agent小圆点(颜色=立场, 大小=影响力)
  - Agent间连线(社交网络可视化)
  - 信息传播动画(波纹效果)
  - 时间轴播放器(播放/暂停/速度)

验收:
  - [ ] 1000 Agent流畅渲染
  - [ ] 颜色正确反映立场
  - [ ] 播放/暂停/速度控制
  - [ ] 点击Agent显示画像
```

## 9.2 社区功能
```
页面: /lite/community
  - 预测排行(按准确度)
  - 公开预测时间线
  - 用户资料页(信誉+历史)

页面: /lite/share/[id]
  - 分享卡片(可嵌入)
  - 朋友对照(不同变量设置对比)

验收:
  - [ ] 信誉积分正确计算
  - [ ] 分享链接可打开
  - [ ] 排行按Brier Score排序
```

## 9.3 MVP-4 手动测试Checklist

| # | 测试项 | 通过标准 |
|---|--------|---------|
| 4.1 | 2D Agent渲染 | 1000点流畅, 颜色正确 |
| 4.2 | 播放控制 | 播放/暂停/2x-10x速度 |
| 4.3 | Agent详情 | 点击显示画像卡片 |
| 4.4 | 社区排行 | 按Brier排序, 数据正确 |
| 4.5 | 分享功能 | 链接可打开, 卡片渲染 |
| 4.6 | 信誉积分 | 预测正确后积分增加 |

---

# 🏗️ PART 10: V1.0 (周19-26) — Studio核心

## Studio开发顺序 (每个工作台独立开发,用contract保证集成)

### 周19-20: 数据工作台
### 周21-22: 人口+情景工作台
### 周23-24: 仿真控制台
### 周25-26: 报告+校准

> 每个工作台的详细specs见 docs/specs/studio-*.md
> 每个工作台开发后更新 sessions/current.md
> 每个工作台完成后运行全量回归测试

## Studio 手动测试总Checklist

| # | 工作台 | 关键测试 | 通过标准 |
|---|--------|---------|---------|
| S.1 | 数据 | 连接PostgreSQL数据源 | 数据预览正确 |
| S.2 | 数据 | 导入CSV | 质量评分显示 |
| S.3 | 数据 | 新鲜度监控 | 过期数据标红警告 |
| S.4 | 人口 | 合成10K人 | 人口金字塔正确 |
| S.5 | 人口 | 编辑个体 | 保存成功 |
| S.6 | 情景 | 绘制因果图 | 节点+连线+权重 |
| S.7 | 情景 | 版本保存 | Diff可查看 |
| S.8 | 仿真 | 启动仿真 | 实时仪表盘更新 |
| S.9 | 仿真 | 创建分支 | 并行运行+对比 |
| S.10 | 报告 | 生成PDF | 格式正确可打开 |
| S.11 | 校准 | Brier面板 | 历史趋势显示 |
| S.12 | 全流程 | 从数据到报告 | 端到端完成 |

---

# 🏗️ PART 11: V1.5 (周27-34) — Exchange + 漂移系统

> Exchange和漂移系统详细specs见独立文档
> 这是最高风险阶段,需要法律审查

## Exchange 手动测试Checklist

| # | 测试项 | 通过标准 |
|---|--------|---------|
| E.1 | 市场大厅 | 热门市场列表正确 |
| E.2 | AI信号 | 概率显示+推理链 |
| E.3 | 信誉下注 | 零成本参与,积分变化 |
| E.4 | 三信号显示 | AI/金融/信誉分解可见 |
| E.5 | 异常检测 | 模拟大额交易触发警告 |
| E.6 | 排行榜 | Brier Score排序 |

## 漂移系统 手动测试Checklist

| # | 测试项 | 通过标准 |
|---|--------|---------|
| D.1 | 数据过期检测 | 模拟过期数据→警告显示 |
| D.2 | 因果边衰减 | 30天后权重衰减可视化 |
| D.3 | Agent漂移 | 行为突变→异常标记 |
| D.4 | Brier漂移 | 模拟质量下降→重校准触发 |
| D.5 | 自动适应 | 漂移后概率自动调整 |

---

# 📊 PART 12: 进度监控方法

## 12.1 每日看板 (你手动检查)

```
□ sessions/current.md 是否更新?
□ 今日完成的功能是否有测试?
□ 测试覆盖率是否>80%?
□ CI是否绿色?
□ 有无新的决策需要记录?
```

## 12.2 每周审查

```
□ contracts/ 是否与代码一致?
□ specs/ 是否需要更新?
□ 技术债列表是否增长?
□ 性能指标是否达标?
□ 已完成功能回归测试是否通过?
```

## 12.3 每Phase验收

```
□ 所有Phase Checklist项全部通过
□ Lighthouse性能分>90
□ 后端pytest全通过+覆盖>80%
□ 前端Vitest全通过
□ E2E关键路径通过
□ 所有docs/已更新
□ sessions/current.md 反映准确状态
```

---

*本蓝图总计覆盖: 8个开发阶段 × 每阶段详细任务 × 前端组件树 × 后端API × Agent定义 × 测试Checklist × 进度监控方法。足以让Claude Code从零开始自主开发整个FutureOS平台。*
