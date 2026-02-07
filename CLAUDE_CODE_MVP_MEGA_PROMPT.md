# 🚀 FutureOS MVP 一次性构建指令
# 把这个文件的全部内容粘贴到 Claude Code 中执行

---

先阅读 docs/BLUEPRINT.md 完整内容（这是我们的项目蓝图）。

Task 0.1 已完成（项目脚手架）。现在请按以下顺序，一次性完成从 Task 0.2 到完整可演示的 MVP 产品。每完成一个阶段，更新 docs/sessions/current.md。

重要原则：
- 所有 LLM 调用通过 OpenRouter API (openai SDK, base_url=https://openrouter.ai/api/v1)
- 数据库用 Supabase (supabase-py + 原生 SQL migrations)
- 不要用 Alembic / SQLAlchemy ORM / Clerk / Kafka
- 每个功能必须写测试
- 遇到需要真实外部数据的地方，先用 Mock 数据 + 硬编码样本，确保端到端能跑通

---

## 阶段 A：基础设施收尾 (Task 0.2 ~ 0.5)

### A1: 数据库 Schema
创建 supabase/migrations/001_init.sql：

```sql
-- 启用扩展
create extension if not exists "pgvector";
create extension if not exists "pg_cron";

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
  status text default 'pending' check (status in ('pending','processing','completed','failed','cancelled')),
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
```

执行: 将此 SQL 放入 supabase/migrations/ 并确认语法正确。
如果 supabase 本地没运行，就验证 SQL 语法，推送到远程 Supabase 用 `supabase db push`。

### A2: Supabase Auth 集成
在 web/ 中:
1. 安装 `@supabase/supabase-js` 和 `@supabase/ssr`
2. 创建 `src/lib/supabase/client.ts` (createBrowserClient)
3. 创建 `src/lib/supabase/server.ts` (createServerClient，用于 RSC)
4. 创建 `src/lib/supabase/middleware.ts` (session 刷新)
5. 更新 `middleware.ts` 使用 Supabase session 刷新
6. 创建 `/auth/login/page.tsx` — 登录页（Email + Magic Link，UI用shadcn）
7. 创建 `/auth/callback/route.ts` — OAuth回调
8. 创建 `src/components/auth/user-nav.tsx` — 用户头像+下拉菜单组件

在 api/ 中:
1. 安装 `supabase` (Python SDK)
2. 创建 `app/core/supabase.py` — 初始化 Supabase client (SERVICE_ROLE_KEY)
3. 创建 `app/core/auth.py` — FastAPI dependency: 从 request header 解析 Supabase JWT → 获取 user_id
4. 受保护路由测试: 有JWT=200, 无JWT=401

### A3: OpenRouter LLM 封装
在 api/ 中创建 `app/core/llm.py`:

```python
"""
OpenRouter 统一调用封装
通过 openai SDK 的兼容接口调用 OpenRouter
所有 LLM 调用必须通过此模块
"""
import os
from openai import AsyncOpenAI

client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ.get("OPENROUTER_API_KEY", ""),
    default_headers={
        "HTTP-Referer": "https://futureos.app",
        "X-Title": "FutureOS"
    }
)

class Models:
    OPUS = "anthropic/claude-opus-4"
    SONNET = "anthropic/claude-sonnet-4"
    HAIKU = "anthropic/claude-haiku"
    FLASH = "google/gemini-2.0-flash-001"
    DEEPSEEK = "deepseek/deepseek-chat"

TASK_MODEL = {
    "intent_parse": Models.SONNET,
    "persona_generate": Models.HAIKU,
    "data_gap_fill": Models.SONNET,
    "sentiment_analysis": Models.FLASH,
    "got_reasoning": Models.OPUS,
    "mcts_evaluate": Models.SONNET,
    "debate": Models.SONNET,
    "explanation": Models.SONNET,
    "causal_discovery": Models.OPUS,
    "report_writing": Models.SONNET,
    "quality_check": Models.HAIKU,
    "translation": Models.DEEPSEEK,
    "schema_mapping": Models.FLASH,
}

async def call_llm(task: str, messages: list, **kwargs) -> str:
    """统一入口：根据 task 自动选模型"""
    model = TASK_MODEL.get(task, Models.HAIKU)
    resp = await client.chat.completions.create(
        model=model,
        messages=messages,
        **kwargs
    )
    return resp.choices[0].message.content

async def call_llm_json(task: str, messages: list, **kwargs) -> dict:
    """返回 JSON 的版本"""
    import json
    text = await call_llm(task, messages, **kwargs)
    # 尝试提取 JSON
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text)
```

写测试: test_llm.py — mock OpenRouter 响应，验证 task→model 映射正确。

### A4: CI/CD
创建 `.github/workflows/ci.yml`:
- push/PR 时运行
- Job 1: 前端 — pnpm install → lint → type-check → test
- Job 2: 后端 — pip install → ruff → pytest
- 成功后 Railway 自动部署（Railway 自己连 GitHub，不需要在 Actions 里配）

### A5: 外部记忆系统
创建 docs/contracts/ 下的 14 个 contract 文件（每个至少包含：模块描述、输入/输出接口、依赖关系）：
intent-parser.md, data-orchestrator.md, pop-synthesizer.md, simulation-engine.md, got-engine.md, mcts-engine.md, debate-engine.md, ensemble-aggregator.md, explanation-generator.md, causal-graph.md, drift-monitor.md, calibration.md, studio-orchestrator.md, exchange-signal-fusion.md

---

## 阶段 B：Lite 核心产品（MVP-1 + MVP-2 合并）

这是产品的灵魂：用户输入问题 → 看到因果图 → 拖变量看概率变。

### B1: 共享 UI 组件
先构建会反复用到的 shadcn/ui 组件：
```bash
cd web
pnpm dlx shadcn@latest init  # 如果还没初始化
pnpm dlx shadcn@latest add button card input badge tabs slider dialog dropdown-menu avatar separator skeleton toast
```

然后创建自定义组件:
- `src/components/layout/header.tsx` — Logo + 导航 + UserNav（登录/未登录两态）
- `src/components/layout/footer.tsx` — 简单 footer
- `src/components/ui/probability-bar.tsx` — 概率条（彩色进度条+百分比）
- `src/components/ui/stage-progress.tsx` — 7阶段进度组件（done/running/pending状态）
- `src/components/ui/loading-dots.tsx` — 加载动画

### B2: Lite 首页 (/lite)
文件: `src/app/lite/page.tsx`

功能:
- Hero: 大标题 "探索任何问题的未来" + 搜索输入框 + 提交按钮
- 推荐问题 chips: 点击自动填入（硬编码3-5个示例问题）
- 热门预测网格: 从 Supabase 拉取 is_public=true 的 predictions
- 搜索提交 → POST /api/v1/predictions/create → 跳转 /lite/[id]/progress

状态: Zustand store `useLiteStore` (query, isLoading, predictions)
测试: 组件渲染 + 搜索提交 + 空状态

### B3: 后端预测管线（核心）
这是最关键的部分。分为两层：API 路由 + 后台管线。

**API 路由** (api/app/routers/predictions.py):
```
POST /api/v1/predictions/create   → 创建预测 + 启动后台任务
GET  /api/v1/predictions/{id}     → 获取预测状态
GET  /api/v1/predictions/{id}/result  → 获取完整结果
POST /api/v1/predictions/{id}/rerun   → 变量修改重跑
GET  /api/v1/predictions/trending     → 热门预测列表
```

**后台预测管线** (api/app/services/prediction_pipeline.py):

MVP 核心简化策略——先用 Mock + 真实 LLM 混合，确保端到端跑通：

```
Stage 1: IntentParser
  输入: 用户原始 query
  处理: call_llm("intent_parse", prompt) → 解析出结构化任务
  输出: {type, region, timeframe, outcomes[], key_variables[]}
  MVP简化: 如果 LLM 返回不了，用规则引擎硬编码兜底

Stage 2: DataCollection
  MVP简化: 不调真实外部 API
  处理: 硬编码马来西亚选举样本数据集（人口结构、经济数据、民调等）
  + call_llm("data_gap_fill") 补全缺失部分
  输出: {census:{}, economic:{}, sentiment:{}, gaps:[]}

Stage 3: PopSynthesizer
  MVP简化: 生成 100 个 Agent（不用 IPF，直接随机+约束分布）
  处理: 
    - 随机生成 100 人，属性: age, income, ethnicity, region, education
    - call_llm("persona_generate", batch) → 为每人生成 stance + reasoning
    - 简单社交网络: 同区域/同族群连接概率更高
  输出: {agents:[], network:{edges:[]}}

Stage 4: Simulation
  MVP简化: Python 实现，30 Tick，纯规则引擎（不用 LLM）
  处理:
    - 每 Tick: Agent 查看邻居意见 → 加权(自身立场70% + 邻居30%) → 更新立场
    - 加入噪声(偶尔有人随机改变立场)
    - 记录每 Tick 的聚合投票倾向
  输出: {ticks:[], final_distribution:{}, agent_histories:[]}

Stage 5: GoT Reasoning（真实 LLM，核心 IP）
  处理:
    - 把 Stage 1-4 的数据汇总成 context
    - call_llm("got_reasoning", 详细 prompt) 要求:
      1. 分解问题为 5-8 个维度（经济/政治/种族/城乡/年轻人/丑闻/外部）
      2. 每个维度给出分析 + 对各结果的影响方向和强度
      3. 交叉分析维度间的相互影响
      4. 综合给出各 outcome 的概率 + 置信区间
      5. 生成因果图数据（nodes + edges + weights）
    - 解析 LLM 返回的 JSON → 因果图 + 概率
  输出: {outcomes:[], causal_graph:{nodes:[], edges:[]}, reasoning_tree:{}}

Stage 6: Explanation
  处理: call_llm("explanation", context+results) → 生成人类可读解释
  + 从 GoT 结果中提取各因素影响力(简化版 SHAP: 就用 LLM 自己评估的维度权重)
  输出: {explanation_text, shap_factors:[{name, impact, direction}]}

Stage 7: 存储
  把所有结果写入 Supabase: predictions 表更新 status=completed + prediction_results 表插入
```

**实时进度推送**:
MVP 简化方案: 不用 Socket.IO。用 Supabase Realtime 代替。
- 后端: 每个 Stage 完成后更新 predictions 表的 status 字段 (如 "stage_1_done", "stage_2_done"...)
- 前端: 用 supabase.channel('prediction:'+id).on('postgres_changes') 订阅变更
- 这样零额外基础设施，Supabase 自带

**变量重跑 (rerun)**:
- 前端发送修改后的变量值
- 后端: 把原始 GoT context + 新变量值 → call_llm("got_reasoning", 修改后的 prompt)
- 只重跑 Stage 5-6，不重跑 1-4
- 返回新概率 + 更新后的因果图

所有 API 写测试（可以 mock LLM 返回）。

### B4: 进度页 (/lite/[id]/progress)
文件: `src/app/lite/[id]/progress/page.tsx`

功能:
- 显示用户的原始问题
- 7阶段进度列表 (StageProgress 组件)
- Supabase Realtime 订阅 predictions 表变更 → 更新 UI
- 阶段全部完成 → 自动跳转 /lite/[id]/result
- 取消按钮
- 简单的脉冲动画表示"正在处理"

测试: 进度更新 mock + 自动跳转

### B5: 因果图结果页 (/lite/[id]/result) — 产品灵魂
文件: `src/app/lite/[id]/result/page.tsx`

这是最重要的页面。布局：左侧大面积因果图 + 右侧面板(概率+变量滑块)。

**因果图** (D3.js 力导向图):
安装 d3: `pnpm add d3 @types/d3`
创建 `src/components/causal-graph/CausalGraph.tsx`:
- 用 useRef + useEffect 接管 DOM 渲染 D3
- 节点: 圆形, 大小=probability映射(d3.scaleSqrt), 颜色=confidence映射(红黄绿)
- 边: 线条, 粗细=weight, 颜色=正因果绿/负因果红, 箭头方向
- 交互: 拖拽节点 + 缩放平移(d3.zoom) + hover tooltip + 点击高亮
- 动画: .transition().duration(500)
- 响应式: resize observer 适配容器

**右侧面板**:
- ProbabilityDashboard: 各 outcome 的概率条 + 置信区间
- VariableSliders: 每个 key variable 一个 shadcn Slider
  - 拖动 → debounce 300ms → POST /rerun → 更新概率 + 因果图动画过渡
- ViewReasoningButton → 链接到推理页

状态: Zustand store `useResultStore`
测试: 图渲染 + 变量修改 + 概率更新

### B6: 推理链页 (/lite/[id]/reasoning)
文件: `src/app/lite/[id]/reasoning/page.tsx`

两个 Tab:
1. "关键因素" — 水平条形图 (Recharts BarChart, 按 impact 排序)
2. "推理过程" — GoT 树的简化展示 (可折叠树形列表)

安装: `pnpm add recharts`
测试: 数据加载 + 图表渲染

### B7: Landing Page (/)
主页不是 Lite 页。创建一个简洁的 landing page:
- Hero: 产品名 + 一句话价值主张 + CTA按钮 → /lite
- 3个特性卡片: 因果推理 / Agent仿真 / 实时探索
- 简洁深色设计, 科技感
- 底部: 简单 footer

---

## 阶段 C：打磨 + 全流程验证

### C1: 全流程冒烟测试
确保以下路径完整可走通:
1. 访问 / → 看到 landing page → 点击 CTA → 到 /lite
2. 在 /lite 输入 "2026马来西亚大选谁赢" → 提交
3. 跳转进度页 → 看到阶段逐步完成 (1→2→3→4→5→6→7)
4. 自动跳转结果页 → 看到因果图 + 概率 + 变量滑块
5. 拖动一个变量滑块 → 概率变化 + 因果图更新
6. 点击"查看推理" → 看到因素归因图 + 推理树

如果任何环节断了，修复它。

### C2: 错误处理
- API 错误 → 前端 toast 提示
- LLM 调用失败 → 重试 1 次 → 失败则 fallback 到硬编码结果
- 预测超时 (>5min) → 前端显示超时提示
- 无效输入 → 前端验证 + 后端 422

### C3: UI 打磨
- 深色主题全局一致 (dark mode)
- 加载状态: Skeleton loading
- 空状态: 适当的 empty state
- 移动端: 因果图页在小屏幕下右侧面板折叠到底部
- Favicon + meta tags + Open Graph

### C4: 写完整测试
确保:
- 后端: pytest 全通过, 覆盖率 >70%
- 前端: vitest 全通过
- 手动测试 checklist 全部项通过

---

## 完成标准

当你做完以上所有内容后，在 docs/sessions/current.md 更新完整状态，并告诉我以下验收结果:

```
[ ] Landing page (/) 正常显示
[ ] 登录功能正常 (Supabase Auth)
[ ] /lite 首页正常 + 热门预测显示
[ ] 输入问题 → 创建预测 → 进度页实时更新
[ ] 进度完成 → 自动跳转结果页
[ ] 因果图正确渲染 (D3 力导向图，节点+边)
[ ] 概率仪表盘显示正确
[ ] 变量滑块拖动 → 概率变化 (<5秒)
[ ] 推理链页显示因素归因 + 推理过程
[ ] 后端 pytest 全通过
[ ] 前端 vitest 全通过
[ ] 移动端基本可用
[ ] docs/sessions/current.md 已更新
```

开始吧。按阶段 A → B → C 的顺序执行。每完成一个阶段简要汇报状态，然后继续下一阶段。不要在每个小步骤都停下来问我——自主决策，遇到问题自己解决，只有需要我提供 API KEY 或做选择时才问我。
