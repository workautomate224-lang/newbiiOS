# 🧪 FutureOS 全产品质量验收 — 超级测试 Prompt
# Phase 3 完成后，粘贴到 Claude Code 执行
# 所有 Checklist 必须 100% PASS 才能进入下一阶段

---

先阅读 docs/BLUEPRINT.md 和 docs/sessions/current.md 恢复上下文。

我们已经完成了:
- Phase 1: Lite MVP (Landing + Auth + 7阶段管线 + 因果图 + 变量滑块)
- Phase 2: 三引擎(GoT+MCTS+Debate) + Agent 2D(PixiJS) + 社区
- Phase 3: Studio(5工作台) + Exchange(预测市场) + 漂移系统

现在进行**全产品质量验收**。这不是简单跑pytest——这是用真实浏览器测试每一个页面、每一个按钮、每一条流程。

## 原则
- 使用 Playwright 做浏览器端到端(E2E)测试
- 后端用 pytest + httpx 做API集成测试
- 每个功能不只测happy path，也测error path
- 测试必须可重复运行 (幂等)
- 所有测试结果记录到 docs/sessions/test-report.md
- **任何测试失败 → 先修复 → 再继续**，不能跳过

---

# ═══════════════════════════════════════════
# PART 1: 测试基础设施搭建
# ═══════════════════════════════════════════

## 1.1 安装 Playwright
```bash
cd web
pnpm add -D @playwright/test
npx playwright install chromium
```

创建 `web/playwright.config.ts`:
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: 'pnpm dev',
    port: 3000,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
    { name: 'mobile', use: { viewport: { width: 375, height: 812 } } },
  ],
});
```

创建 `web/e2e/` 目录。

## 1.2 后端测试增强
确保 api/ 中安装:
```bash
cd api
poetry add --group dev httpx pytest-asyncio pytest-cov factory-boy
```

创建 `api/tests/conftest.py`:
- Supabase 测试客户端 (用 SERVICE_ROLE_KEY 跳过 RLS)
- 测试用户创建 fixture
- 测试 prediction 创建 fixture
- 清理 fixture (测试后删除测试数据)

## 1.3 测试数据 Seed
创建 `api/tests/seed.py`:
```python
"""
测试数据种子
创建一套完整的测试数据用于E2E测试
"""
# 测试用户: test@futureos.app / password123
# 测试预测: "2026马来西亚大选谁赢" (已完成, 有完整结果)
# 测试市场: 基于上述预测创建的Exchange市场
# 测试Studio项目: 有数据源+人口+情景+仿真+报告
```

---

# ═══════════════════════════════════════════
# PART 2: 后端 API 深度测试
# ═══════════════════════════════════════════

## 2.1 认证系统测试
创建 `api/tests/test_auth_deep.py`:

```
test_jwt_valid_token_returns_user()           → 有效JWT → 200 + user_id
test_jwt_expired_token_returns_401()           → 过期JWT → 401
test_jwt_malformed_token_returns_401()         → 乱码JWT → 401
test_jwt_missing_token_returns_401()           → 无header → 401
test_jwt_wrong_secret_returns_401()            → 错误secret签名 → 401
test_protected_endpoint_without_auth()         → 所有受保护路由无auth → 401
test_rls_user_can_only_see_own_data()          → 用户A不能看用户B的predictions
test_rls_public_predictions_visible_to_all()   → is_public=true的预测所有人可见
test_rls_service_role_bypasses()               → SERVICE_ROLE_KEY跳过RLS
```

## 2.2 预测管线深度测试
创建 `api/tests/test_pipeline_deep.py`:

```
# Stage 1: IntentParser
test_intent_parser_valid_query()               → "谁赢大选" → 正确解析
test_intent_parser_vague_query()               → "未来怎样" → 有fallback
test_intent_parser_english_query()             → 英文问题也能处理
test_intent_parser_timeout_fallback()          → LLM超时 → 规则引擎兜底

# Stage 2: DataCollection
test_data_collection_returns_structure()       → 返回{census, economic, sentiment}
test_data_collection_handles_missing()         → 部分数据缺失 → gap_fill补全

# Stage 3: PopSynthesizer
test_pop_synthesizer_correct_count()           → 生成正好100个Agent
test_pop_synthesizer_valid_demographics()      → Agent属性分布合理
test_pop_synthesizer_network_connected()       → 社交网络无孤立节点

# Stage 4: Simulation
test_simulation_runs_30_ticks()                → 30 Tick全部完成
test_simulation_stance_changes()               → 有Agent改变立场
test_simulation_deterministic_with_seed()      → 相同seed → 相同结果

