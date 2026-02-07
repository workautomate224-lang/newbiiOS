# 🚀 FutureOS Phase 2: 三引擎 + Agent可视化 + 社区
# 把全部内容粘贴到 Claude Code 执行

---

先阅读 docs/BLUEPRINT.md 和 docs/sessions/current.md 恢复上下文。

Phase 1 完成并部署，全流程跑通。现在 Phase 2：单引擎→三引擎并行 + Agent 2D + 社区。

原则不变：LLM走OpenRouter(call_llm)，数据库Supabase，每功能写测试，自主决策不要每步停。

---

## 阶段 D：三引擎并行推理

### D1: MCTS Engine
创建 `api/app/services/engines/mcts_engine.py`

MCTSNode类: state/parent/children/visits/value/action, ucb1属性(C=1.414)

MCTSEngine类(iterations=100):
- search(context) → 主循环: select→expand→evaluate→backpropagate
- _select: UCB1选最优叶子
- _expand: call_llm_json("mcts_evaluate") 生成2-3个推理分支
- _evaluate: call_llm_json("mcts_evaluate") 评估路径合理性(0-1)
- _backpropagate: 回溯更新
- _extract_results: 返回 {engine:"mcts", top_paths:[], confidence, iterations}
- 深度限制4层, 每20次检查收敛(变化<5%早停)

测试: tests/test_mcts_engine.py — mock LLM

### D2: Debate Engine
创建 `api/app/services/engines/debate_engine.py`

5角色: optimist(乐观)/pessimist(悲观)/contrarian(逆向)/historian(历史)/judge(裁判)

DebateEngine类:
- run(context, outcomes) → 3轮辩论
- Round 1: 4辩手独立陈述 — asyncio.gather并行, 每人返回{analysis, probabilities, key_evidence}
- Round 2: 4辩手看到Round1后反驳 — asyncio.gather并行, 每人返回{rebuttals, updated_probabilities}  
- Round 3: Judge综合 → {probabilities, reasoning, key_arguments, confidence}
- 返回: {engine:"debate", outcomes, debate_log:[3 rounds], consensus}

关键: Round 1和Round 2的4个辩手必须asyncio.gather并行。
JSON提取: 先找```json```块, 再找最后{}块, 都失败用默认值。

测试: tests/test_debate_engine.py — mock LLM

### D3: Ensemble Aggregator
创建 `api/app/services/engines/ensemble.py`

权重: GoT 40% + Simulation 25% + MCTS 20% + Debate 15%

aggregate(engine_results, outcomes):
- 加权平均各引擎概率
- 归一化确保和=1
- Bootstrap置信区间 (从引擎间分歧)
- 引擎间共识度
- 返回: {outcomes:[{name, probability, confidence_interval, engine_breakdown}], engine_weights, consensus}

测试: tests/test_ensemble.py

### D4: 升级Pipeline
修改 prediction_pipeline.py Stage 5:

```python
import asyncio
got_result, mcts_result, debate_result = await asyncio.gather(
    got_engine.reason(context),
    MCTSEngine(iterations=80).search(context),
    DebateEngine().run(context, outcomes),
    return_exceptions=True  # 任一失败不影响其他
)
# 容错: 跳过失败的引擎
engine_results = {}
if not isinstance(got_result, Exception): engine_results["got"] = got_result
if not isinstance(mcts_result, Exception): engine_results["mcts"] = mcts_result
if not isinstance(debate_result, Exception): engine_results["debate"] = debate_result
if not engine_results: raise RuntimeError("所有引擎失败")

final = EnsembleAggregator().aggregate(engine_results, outcomes)
```

进度推送细化: Stage 5 → "5a: GoT / 5b: MCTS / 5c: 辩论 / 5d: 集成"
rerun也用三引擎(MCTS迭代减到30加速)

### D5: 更新结果API
GET /api/v1/predictions/{id}/result 响应新增:
```json
{
  "result": {
    "outcomes": [...],
    "engines": {
      "got": {"reasoning_tree": ...},
      "mcts": {"top_paths": [...], "iterations": 80},
      "debate": {"rounds": [...], "consensus": 0.X, "debaters": [...]},
      "ensemble": {"weights": {...}}
    }
  }
}
```

### D6: 引擎对比前端组件
结果页右侧面板概率条下方新增:
- 每个outcome显示引擎分解: "GoT 42% · MCTS 38% · Debate 45%"
- 引擎共识度指示器 (高=绿, 低=黄)

### D7: 推理页升级
推理链页新增/更新Tab:

**"辩论记录"Tab**(替换之前的"敬请期待"):
- 3轮时间线: Round 1开场 → Round 2反驳 → Round 3裁决
- 每辩手不同颜色卡片
- Judge裁决高亮

**"MCTS路径"Tab**(新增):
- top_paths列表(最多5条): 路径描述 + 探索次数 + 合理性进度条
- 统计: 总节点/迭代/最大深度

**"引擎对比"Tab**(新增):
- Recharts GroupedBarChart: X轴=outcomes, 4根柱子(GoT/MCTS/Debate/Final)
- 权重说明

### D8: 进度页更新
Stage 5 显示子阶段:
```
🔄 Stage 5: 深度推理
   ├── ✅ GoT图推理
   ├── 🔄 MCTS路径搜索
   └── 🔄 多角色辩论
```

确认 pytest + vitest 全通过后进入阶段E。

---

## 阶段 E：Agent 2D (PixiJS)

### E1: PixiJS渲染组件
安装: `cd web && pnpm add pixi.js@^8`

创建 `src/components/simulation/AgentSimulation.tsx`:
- Canvas渲染100个Agent小圆点
- 颜色=立场(红/蓝/灰), 大小=影响力
- 社交网络连线(半透明细线)
- 播放器: 播放/暂停/速度(1x/2x/5x/10x)/进度条
- 动画: 每Tick Agent颜色平滑过渡
- 点击Agent → Dialog弹窗(年龄/区域/族群/立场历史)

### E2: Agent视图集成
结果页新增视图切换: "因果图 | Agent仿真"
或者新建 `/lite/[id]/agents` 页面
确保仿真数据存在 prediction_results.metadata.agent_histories

### E3: 后端Agent数据
确保Stage 4存储: agents[{id,age,region,ethnicity,stance_history}], network.edges, kol_agents
新增API: GET /api/v1/predictions/{id}/agents

---

## 阶段 F：社区功能

### F1: 发现页 /lite/explore (或 /community)
- 公开预测列表(is_public=true, status=completed)
- 筛选: 全部/政治/经济/科技
- 排序: 最新/最热
- 预测卡片网格

### F2: 用户资料 /profile
- 头像+名字(可编辑)
- 预测历史
- 统计(总数/公开数)

### F3: 分享
- 结果页ShareButton → 复制链接 + toast
- /share/[id] 公开分享页(不需登录) + OG Meta tags
- CTA → /lite

### F4: 排行榜 /leaderboard
- 按reputation_score排序
- 排名/头像/名字/信誉分/预测次数

### F5: 支撑API
```
GET  /api/v1/predictions/explore  → 公开预测列表(筛选+排序+分页)
GET  /api/v1/users/me             → 当前用户
PATCH /api/v1/users/me            → 更新资料
GET  /api/v1/users/me/predictions → 我的预测列表
PATCH /api/v1/predictions/{id}    → 更新is_public
GET  /api/v1/leaderboard          → 排行榜
```

### F6: 导航更新
Header: 首页 | Lite | 社区 | 排行榜 | (头像菜单)

---

## 阶段 G：打磨收尾

### G1: 性能
- MCTS MVP用80次迭代
- 辩论Round1/2并行
- 总预测<3分钟
- Agent >500时降低连线密度

### G2: 全流程冒烟
1. / → landing
2. /lite → 输入 → 创建预测
3. 进度页 Stage 5 三引擎子阶段
4. 结果页 因果图+概率+引擎分解
5. 拖变量 → 概率变
6. 推理 → 5个Tab (因素/推理/辩论/MCTS/引擎对比)
7. Agent仿真 → 播放 → 点击Agent
8. 分享 → 分享页
9. /community → 公开预测
10. /leaderboard → 排行
11. /profile → 历史

### G3: 测试
- pytest >75%覆盖, 全通过
- vitest 全通过
- pnpm build 无错误
- 更新 docs/sessions/current.md + docs/contracts/

---

## 完成标准

```
[ ] 三引擎并行 (GoT+MCTS+Debate)
[ ] Ensemble集成 (40/25/20/15)
[ ] 引擎分解显示
[ ] 辩论3轮真实展示
[ ] MCTS路径展示
[ ] 引擎对比Tab
[ ] PixiJS Agent渲染 + 播放控制
[ ] Agent点击画像
[ ] 发现页/社区
[ ] 用户资料页
[ ] 分享页+OG
[ ] 排行榜
[ ] 导航更新
[ ] 全流程11步通过
[ ] <3分钟预测
[ ] pytest全通过>75%
[ ] vitest+build通过
[ ] docs更新
```

开始。D→E→F→G顺序。自主决策，完成后汇报。
