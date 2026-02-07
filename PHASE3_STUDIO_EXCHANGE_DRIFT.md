# 🚀 FutureOS Phase 3: Studio + Exchange + 漂移系统
# 全部内容粘贴到 Claude Code 执行

---

先阅读 docs/BLUEPRINT.md 和 docs/sessions/current.md 恢复上下文。

Phase 1 (Lite MVP) + Phase 2 (三引擎+Agent+社区) 已完成并部署。
现在一次性推到 V1.5：Studio专业工作台 + Exchange预测市场 + 漂移免疫系统。

原则不变：
- LLM走OpenRouter (call_llm/call_llm_json)
- 数据库Supabase, 部署Railway
- 每功能写测试, 更新docs/sessions/current.md
- 自主决策，不要每步停

这是最大的一次构建，分8个阶段。按顺序执行，每阶段完成后简要汇报继续。

---

# ═══════════════════════════════════════════
# PART I: STUDIO (V1.0) — 专业分析师工作台
# ═══════════════════════════════════════════

## 阶段 H: 数据库 + Studio基础架构

### H1: 数据库迁移
创建 `supabase/migrations/003_studio.sql`:

```sql
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
  config jsonb not null,        -- 连接配置(URL/API key等)
  schema jsonb,                 -- 数据结构描述
  last_synced_at timestamptz,
  freshness_status text default 'fresh' check (freshness_status in ('fresh','stale','expired')),
  freshness_expiry interval default '7 days',
  row_count int default 0,
  created_at timestamptz default now()
);

-- 数据快照 (存储实际数据)
create table public.data_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.data_sources(id) on delete cascade,
  data jsonb not null,
  quality_score float,          -- 数据质量评分 0-1
  row_count int,
  captured_at timestamptz default now()
);

-- 人口模型
create table public.population_models (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.studio_projects(id) on delete cascade,
  name text not null,
  agent_count int default 1000,
  distribution jsonb not null,   -- 人口分布参数
  constraints jsonb,             -- 约束条件
  agents jsonb,                  -- 生成的Agent列表 (大JSON)
  network jsonb,                 -- 社交网络
  created_at timestamptz default now()
);

-- 情景 (因果图+变量设定)
create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.studio_projects(id) on delete cascade,
  name text not null,
  version int default 1,
  causal_graph jsonb not null,   -- {nodes:[], edges:[]}
  variables jsonb not null,      -- [{name, value, range, type}]
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
  config jsonb,                  -- {ticks, agent_decision_mode, parallel_branches}
  results jsonb,                 -- 完整仿真结果
  metrics jsonb,                 -- {brier_score, convergence, runtime_s}
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- 仿真分支 (A/B对比)
create table public.simulation_branches (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.simulation_runs(id) on delete cascade,
  branch_name text not null,
  variable_overrides jsonb,      -- 分支的变量修改
  results jsonb,
  created_at timestamptz default now()
);

-- 报告
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.studio_projects(id) on delete cascade,
  title text not null,
  content jsonb,                 -- Tiptap JSON
  template text default 'standard',
  export_urls jsonb,             -- {pdf: "url", pptx: "url"}
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
```

### H2: Studio API路由
创建 `api/app/routers/studio.py`:

```
# 项目管理
POST   /api/v1/studio/projects              → 创建项目
GET    /api/v1/studio/projects              → 项目列表
GET    /api/v1/studio/projects/{id}         → 项目详情
PATCH  /api/v1/studio/projects/{id}         → 更新项目
DELETE /api/v1/studio/projects/{id}         → 删除项目

# 数据工作台
POST   /api/v1/studio/projects/{id}/data-sources          → 添加数据源
GET    /api/v1/studio/projects/{id}/data-sources          → 数据源列表
POST   /api/v1/studio/data-sources/{id}/sync              → 同步数据
GET    /api/v1/studio/data-sources/{id}/preview            → 预览数据(前50行)
POST   /api/v1/studio/data-sources/{id}/quality-check      → 质量检查
DELETE /api/v1/studio/data-sources/{id}                    → 删除数据源

# 人口工作台
POST   /api/v1/studio/projects/{id}/populations            → 创建人口模型
GET    /api/v1/studio/projects/{id}/populations            → 人口模型列表
POST   /api/v1/studio/populations/{id}/generate            → 生成Agent
GET    /api/v1/studio/populations/{id}/agents              → Agent列表+网络
PATCH  /api/v1/studio/populations/{id}/agents/{agent_id}   → 编辑单个Agent

# 情景工作台
POST   /api/v1/studio/projects/{id}/scenarios              → 创建情景
GET    /api/v1/studio/projects/{id}/scenarios              → 情景列表
PATCH  /api/v1/studio/scenarios/{id}                       → 更新情景(因果图+变量)
POST   /api/v1/studio/scenarios/{id}/fork                  → 分叉情景
GET    /api/v1/studio/scenarios/{id}/diff/{other_id}       → 两情景差异对比

# 仿真控制台
POST   /api/v1/studio/projects/{id}/simulations            → 启动仿真
GET    /api/v1/studio/simulations/{id}                     → 仿真状态+结果
POST   /api/v1/studio/simulations/{id}/branch              → 创建分支
GET    /api/v1/studio/simulations/{id}/compare              → 分支对比

# 报告工作台
POST   /api/v1/studio/projects/{id}/reports                → 创建报告
GET    /api/v1/studio/reports/{id}                         → 报告详情
PATCH  /api/v1/studio/reports/{id}                         → 更新报告内容
POST   /api/v1/studio/reports/{id}/export                  → 导出 (PDF/PPTX)
```

每个端点写Pydantic schema + 基本CRUD逻辑。MVP阶段有些可以简化（比如数据源只支持CSV上传和手动输入）。

### H3: Studio布局
创建 Studio 布局和导航:

`src/app/studio/layout.tsx`:
- 左侧Sidebar: 项目列表 + 新建项目按钮
- 顶部: 项目名 + 5个工作台Tab切换
- 主内容区

`src/app/studio/page.tsx`:
- 项目列表页 (卡片网格)
- 新建项目Dialog

`src/app/studio/[projectId]/layout.tsx`:
- 5个工作台Tab: 数据 | 人口 | 情景 | 仿真 | 报告

---

## 阶段 I: 5个Studio工作台

### I1: 数据工作台
`src/app/studio/[projectId]/data/page.tsx`

功能:
- 数据源列表 (表格: 名称/类型/行数/新鲜度/上次同步)
- 新鲜度指示: 🟢fresh / 🟡stale / 🔴expired (基于freshness_expiry)
- "添加数据源" → Dialog:
  - CSV上传: 拖拽上传 → 解析 → 预览 → 确认
  - 手动输入: 表格编辑器
  - API连接: URL + Key (MVP简化: 只展示UI, 实际解析用后端)
- 点击数据源 → 预览面板: 前50行表格 + 统计摘要
- 质量检查按钮 → LLM评估数据质量(完整度/一致性/时效) → 质量评分
- 同步按钮 → 重新拉取(CSV重上传, API重调)

关键组件:
- `DataSourceTable.tsx` — 数据源列表
- `DataPreview.tsx` — 数据预览(表格+统计)
- `CSVUploader.tsx` — CSV拖拽上传
- `FreshnessIndicator.tsx` — 新鲜度灯

### I2: 人口工作台
`src/app/studio/[projectId]/population/page.tsx`

功能:
- 人口模型列表
- "创建人口" → 配置面板:
  - Agent数量滑块 (100-10000)
  - 人口分布参数: 年龄/性别/种族/区域/收入 各自的分布设定
  - 约束条件: "城市人口>60%", "25-45岁占40%"
- "生成" → 后端生成Agent列表 + 社交网络
- 生成后显示:
  - 人口金字塔图 (Recharts)
  - 区域分布地图 (简化版: 色块)
  - Agent列表 (虚拟滚动表格, 可编辑单个Agent)
  - 社交网络可视化 (D3力导向图, 复用Lite的)

关键组件:
- `PopulationConfig.tsx` — 分布参数配置
- `PopulationPyramid.tsx` — 人口金字塔(Recharts)
- `AgentTable.tsx` — Agent列表(虚拟滚动)
- `NetworkGraph.tsx` — 社交网络(D3)

### I3: 情景工作台
`src/app/studio/[projectId]/scenario/page.tsx`

这是Studio最核心的工作台 — 用户手动构建/编辑因果图。