# Stage 5: 三引擎
test_got_engine_returns_outcomes()             → GoT返回概率+因果图
test_mcts_engine_runs_iterations()             → MCTS完成80+迭代
test_mcts_engine_ucb1_correct()                → UCB1计算验证
test_mcts_engine_converges()                   → 概率收敛
test_debate_engine_3_rounds()                  → 3轮辩论完整
test_debate_engine_parallel_round1()           → Round1的4辩手并行(检查时间<单个×2)
test_debate_engine_judge_returns_json()        → Judge返回有效JSON
test_ensemble_weights_correct()                → GoT40+MCTS25+Debate25+Sim10=100
test_ensemble_normalization()                  → 概率和=1.0
test_ensemble_confidence_interval()            → CI合理(不超出[0,1])
test_ensemble_single_engine_fallback()         → 只有1个引擎成功也能出结果
test_ensemble_all_engines_fail_raises()        → 全失败 → RuntimeError

# Stage 6: Explanation
test_explanation_generates_text()              → 返回非空解释文本
test_explanation_has_shap_factors()            → 返回因素归因列表

# Stage 7: Storage
test_result_stored_in_supabase()               → prediction_results表有记录
test_prediction_status_updated()               → status → "completed"

# 全流程
test_full_pipeline_end_to_end()                → 从query到完成 <5分钟
test_full_pipeline_returns_all_fields()        → outcomes+causal_graph+reasoning+engines
test_rerun_only_reruns_stage_5_6()             → rerun不重跑Stage 1-4
test_rerun_returns_different_results()         → 变量修改后概率确实变了
```

## 2.3 Studio API 测试
创建 `api/tests/test_studio_deep.py`:

```
# 项目管理
test_create_project()                          → 201 + 返回project_id
test_list_projects_only_own()                  → 只返回自己的项目
test_delete_project_cascades()                 → 删除项目 → 子数据全删

# 数据工作台
test_upload_csv()                              → 上传CSV → 解析成功
test_upload_csv_invalid_format()               → 上传非CSV → 400错误
test_upload_csv_empty_file()                   → 空CSV → 合理错误
test_data_preview_returns_rows()               → 返回前50行
test_data_quality_score()                      → 质量评分在0-1之间
test_data_freshness_tracking()                 → freshness_status正确

# 人口工作台
test_create_population()                       → 201
test_generate_agents_count()                   → 请求1000个 → 返回1000个
test_generate_agents_demographics()            → 年龄/区域分布符合配置
test_edit_single_agent()                       → 修改Agent属性 → 保存成功
test_population_network()                      → 网络图有edges

# 情景工作台
test_create_scenario()                         → 201 + 空因果图
test_update_scenario_graph()                   → PATCH → 因果图更新
test_scenario_versioning()                     → 每次更新version+1
test_fork_scenario()                           → fork → 新情景+继承数据
test_scenario_diff()                           → 两情景diff → 正确显示差异

# 仿真控制台
test_start_simulation()                        → 201 + status=pending→running
test_simulation_completes()                    → status → completed
test_simulation_results_stored()               → results JSON非空
test_simulation_branch()                       → 从Tick N创建分支
test_simulation_branch_different_results()     → 分支结果与主线不同

# 报告工作台
test_create_report()                           → 201
test_update_report_content()                   → PATCH Tiptap JSON
test_export_pdf()                              → 返回PDF URL
test_export_pdf_downloadable()                 → URL可下载 → Content-Type=application/pdf
```

## 2.4 Exchange API 测试
创建 `api/tests/test_exchange_deep.py`:

```
# 市场
test_create_market()                           → 201
test_list_markets()                            → 返回列表
test_market_details_has_signals()              → 返回含三重信号

# 下注
test_place_bet_success()                       → 200 + 积分扣除
test_place_bet_insufficient_points()           → 余额不足 → 400
test_place_bet_market_closed()                 → 已关闭市场 → 400
test_place_bet_invalid_outcome()               → 不存在的outcome → 400

# 信号融合
test_ai_signal_from_prediction()               → AI信号来自prediction结果
test_crowd_signal_from_bets()                  → Crowd信号=下注分布
test_reputation_signal_weighted()              → 高信誉用户权重更高
test_signal_fusion_weights()                   → AI50+Crowd30+Rep20=100
test_signal_fusion_normalized()                → 融合后概率和=1

# 结算
test_resolve_market_correct_bet()              → 押对的获得收益
test_resolve_market_wrong_bet()                → 押错的失去积分
test_resolve_updates_reputation()              → 信誉分更新
test_resolve_updates_brier()                   → Brier Score记录

# 异常检测
test_anomaly_signal_divergence()               → AI和Crowd差>25% → 记录异常
```

## 2.5 漂移系统测试
创建 `api/tests/test_drift_deep.py`:

```
test_data_expiry_detection()                   → 过期数据源 → drift_event
test_data_expiry_stale_warning()               → 快过期 → stale状态
test_causal_decay_calculation()                → 30天后权重正确衰减
test_causal_decay_critical_threshold()         → 权重<0.1 → critical
test_calibration_drift_worsening()             → Brier趋势恶化 → warning
test_signal_divergence_detection()             → 大分歧 → anomaly_log
test_auto_adapt_data_expiry()                  → 过期 → 标记重跑
test_auto_adapt_causal_decay()                 → 衰减 → 权重更新
test_drift_scan_idempotent()                   → 重复扫描不重复记录
```

---

# ═══════════════════════════════════════════
# PART 3: Playwright 浏览器端到端测试
# ═══════════════════════════════════════════

确保后端在 localhost:8000 运行，前端在 localhost:3000 运行。

## 3.1 全局导航测试
创建 `web/e2e/navigation.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('全局导航', () => {
  test('Landing page 加载正常', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/FutureOS/);
    // Hero区域
    await expect(page.locator('text=未来')).toBeVisible();   // 或英文标题
    // CTA按钮存在
    await expect(page.getByRole('link', { name: /lite|开始|try/i })).toBeVisible();
    // 三产品卡片
    await expect(page.locator('[data-testid="product-cards"]')).toBeVisible();
  });

  test('导航栏所有链接可点击', async ({ page }) => {
    await page.goto('/');
    // 检查导航链接
    const navLinks = ['Lite', 'Studio', 'Exchange'];
    for (const link of navLinks) {
      const el = page.getByRole('link', { name: new RegExp(link, 'i') });
      await expect(el).toBeVisible();
    }
  });

  test('移动端显示汉堡菜单', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    // 移动端导航应该是折叠的或底部Tab
    // 验证页面不横向溢出
    const body = page.locator('body');
    const box = await body.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(375);
  });

  test('未登录访问受保护页面 → 重定向登录', async ({ page }) => {
    await page.goto('/studio');
    // 应该重定向到登录页
    await expect(page).toHaveURL(/auth|login/);
  });
});
```

## 3.2 认证流程测试
创建 `web/e2e/auth.spec.ts`:

```typescript
test.describe('认证', () => {
  test('登录页正常渲染', async ({ page }) => {
    await page.goto('/auth/login');
    // Email输入框
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    // 登录按钮
    await expect(page.getByRole('button', { name: /登录|login|sign in/i })).toBeVisible();
    // Google OAuth按钮 (如果有)
    // await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
  });

  test('空邮箱提交显示错误', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('button', { name: /登录|login|sign in/i }).click();
    // 应该显示验证错误
    await expect(page.locator('text=/required|必填|请输入/i')).toBeVisible();
  });

  test('无效邮箱格式显示错误', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByPlaceholder(/email/i).fill('not-an-email');
    await page.getByRole('button', { name: /登录|login|sign in/i }).click();
    await expect(page.locator('text=/invalid|无效|格式/i')).toBeVisible();
  });
});
```

## 3.3 Lite 完整流程测试
创建 `web/e2e/lite-flow.spec.ts`:

```typescript
test.describe('Lite 完整流程', () => {
  // 使用已经seed的测试数据

  test('首页正常加载', async ({ page }) => {
    await page.goto('/lite');
    // 搜索框
    await expect(page.getByPlaceholder(/预测|predict|问题/i)).toBeVisible();
    // 推荐问题chips
    await expect(page.locator('[data-testid="suggested-queries"]')).toBeVisible();
    // 热门预测
    await expect(page.locator('[data-testid="trending-predictions"]')).toBeVisible();
  });

  test('推荐问题可点击填充', async ({ page }) => {
    await page.goto('/lite');
    const chip = page.locator('[data-testid="suggested-queries"] button').first();
    const chipText = await chip.textContent();
    await chip.click();
    const input = page.getByPlaceholder(/预测|predict|问题/i);
    await expect(input).toHaveValue(chipText!.trim());
  });

  test('搜索框输入+提交', async ({ page }) => {
    await page.goto('/lite');
    await page.getByPlaceholder(/预测|predict|问题/i).fill('测试预测问题');
    await page.getByRole('button', { name: /提交|预测|submit/i }).click();
    // 应该导航到进度页或登录页
    await expect(page).not.toHaveURL('/lite');
  });

  test('热门预测卡片显示概率', async ({ page }) => {
    await page.goto('/lite');
    await page.waitForSelector('[data-testid="prediction-card"]', { timeout: 10000 });
    const card = page.locator('[data-testid="prediction-card"]').first();
    await expect(card).toBeVisible();
    // 卡片内应有概率显示
    await expect(card.locator('text=/%/')).toBeVisible();
  });

  test('结果页因果图渲染', async ({ page }) => {
    // 使用seed的已完成预测
    await page.goto('/lite/SEED_PREDICTION_ID/result');
    // D3 SVG应该存在
    await page.waitForSelector('svg', { timeout: 15000 });
    await expect(page.locator('svg')).toBeVisible();
    // 应该有节点(circle)
    await expect(page.locator('svg circle').first()).toBeVisible();
    // 应该有边(line或path)
    await expect(page.locator('svg line, svg path').first()).toBeVisible();
  });

  test('结果页概率仪表盘', async ({ page }) => {
    await page.goto('/lite/SEED_PREDICTION_ID/result');
    await page.waitForSelector('[data-testid="probability-dashboard"]', { timeout: 10000 });
    // 至少有2个outcome
    const outcomes = page.locator('[data-testid="outcome-card"]');
    expect(await outcomes.count()).toBeGreaterThanOrEqual(2);
    // 概率值存在
    await expect(page.locator('text=/%/').first()).toBeVisible();
  });

  test('结果页引擎分解显示', async ({ page }) => {
    await page.goto('/lite/SEED_PREDICTION_ID/result');
    await page.waitForTimeout(3000);
    // 引擎分解: GoT/MCTS/Debate
    await expect(page.locator('text=/GoT|MCTS|Debate/i').first()).toBeVisible();
  });

  test('变量滑块存在且可拖动', async ({ page }) => {
    await page.goto('/lite/SEED_PREDICTION_ID/result');
    await page.waitForSelector('[data-testid="variable-slider"]', { timeout: 10000 });
    const slider = page.locator('[data-testid="variable-slider"]').first();
    await expect(slider).toBeVisible();
    // 拖动滑块
    const box = await slider.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);
      // 等待rerun
      await page.waitForTimeout(5000);
      // 概率应该变化了 (至少不报错)
    }
  });

  test('因果图/Agent视图切换', async ({ page }) => {
    await page.goto('/lite/SEED_PREDICTION_ID/result');
    const toggleBtn = page.locator('text=/Agent|仿真/i');
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click();
      // PixiJS canvas应该出现
      await expect(page.locator('canvas')).toBeVisible();
    }
  });

  test('推理链页5个Tab', async ({ page }) => {
    await page.goto('/lite/SEED_PREDICTION_ID/reasoning');
    await page.waitForTimeout(3000);
    // 检查Tab: 关键因素 / 推理过程 / 辩论记录 / MCTS路径 / 引擎对比
    const expectedTabs = ['因素', '推理', '辩论', 'MCTS', '引擎'];
    for (const tab of expectedTabs) {
      const tabEl = page.locator(`text=/${tab}/i`);
      // 至少应该有3-4个Tab可见
    }
    // 点击辩论Tab
    await page.locator('text=/辩论/i').click();
    await page.waitForTimeout(2000);
    // 应该显示辩手角色
    await expect(page.locator('text=/乐观|悲观|逆向|历史|裁判|optimist|pessimist/i').first()).toBeVisible();
  });

  test('分享按钮工作', async ({ page }) => {
    await page.goto('/lite/SEED_PREDICTION_ID/result');
    const shareBtn = page.locator('text=/分享|share/i');
    if (await shareBtn.isVisible()) {
      await shareBtn.click();
      // 应该有toast或复制成功提示
      await page.waitForTimeout(1000);
    }
  });
});
```

## 3.4 Studio 完整流程测试
创建 `web/e2e/studio-flow.spec.ts`:

```typescript
test.describe('Studio 完整流程', () => {
  // 需要先登录
  test.beforeEach(async ({ page }) => {
    // 使用seed的测试用户cookie/token
    // 或者通过API获取JWT设置到localStorage
  });

  test('Studio 项目列表页', async ({ page }) => {
    await page.goto('/studio');
    await expect(page.locator('text=/项目|project/i')).toBeVisible();
    // 新建项目按钮
    await expect(page.getByRole('button', { name: /新建|create|new/i })).toBeVisible();
  });

  test('创建新项目', async ({ page }) => {
    await page.goto('/studio');
    await page.getByRole('button', { name: /新建|create|new/i }).click();
    // 填写项目名
    await page.getByPlaceholder(/项目名|name/i).fill('测试项目');
    await page.getByRole('button', { name: /创建|create|confirm/i }).click();
    // 应该跳转到项目页
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/studio\/.+/);
  });

  test('数据工作台 - CSV上传', async ({ page }) => {
    await page.goto('/studio/SEED_PROJECT_ID/data');
    await expect(page.locator('text=/数据|data/i')).toBeVisible();
    // 上传按钮
    await expect(page.getByRole('button', { name: /添加|上传|upload|add/i })).toBeVisible();
    // 数据源列表(可能为空或有seed数据)
  });

  test('数据工作台 - 数据预览', async ({ page }) => {
    await page.goto('/studio/SEED_PROJECT_ID/data');
    // 如果有seed数据源，点击预览
    const source = page.locator('[data-testid="data-source-card"]').first();
    if (await source.isVisible()) {
      await source.click();
      // 预览表格
      await expect(page.locator('table')).toBeVisible();
    }
  });

  test('数据工作台 - 新鲜度显示', async ({ page }) => {
    await page.goto('/studio/SEED_PROJECT_ID/data');
    // 新鲜度灯: 🟢/🟡/🔴
    await page.waitForTimeout(2000);
    // 验证新鲜度指示器存在
  });

  test('人口工作台 - 渲染正常', async ({ page }) => {
    await page.goto('/studio/SEED_PROJECT_ID/population');
    await expect(page.locator('text=/人口|population/i')).toBeVisible();
    // Agent数量滑块
    await expect(page.locator('[data-testid="agent-count-slider"], input[type="range"]').first()).toBeVisible();
  });

  test('人口工作台 - Agent表格', async ({ page }) => {
    await page.goto('/studio/SEED_PROJECT_ID/population');
    await page.waitForTimeout(3000);
    // 如果已生成Agent，应该有表格
    const table = page.locator('[data-testid="agent-table"], table').first();
    if (await table.isVisible()) {
      // 表格有行
      const rows = table.locator('tr, [data-testid="agent-row"]');
      expect(await rows.count()).toBeGreaterThan(0);
    }
  });

  test('情景工作台 - React Flow编辑器', async ({ page }) => {
    await page.goto('/studio/SEED_PROJECT_ID/scenario');
    await page.waitForTimeout(3000);
    // React Flow容器
    await expect(page.locator('.react-flow, [data-testid="causal-graph-editor"]')).toBeVisible();
    // 工具栏按钮
    await expect(page.getByRole('button', { name: /添加|add|node/i }).first()).toBeVisible();
  });

  test('情景工作台 - 添加节点', async ({ page }) => {
    await page.goto('/studio/SEED_PROJECT_ID/scenario');
    await page.waitForTimeout(3000);
    // 点击添加节点
    await page.getByRole('button', { name: /添加|add|node/i }).first().click();
    await page.waitForTimeout(1000);
    // 应该出现新节点或编辑Dialog
  });

  test('仿真控制台 - 渲染正常', async ({ page }) => {
    await page.goto('/studio/SEED_PROJECT_ID/simulation');
    await expect(page.locator('text=/仿真|simulation/i')).toBeVisible();
    // 启动按钮
    await expect(page.getByRole('button', { name: /启动|start|run/i })).toBeVisible();
  });

  test('仿真控制台 - 实时仪表盘', async ({ page }) => {
    await page.goto('/studio/SEED_PROJECT_ID/simulation');
    // 如果有已完成的仿真，应该有图表
    await page.waitForTimeout(3000);
    // Recharts SVG
    const chart = page.locator('.recharts-wrapper, [data-testid="probability-curve"]').first();
    // 图表可能不存在如果还没运行仿真，这是正常的
  });

  test('报告工作台 - Tiptap编辑器', async ({ page }) => {
    await page.goto('/studio/SEED_PROJECT_ID/report');
    await expect(page.locator('text=/报告|report/i')).toBeVisible();
    // Tiptap编辑区域
    const editor = page.locator('.tiptap, .ProseMirror, [data-testid="report-editor"]').first();
    // 导出按钮
    await expect(page.getByRole('button', { name: /导出|export|PDF/i }).first()).toBeVisible();
  });

  test('Studio 5个工作台Tab切换', async ({ page }) => {
    await page.goto('/studio/SEED_PROJECT_ID/data');
    // 依次点击每个Tab
    const tabs = ['数据', '人口', '情景', '仿真', '报告'];
    // 或英文: data, population, scenario, simulation, report
    for (const tab of tabs) {
      const tabEl = page.locator(`text=/${tab}/i`).first();
      if (await tabEl.isVisible()) {
        await tabEl.click();
        await page.waitForTimeout(1000);
        // 页面不崩溃
        await expect(page.locator('body')).toBeVisible();
      }
    }
  });
});
```

## 3.5 Exchange 测试
创建 `web/e2e/exchange-flow.spec.ts`:

```typescript
test.describe('Exchange 预测市场', () => {
  test('市场大厅加载', async ({ page }) => {
    await page.goto('/exchange');
    await expect(page.locator('text=/市场|market|exchange/i')).toBeVisible();
    // 市场卡片列表
    await page.waitForTimeout(3000);
  });

  test('市场详情页 - 三重信号', async ({ page }) => {
    await page.goto('/exchange/SEED_MARKET_ID');
    await page.waitForTimeout(5000);
    // 三重信号显示
    await expect(page.locator('text=/AI|人工智能/i').first()).toBeVisible();
    await expect(page.locator('text=/群体|crowd/i').first()).toBeVisible();
    // 概率显示
    await expect(page.locator('text=/%/').first()).toBeVisible();
  });

  test('下注面板存在', async ({ page }) => {
    await page.goto('/exchange/SEED_MARKET_ID');
    await page.waitForTimeout(3000);
    // 下注按钮
    await expect(page.getByRole('button', { name: /下注|bet|trade/i }).first()).toBeVisible();
    // 积分显示
  });

  test('投资组合页', async ({ page }) => {
    await page.goto('/exchange/portfolio');
    await page.waitForTimeout(2000);
    // 积分余额
    await expect(page.locator('text=/积分|points|balance/i').first()).toBeVisible();
  });
});
```

## 3.6 社区功能测试
创建 `web/e2e/community-flow.spec.ts`:

```typescript
test.describe('社区功能', () => {
  test('发现页/社区页', async ({ page }) => {
    // 尝试多个可能的路由
    for (const path of ['/community', '/lite/explore']) {
      await page.goto(path);
      if (page.url().includes(path)) break;
    }
    await page.waitForTimeout(3000);
    // 预测列表
    await expect(page.locator('[data-testid="prediction-card"], .prediction-card').first()).toBeVisible({ timeout: 10000 }).catch(() => {
      // 如果没有公开预测，至少页面不崩溃
    });
  });

  test('排行榜', async ({ page }) => {
    await page.goto('/leaderboard');
    await page.waitForTimeout(3000);
    // 排行表格或列表
    await expect(page.locator('text=/排行|leaderboard|rank/i')).toBeVisible();
  });

  test('个人主页', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForTimeout(3000);
    // 用户信息
    await expect(page.locator('text=/预测|prediction|历史|history/i').first()).toBeVisible();
  });
});
```

## 3.7 漂移系统测试
创建 `web/e2e/drift-flow.spec.ts`:

```typescript
test.describe('漂移系统', () => {
  test('漂移仪表盘', async ({ page }) => {
    await page.goto('/admin/drift');
    await page.waitForTimeout(3000);
    // 漂移事件列表或空状态
    await expect(page.locator('text=/漂移|drift|监控|monitor/i').first()).toBeVisible();
  });
});
```

## 3.8 响应式测试
创建 `web/e2e/responsive.spec.ts`:

```typescript
const pages = [
  { name: 'Landing', url: '/' },
  { name: 'Lite', url: '/lite' },
  { name: 'Studio', url: '/studio' },
  { name: 'Exchange', url: '/exchange' },
  { name: 'Leaderboard', url: '/leaderboard' },
];