功能:
- 情景列表 (左侧面板)
- 主区域: React Flow 因果图编辑器
  - 拖拽添加节点 (变量)
  - 连线表示因果关系 (正/负, 强度)
  - 双击节点编辑: 变量名/当前值/范围/类型
  - 双击边编辑: 因果方向/强度(0-1)/正负
  - 工具栏: 添加节点/删除/撤销/重做/自动布局/导出
- 右侧: 变量面板
  - 所有变量列表 + 当前值 + 滑块调整
  - 预设情景: "乐观/悲观/基准" → 一键切换变量组合
- 情景分叉: 从当前情景创建分支 → 修改变量 → 对比
- 版本历史: 每次保存创建新版本, 可查看diff

安装: `pnpm add @xyflow/react` (React Flow)

关键组件:
- `CausalGraphEditor.tsx` — React Flow编辑器(核心)
- `NodeEditor.tsx` — 节点编辑Dialog
- `EdgeEditor.tsx` — 边编辑Dialog
- `VariablePanel.tsx` — 变量面板
- `ScenarioSelector.tsx` — 情景切换
- `ScenarioDiff.tsx` — 情景对比

### I4: 仿真控制台
`src/app/studio/[projectId]/simulation/page.tsx`

功能:
- 仿真配置:
  - 选择人口模型
  - 选择情景
  - Tick数 (10-100)
  - Agent决策模式: 规则/LLM混合/纯LLM (MVP只做规则)
- "启动仿真" → Celery后台任务
- 实时仪表盘 (仿真运行中):
  - 当前Tick进度
  - 实时概率曲线 (Recharts LineChart, X=Tick, Y=概率)
  - Agent立场分布饼图
  - 关键事件日志
- 分支功能:
  - 仿真运行中或完成后 → "创建分支"
  - 修改某个变量 → 从当前Tick开始分叉运行
  - 分支对比: 两条概率曲线叠加显示

关键组件:
- `SimulationConfig.tsx` — 配置面板
- `SimulationDashboard.tsx` — 实时仪表盘
- `ProbabilityCurve.tsx` — 概率曲线(Recharts)
- `BranchCompare.tsx` — 分支对比视图

### I5: 报告工作台
`src/app/studio/[projectId]/report/page.tsx`

功能:
- 报告列表
- "新建报告" → 选择模板 (标准/简要/详细)
- Tiptap富文本编辑器:
  - 标题/段落/列表/表格
  - 插入图表: 从仿真结果中拉取概率图/因果图
  - 插入数据表: 从数据工作台拉取
  - AI辅助写作: 选中文本 → "AI改写/扩展/总结" → call_llm
- 导出:
  - PDF → 后端 WeasyPrint 生成
  - PPTX → 后端 python-pptx 生成
  - 下载链接 (存储在 Supabase Storage)

安装: `pnpm add @tiptap/react @tiptap/starter-kit @tiptap/extension-table`

关键组件:
- `ReportEditor.tsx` — Tiptap编辑器
- `ChartInsert.tsx` — 插入图表Dialog
- `ExportButton.tsx` — 导出按钮
- `AIWritingAssist.tsx` — AI写作助手

### I6: 报告导出后端
创建 `api/app/services/report_export.py`:

```python
async def export_pdf(report_id: str) -> str:
    """生成PDF, 上传到Supabase Storage, 返回URL"""
    # 1. 从DB获取报告内容(Tiptap JSON)
    # 2. 转换为HTML
    # 3. WeasyPrint渲染PDF
    # 4. 上传到Supabase Storage reports/bucket
    # 5. 返回公开URL
    pass

async def export_pptx(report_id: str) -> str:
    """生成PPTX"""
    # 1. 获取报告内容
    # 2. python-pptx生成幻灯片
    # 3. 上传Supabase Storage
    # 4. 返回URL
    pass
```

安装后端依赖: `poetry add weasyprint python-pptx`

---

# ═══════════════════════════════════════════
# PART II: EXCHANGE (V1.5) — 预测市场
# ═══════════════════════════════════════════

## 阶段 J: Exchange 数据库 + 核心API

### J1: 数据库迁移
创建 `supabase/migrations/004_exchange.sql`:

```sql
-- 预测市场
create table public.markets (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid references public.predictions(id),
  title text not null,
  description text,
  category text default 'general',
  status text default 'open' check (status in ('open','closed','resolved','cancelled')),
  resolution text,                   -- 最终结果
  resolved_at timestamptz,
  close_at timestamptz,              -- 自动关闭时间
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- 交易/下注 (零成本信誉积分)
create table public.market_positions (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references public.markets(id) on delete cascade,
  user_id uuid references public.profiles(id),
  outcome_name text not null,        -- 押注的结果
  amount float not null,             -- 押注积分数
  price float not null,              -- 买入时的概率/价格
  created_at timestamptz default now()
);

-- 市场价格历史
create table public.market_prices (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references public.markets(id) on delete cascade,
  outcome_name text not null,
  price float not null,              -- 当前概率/价格
  source text not null check (source in ('ai','crowd','reputation')),
  recorded_at timestamptz default now()
);

-- 三重信号记录
create table public.signal_snapshots (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references public.markets(id) on delete cascade,
  ai_signal jsonb not null,          -- {outcomes:[{name, probability}], engines_used}
  crowd_signal jsonb,                -- {outcomes:[{name, probability}], total_volume}
  reputation_signal jsonb,           -- {outcomes:[{name, probability}], top_predictors}
  fused_signal jsonb not null,       -- 三重融合后
  recorded_at timestamptz default now()
);

-- 异常检测日志
create table public.anomaly_logs (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references public.markets(id),
  anomaly_type text not null,        -- 'large_order','signal_divergence','sudden_shift'
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
```

### J2: Exchange API
创建 `api/app/routers/exchange.py`:

```
# 市场
GET    /api/v1/exchange/markets                    → 市场列表(筛选/排序)
GET    /api/v1/exchange/markets/{id}               → 市场详情+当前信号
POST   /api/v1/exchange/markets                    → 创建市场(从prediction创建)

# 交易
POST   /api/v1/exchange/markets/{id}/positions     → 下注(消耗信誉积分)
GET    /api/v1/exchange/markets/{id}/positions      → 当前持仓
GET    /api/v1/exchange/markets/{id}/orderbook      → 订单簿(各outcome的下注量分布)

# 信号
GET    /api/v1/exchange/markets/{id}/signals        → 三重信号(AI/Crowd/Reputation)
GET    /api/v1/exchange/markets/{id}/price-history   → 价格历史

# 管理
POST   /api/v1/exchange/markets/{id}/resolve        → 结算市场(admin)
GET    /api/v1/exchange/anomalies                   → 异常检测日志
```

### J3: 三重信号融合引擎
创建 `api/app/services/exchange/signal_fusion.py`:

```python
"""
三重信号融合
AI Signal: 来自三引擎集成结果
Crowd Signal: 来自市场参与者的下注分布
Reputation Signal: 来自高信誉用户的下注加权
"""

class SignalFusion:
    WEIGHTS = {
        "ai": 0.50,         # AI引擎权重最高
        "crowd": 0.30,      # 群体智慧
        "reputation": 0.20   # 高信誉用户的判断
    }
    
    async def compute(self, market_id: str) -> dict:
        ai_signal = await self._get_ai_signal(market_id)
        crowd_signal = await self._get_crowd_signal(market_id)
        reputation_signal = await self._get_reputation_signal(market_id)
        
        # 加权融合
        fused = self._fuse(ai_signal, crowd_signal, reputation_signal)
        
        # 异常检测
        anomalies = self._detect_anomalies(ai_signal, crowd_signal, reputation_signal)
        
        # 记录快照
        await self._save_snapshot(market_id, ai_signal, crowd_signal, reputation_signal, fused)
        
        return {
            "ai": ai_signal,
            "crowd": crowd_signal,
            "reputation": reputation_signal,
            "fused": fused,
            "anomalies": anomalies
        }
    
    async def _get_ai_signal(self, market_id) -> dict:
        """从关联的prediction结果获取AI概率"""
        # 查market → prediction_id → prediction_results
        pass
    
    async def _get_crowd_signal(self, market_id) -> dict:
        """从所有下注计算群体概率"""
        # 各outcome的总下注量占比
        pass
    
    async def _get_reputation_signal(self, market_id) -> dict:
        """高信誉用户(top20%)的下注加权概率"""
        # 按reputation_score加权
        pass
    
    def _fuse(self, ai, crowd, reputation) -> dict:
        """加权融合三信号"""
        outcomes = set()
        for signal in [ai, crowd, reputation]:
            for o in signal.get("outcomes", []):
                outcomes.add(o["name"])
        
        fused = []
        for name in outcomes:
            p = 0
            for signal, weight in [(ai, self.WEIGHTS["ai"]), (crowd, self.WEIGHTS["crowd"]), (reputation, self.WEIGHTS["reputation"])]:
                prob = next((o["probability"] for o in signal.get("outcomes", []) if o["name"] == name), 0)
                p += prob * weight
            fused.append({"name": name, "probability": round(p, 4)})
        
        # 归一化
        total = sum(f["probability"] for f in fused)
        if total > 0:
            for f in fused:
                f["probability"] = round(f["probability"] / total, 4)
        
        return {"outcomes": fused}
    
    def _detect_anomalies(self, ai, crowd, reputation) -> list:
        """检测异常: 大额下注/信号分歧/突然变化"""
        anomalies = []
        
        # 检查AI和Crowd之间的巨大分歧
        for ai_o in ai.get("outcomes", []):
            name = ai_o["name"]
            crowd_prob = next((o["probability"] for o in crowd.get("outcomes", []) if o["name"] == name), None)
            if crowd_prob and abs(ai_o["probability"] - crowd_prob) > 0.25:
                anomalies.append({
                    "type": "signal_divergence",
                    "severity": "warning",
                    "details": f"{name}: AI={ai_o['probability']:.0%} vs Crowd={crowd_prob:.0%}"
                })
        
        return anomalies
```