test.describe('移动端响应式', () => {
  for (const p of pages) {
    test(`${p.name} 移动端不横向溢出`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(p.url);
      await page.waitForTimeout(2000);
      // 检查无横向滚动条
      const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(hasHScroll).toBe(false);
    });

    test(`${p.name} 页面无JS报错`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));
      await page.goto(p.url);
      await page.waitForTimeout(3000);
      expect(errors).toEqual([]);
    });
  }
});
```

## 3.9 性能测试
创建 `web/e2e/performance.spec.ts`:

```typescript
test.describe('性能', () => {
  test('Landing page < 3秒加载', async ({ page }) => {
    const start = Date.now();
    await page.goto('/', { waitUntil: 'networkidle' });
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(3000);
  });

  test('Lite首页 < 3秒加载', async ({ page }) => {
    const start = Date.now();
    await page.goto('/lite', { waitUntil: 'networkidle' });
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(3000);
  });

  test('结果页 < 5秒加载', async ({ page }) => {
    const start = Date.now();
    await page.goto('/lite/SEED_PREDICTION_ID/result', { waitUntil: 'networkidle' });
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(5000);
  });
});
```

---

# ═══════════════════════════════════════════
# PART 4: 修复所有失败
# ═══════════════════════════════════════════

运行所有测试:

```bash
# 后端
cd api && pytest -v --cov=app --cov-report=html --tb=short 2>&1 | tee test-backend.log

# 前端单元测试
cd web && pnpm test 2>&1 | tee test-frontend.log

# E2E测试
cd web && npx playwright test --reporter=html 2>&1 | tee test-e2e.log
```

**对于每个失败的测试:**
1. 分析失败原因 (是测试写错还是代码bug)
2. 如果是代码bug → 修复代码
3. 如果是测试与实现不匹配(比如data-testid不一致) → 修复测试或添加data-testid
4. 重新运行确认修复
5. 记录到 docs/sessions/test-report.md

**修复优先级:**
1. 🔴 后端API返回错误 (500/400) → 最高优先
2. 🔴 页面完全崩溃 (JS Error) → 最高优先
3. 🟡 功能不工作 (按钮无响应, 数据不显示) → 高优先
4. 🟡 数据格式不对 (概率显示NaN等) → 高优先
5. 🟢 UI问题 (布局错位, 文字截断) → 中优先
6. 🟢 性能问题 (加载慢) → 可记录待优化

---

# ═══════════════════════════════════════════
# PART 5: 最终验收 CHECKLIST
# ═══════════════════════════════════════════

在所有测试通过后，逐项检查以下 checklist。
创建 `docs/sessions/test-report.md` 记录每一项结果。

## 🏠 Landing Page (/)
```
[ ] 页面渲染无错误
[ ] Hero标题正确显示
[ ] CTA按钮存在且可点击 → 跳转/lite
[ ] 三产品线卡片(Lite/Studio/Exchange)显示
[ ] Footer存在
[ ] 移动端响应式正常(375px无溢出)
[ ] 无JS console错误
[ ] 加载时间<3秒
```

## 🔐 认证系统
```
[ ] /auth/login 页面渲染
[ ] Email输入框存在
[ ] 登录按钮存在
[ ] 空提交有验证提示
[ ] 无效Email有错误提示
[ ] Magic Link发送成功 (如果配置了真实Supabase)
[ ] Google OAuth按钮存在 (如果配置)
[ ] 登录后跳转到之前页面
[ ] 登出功能正常
[ ] 未登录访问/studio → 重定向登录
[ ] JWT过期 → 401
[ ] RLS: 用户只能看自己数据
```

## 🔮 Lite 首页 (/lite)
```
[ ] 搜索框渲染+可输入
[ ] 推荐问题chips显示 (3-5个)
[ ] 点击chip → 填充搜索框
[ ] 热门预测卡片显示
[ ] 卡片有概率显示
[ ] 提交搜索 → 创建预测(或提示登录)
[ ] 移动端正常
[ ] 加载<3秒
```

## ⏳ 进度页 (/lite/[id]/progress)
```
[ ] 用户问题显示
[ ] 7个阶段列表显示
[ ] 阶段状态(done/running/pending)正确
[ ] Stage 5 显示三引擎子阶段
[ ] 进度实时更新(polling或Realtime)
[ ] 完成后自动跳转结果页
[ ] 取消按钮存在
[ ] 错误状态正确显示
```

## 🕸️ 结果页 (/lite/[id]/result) — 核心
```
[ ] 因果图(D3)正确渲染
[ ] 节点(圆形)可见
[ ] 边(线/箭头)可见
[ ] 节点大小反映概率
[ ] 节点颜色反映置信度
[ ] 可拖拽节点
[ ] 可缩放(滚轮)
[ ] 可平移(拖拽背景)
[ ] Hover节点有tooltip
[ ] 概率仪表盘显示 (≥2个outcome)
[ ] 每个outcome有概率值
[ ] 每个outcome有置信区间
[ ] 引擎分解显示 (GoT/MCTS/Debate)
[ ] 变量滑块存在 (≥1个)
[ ] 拖动滑块 → 触发rerun
[ ] rerun后概率变化 (<5秒)
[ ] 因果图动画过渡
[ ] Agent仿真视图切换按钮
[ ] 切换到Agent视图 → Canvas渲染
[ ] Agent播放/暂停按钮
[ ] Agent速度控制
[ ] 点击Agent → 画像弹窗
[ ] 分享按钮
[ ] "查看推理"链接
[ ] 移动端基本可用
```

## 🧠 推理页 (/lite/[id]/reasoning)
```
[ ] Tab 1: 关键因素 (因素归因条形图)
[ ] 条形图有数据 (≥3个因素)
[ ] Tab 2: 推理过程 (GoT树/维度)
[ ] 推理树可展开/折叠
[ ] Tab 3: 辩论记录
[ ] 3轮辩论时间线
[ ] 辩手角色+颜色区分
[ ] Round 3 Judge裁决突出
[ ] Tab 4: MCTS搜索路径
[ ] Top paths列表
[ ] 统计(节点/迭代/深度)
[ ] Tab 5: 引擎对比
[ ] GroupedBarChart显示
[ ] 权重说明
```

## 🎯 三引擎系统
```
[ ] GoT: 返回概率+因果图+推理树
[ ] MCTS: 完成80+迭代
[ ] MCTS: UCB1选择正确
[ ] MCTS: top_paths有数据
[ ] Debate: 3轮完成
[ ] Debate: Round1 4辩手并行
[ ] Debate: Judge返回结构化概率
[ ] Ensemble: 权重=GoT40+MCTS25+Debate25+Sim10
[ ] Ensemble: 概率和=1.0
[ ] Ensemble: 置信区间∈[0,1]
[ ] Pipeline: 三引擎asyncio.gather并行
[ ] Pipeline: 单引擎失败不影响整体
[ ] Rerun: 只重跑Stage 5-6
[ ] 全流程<5分钟
```

## 👥 Agent 2D (PixiJS)
```
[ ] Canvas渲染
[ ] Agent圆点显示 (100个)
[ ] Agent颜色=立场
[ ] 社交网络连线可见
[ ] 播放按钮
[ ] 暂停按钮
[ ] 速度控制 (1x/2x/5x/10x)
[ ] 进度条可拖动
[ ] 点击Agent → 画像Dialog
[ ] 画像: 年龄/区域/族群/立场
[ ] 立场历史显示
```

## 🏢 Studio — 项目管理
```
[ ] /studio 项目列表页
[ ] 新建项目Dialog
[ ] 项目名输入+创建
[ ] 项目列表只显示自己的
[ ] 删除项目可用
[ ] 5个工作台Tab切换
```

## 📊 Studio — 数据工作台
```
[ ] 数据源列表
[ ] CSV上传功能
[ ] 上传后自动解析列名
[ ] 数据预览(表格)
[ ] 质量评分显示
[ ] 新鲜度指示(🟢🟡🔴)
[ ] 删除数据源
```

## 👨‍👩‍👧‍👦 Studio — 人口工作台
```
[ ] Agent数量配置
[ ] 人口分布参数设置
[ ] "生成"按钮
[ ] 生成后Agent列表显示
[ ] 人口金字塔图(Recharts)
[ ] 社交网络图(D3)
[ ] 单个Agent编辑
```

## 🔗 Studio — 情景工作台
```
[ ] React Flow编辑器渲染
[ ] 可添加节点
[ ] 可连线(创建边)
[ ] 双击节点可编辑
[ ] 双击边可编辑权重
[ ] 保存功能
[ ] 情景列表/切换
[ ] 变量面板
```

## 🎮 Studio — 仿真控制台
```
[ ] 选择人口+情景
[ ] 配置Tick数
[ ] 启动仿真
[ ] 实时仪表盘更新
[ ] 概率曲线图(Recharts)
[ ] 分支按钮
[ ] 仿真完成有结果
```

## 📄 Studio — 报告工作台
```
[ ] Tiptap编辑器渲染
[ ] 可输入文字
[ ] AI生成按钮
[ ] PDF导出按钮
[ ] PDF可下载
[ ] 报告列表
```

## 💹 Exchange — 市场大厅
```
[ ] /exchange 页面渲染
[ ] 市场卡片列表
[ ] 卡片有标题+概率
[ ] 筛选功能
[ ] 排序功能
```

## 💹 Exchange — 市场详情
```
[ ] 三重信号显示 (AI/Crowd/Reputation)
[ ] 融合概率显示
[ ] 价格历史曲线
[ ] 下注面板
[ ] 选择outcome
[ ] 输入积分数
[ ] 下注按钮
[ ] 持仓显示
```

## 💹 Exchange — 信誉系统
```
[ ] 新用户有初始积分
[ ] 下注扣除积分
[ ] 积分余额正确
[ ] 投资组合页
```

## 🌊 漂移系统
```
[ ] 漂移仪表盘页面
[ ] 漂移事件列表
[ ] 数据过期检测
[ ] 因果边衰减显示
[ ] 异常检测记录
```

## 🌐 社区功能
```
[ ] 发现页/社区页
[ ] 公开预测列表
[ ] 分享功能(复制链接)
[ ] 分享页公开可访问
[ ] OG Meta tags
[ ] 排行榜页
[ ] 按信誉排序
[ ] 个人主页
[ ] 预测历史
```

## 🧪 测试覆盖
```
[ ] 后端 pytest 全通过
[ ] 后端覆盖率 >70%
[ ] 前端 vitest 全通过
[ ] E2E Playwright 全通过
[ ] pnpm build 无错误
[ ] 无TypeScript错误
[ ] 所有页面无JS console错误
```

## 📱 响应式
```
[ ] Landing 375px正常
[ ] Lite 375px正常
[ ] Studio 375px基本可用(可以有简化)
[ ] Exchange 375px正常
[ ] Community 375px正常
[ ] 所有页面无横向溢出
```

---

# ═══════════════════════════════════════════
# PART 6: 报告生成
# ═══════════════════════════════════════════

所有测试完成后，生成最终报告:

创建 `docs/sessions/test-report.md`:

```markdown
# FutureOS 全产品质量验收报告
日期: [今天]