### J4: 信誉积分系统
创建 `api/app/services/exchange/reputation.py`:

```python
"""
信誉积分系统
- 注册送1000积分
- 预测正确: 积分 × (1/概率) 的收益
- 预测错误: 损失下注积分
- Brier Score 越低 → reputation_score 越高
"""

INITIAL_POINTS = 1000

async def place_bet(user_id: str, market_id: str, outcome: str, amount: float):
    """下注"""
    # 1. 检查用户积分余额
    # 2. 扣除积分
    # 3. 创建 market_position
    # 4. 更新 crowd_signal
    pass

async def resolve_market(market_id: str, actual_outcome: str):
    """结算市场"""
    # 1. 标记market为resolved
    # 2. 遍历所有positions:
    #    - 押对的: 返还积分 + 收益(amount × 1/price)
    #    - 押错的: 积分归零
    # 3. 更新所有参与者的reputation_score (基于Brier Score)
    # 4. 更新calibration_logs
    pass

async def update_reputation(user_id: str):
    """重算用户信誉分 (基于历史准确度)"""
    # 查询用户所有已结算的positions
    # 计算综合Brier Score
    # reputation_score = 1000 * (1 - brier_score) + 预测次数加成
    pass
```

---

## 阶段 K: Exchange 前端

### K1: 市场大厅
`src/app/exchange/page.tsx`:
- 市场列表 (卡片网格)
- 每张卡片: 标题 + 当前最高概率outcome + 三重信号小条 + 参与人数 + 截止时间
- 筛选: 全部/政治/经济/科技/已关闭
- 排序: 最新/最热/即将截止/分歧最大

### K2: 市场详情页
`src/app/exchange/[id]/page.tsx`:

布局:
- 左侧(60%): 三重信号可视化
  - 三个圆环/条: AI信号 / 群体信号 / 信誉信号
  - 融合后的概率条(突出显示)
  - 价格历史曲线 (Recharts LineChart, 三条线)
- 右侧(40%): 下注面板
  - 选择outcome
  - 输入积分数量
  - 显示: 当前概率 / 潜在收益 / 风险
  - "下注" 按钮
  - 我的持仓列表

底部:
- 订单簿: 各outcome的下注量分布条形图
- 异常警告: 黄色/红色banner
- 关联Lite预测链接: "查看AI详细分析 →"

### K3: 投资组合页
`src/app/exchange/portfolio/page.tsx`:
- 我的总积分
- 活跃持仓列表
- 已结算历史 (盈/亏)
- 累计收益曲线