## 测试概览
- 后端单元/集成测试: X/Y passed (覆盖率 Z%)
- 前端单元测试: X/Y passed
- E2E浏览器测试: X/Y passed
- Checklist: X/Y items passed

## 各模块状态
| 模块 | 测试数 | 通过 | 失败 | 状态 |
|------|--------|------|------|------|
| Auth | | | | ✅/❌ |
| Lite | | | | ✅/❌ |
| 三引擎 | | | | ✅/❌ |
| Agent 2D | | | | ✅/❌ |
| Studio数据 | | | | ✅/❌ |
| Studio人口 | | | | ✅/❌ |
| Studio情景 | | | | ✅/❌ |
| Studio仿真 | | | | ✅/❌ |
| Studio报告 | | | | ✅/❌ |
| Exchange市场 | | | | ✅/❌ |
| Exchange下注 | | | | ✅/❌ |
| 漂移系统 | | | | ✅/❌ |
| 社区 | | | | ✅/❌ |
| 响应式 | | | | ✅/❌ |

## 未解决问题
[列出所有还没修复的问题]

## 修复记录
[列出修复了什么bug]
```

然后把 test-report.md 的内容汇报给我。

开始。按 PART 1→2→3→4→5→6 顺序执行。
对于失败的测试，先修复再继续。不要跳过任何失败。
最终 Checklist 必须全绿才算完成。