### K4: 三重信号组件
创建 `src/components/exchange/TripleSignal.tsx`:
- 三个并排的信号面板
- 每个面板: 信号来源标签 + 概率条 + 权重标注
- 融合结果: 粗线标注最终概率
- 分歧指示器: 三信号分歧大时显示⚠️

---

# ═══════════════════════════════════════════
# PART III: 漂移免疫系统 (V1.5)
# ═══════════════════════════════════════════

## 阶段 L: 漂移检测 + 自动适应

### L1: 数据库
创建 `supabase/migrations/005_drift.sql`:

```sql
-- 漂移检测记录
create table public.drift_events (
  id uuid primary key default gen_random_uuid(),
  drift_type text not null check (drift_type in ('data_expiry','causal_decay','agent_drift','calibration_drift','signal_divergence')),
  severity text default 'info' check (severity in ('info','warning','critical')),
  entity_type text,                  -- 'data_source','prediction','market','causal_edge'
  entity_id uuid,
  details jsonb not null,
  auto_action_taken text,            -- 描述自动采取的措施
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
  decay_rate float default 0.03,     -- 每天衰减3%
  last_validated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.drift_events enable row level security;
alter table public.causal_edge_weights enable row level security;
create policy "Drift events readable" on public.drift_events for select using (true);
create policy "Edge weights readable" on public.causal_edge_weights for select using (true);
```

### L2: 漂移监控服务
创建 `api/app/services/drift/monitor.py`:

```python
"""
漂移监控 — 5种漂移类型
1. 数据过期漂移: 数据源超过freshness_expiry
2. 因果边衰减: 因果关系随时间减弱
3. Agent行为漂移: 仿真Agent行为突变
4. 校准漂移: Brier Score趋势恶化
5. 信号分歧漂移: AI/Crowd/Reputation严重不一致
"""

class DriftMonitor:
    async def run_full_scan(self):
        """定期运行的全面漂移扫描"""
        results = []
        results.extend(await self.check_data_expiry())
        results.extend(await self.check_causal_decay())
        results.extend(await self.check_calibration_drift())
        results.extend(await self.check_signal_divergence())
        return results
    
    async def check_data_expiry(self) -> list:
        """检查所有数据源的新鲜度"""
        # 查 data_sources where now() > last_synced_at + freshness_expiry
        # fresh → stale → expired
        # expired: 创建drift_event + 标记数据源
        pass
    
    async def check_causal_decay(self) -> list:
        """因果边权重衰减"""
        # 查 causal_edge_weights
        # current_weight *= (1 - decay_rate) ^ days_since_validation
        # weight < 0.3: warning
        # weight < 0.1: critical → 建议移除该因果边
        pass
    
    async def check_calibration_drift(self) -> list:
        """校准质量下降检测"""
        # 查最近10个已结算预测的Brier Score
        # 如果趋势恶化(后5个比前5个高0.1+) → warning
        # 触发重校准建议
        pass
    
    async def check_signal_divergence(self) -> list:
        """三重信号严重分歧"""
        # 查 signal_snapshots
        # AI和Crowd差异>30% → warning
        # 三者互相差异>25% → critical
        pass

    async def auto_adapt(self, drift_event: dict):
        """自动适应: 根据漂移类型自动采取措施"""
        drift_type = drift_event["drift_type"]
        
        if drift_type == "data_expiry":
            # 标记相关预测需要重跑
            pass
        elif drift_type == "causal_decay":
            # 自动降低因果边权重 → 概率自动调整
            pass
        elif drift_type == "calibration_drift":
            # 触发Platt Scaling重校准
            pass
        elif drift_type == "signal_divergence":
            # 记录异常 + 发送通知
            pass
```

### L3: 漂移可视化
`src/app/admin/drift/page.tsx`:

漂移仪表盘:
- 漂移事件时间线 (最近30天)
- 分类统计: 数据过期X个 / 因果衰减X个 / 校准下降X个 / 信号分歧X个
- 每个事件可展开查看详情 + 自动措施
- 因果边衰减热力图: 所有因果边按权重着色 (绿=健康 → 红=衰减严重)
- 校准趋势曲线: Brier Score随时间的变化

### L4: 因果图衰减可视化
在Lite结果页的因果图中:
- 边的透明度 = 当前权重/原始权重
- 严重衰减的边显示虚线 + ⚠️图标
- Hover显示: "该因果关系置信度已从85%下降到42%，建议重新验证"

### L5: 定时漂移扫描
创建 Celery定时任务:
```python
# 每6小时运行一次漂移扫描
@celery_app.task
def periodic_drift_scan():
    monitor = DriftMonitor()
    events = await monitor.run_full_scan()
    for event in events:
        await monitor.auto_adapt(event)
```

---

# ═══════════════════════════════════════════
# PART IV: 整合 + 导航 + 收尾
# ═══════════════════════════════════════════

## 阶段 M: 全局整合

### M1: 全局导航更新
Header导航改为:
```
Logo | Lite | Studio | Exchange | Community | Leaderboard | [Avatar Menu]
```

移动端: 底部Tab导航

### M2: 首页更新
Landing page 更新:
- Hero: 产品名 + 新的价值主张(涵盖三产品线)
- 三产品卡片:
  - Lite: "探索任何问题的未来" → /lite
  - Studio: "专业级预测工作台" → /studio
  - Exchange: "用你的判断赚取信誉" → /exchange
- 社会证明: 预测总数/用户数/平均准确度 (从DB实时拉取)

### M3: 用户引导
新用户注册后:
- 自动发放1000信誉积分
- 引导页: 简单介绍三产品线
- 推荐第一步: 在Lite试一次预测

### M4: 全局搜索
创建 `/search` 页面:
- 搜索预测/市场/用户
- PostgreSQL全文搜索
- 搜索结果分类显示

---

## 阶段 N: 最终测试 + 收尾

### N1: 全量测试
```bash
cd api && pytest -v --cov=app    # 目标>70%
cd web && pnpm test              # 全通过
cd web && pnpm build             # 无错误
```

### N2: 全产品冒烟测试

**Lite路径:**
1. / → Lite → 输入问题 → 进度(三引擎) → 因果图 → 变量 → 推理(5Tab) → Agent
2. 分享 → 分享页

**Studio路径:**
3. /studio → 新建项目 → 数据工作台(上传CSV) → 人口工作台(生成1000Agent)
4. 情景工作台(React Flow编辑因果图) → 仿真控制台(运行+实时仪表盘)
5. 报告工作台(编辑+导出PDF)

**Exchange路径:**
6. /exchange → 市场大厅 → 选择市场 → 查看三重信号
7. 下注100积分 → 查看持仓 → 查看投资组合

**社区路径:**
8. /community → 发现预测
9. /leaderboard → 排行
10. /profile → 历史+积分

**漂移路径:**
11. /admin/drift → 漂移仪表盘 → 查看事件

### N3: 更新文档
- docs/sessions/current.md — 完整更新
- docs/contracts/ — 新增/更新所有Studio+Exchange+Drift相关contract
- docs/decisions/ — 记录三重信号权重、积分规则等决策

---

## 完成标准

```
=== Studio ===
[ ] 项目CRUD
[ ] 数据工作台 (CSV上传+预览+新鲜度)
[ ] 人口工作台 (配置+生成+金字塔图)
[ ] 情景工作台 (React Flow因果图编辑器)
[ ] 仿真控制台 (运行+实时仪表盘+分支)
[ ] 报告工作台 (Tiptap编辑+PDF导出)

=== Exchange ===
[ ] 市场大厅
[ ] 市场详情 + 三重信号可视化
[ ] 下注功能 (信誉积分)
[ ] 投资组合页
[ ] 三重信号融合正确 (AI 50% + Crowd 30% + Reputation 20%)
[ ] 异常检测

=== 漂移系统 ===
[ ] 数据过期检测
[ ] 因果边衰减
[ ] 校准漂移检测
[ ] 信号分歧检测
[ ] 漂移仪表盘
[ ] 因果图衰减可视化

=== 全局 ===
[ ] 导航更新 (Lite/Studio/Exchange/Community/Leaderboard)
[ ] Landing page更新 (三产品线)
[ ] 新用户1000积分
[ ] 后端 pytest >70%
[ ] 前端 build 无错误
[ ] 全产品11步冒烟测试通过
[ ] docs/ 全部更新
```

开始。按 H→I→J→K→L→M→N 顺序。这是最大的一次构建，自主决策，不要每步都停。每完成一个大阶段(Studio/Exchange/Drift/整合)简要汇报后继续。
