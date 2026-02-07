# 🏁 FutureOS Phase 6: 最终验收 + 上线
# Phase 5 完成后粘贴到 Claude Code 执行
# 这是上线前的最后一道关卡

---

先阅读 docs/sessions/current.md 和 docs/sessions/test-report.md 恢复上下文。

Phase 5 改动了底层关键系统：真实数据源、Redis缓存、安全中间件、数据库索引、
LLM超时/重试、Sentry监控。这些改动可能引入回归。

本阶段目标：
1. 确认 Phase 5 没有破坏任何已有功能（回归测试）
2. 验证新增的生产化功能（缓存/安全/监控）实际工作
3. 真实环境端到端全流程（不是Mock，用真实LLM+真实数据API）
4. 生成最终验收报告
5. 准备上线清单

原则：
- 测试失败 → 先修复 → 再继续。不跳过
- 每修一个bug记录到报告中
- 最终报告交给我决定是否上线

---

# ═══════════════════════════════════════════
# PART 1: 回归测试 — 确认什么都没破
# ═══════════════════════════════════════════

## 1.1 运行全部已有测试

```bash
# 后端: 187+ 测试必须全绿
cd api && pytest -v --cov=app --cov-report=term-missing --tb=short 2>&1 | tee /tmp/backend-regression.log
echo "EXIT CODE: $?"

# 前端单元: 7+ 测试必须全绿
cd web && pnpm test -- --run 2>&1 | tee /tmp/frontend-regression.log
echo "EXIT CODE: $?"

# E2E: 78+ 测试
cd web && npx playwright test --reporter=list 2>&1 | tee /tmp/e2e-regression.log
echo "EXIT CODE: $?"

# Build: 0 errors
cd web && pnpm build 2>&1 | tee /tmp/build-regression.log
echo "EXIT CODE: $?"
```

**判定标准：**
- 后端: 187+ tests, 0 failed, coverage ≥80%
- 前端: 7+ tests, 0 failed
- E2E: 78+ tests, 0 failed
- Build: 0 errors, 0 TypeScript errors

如果任何测试失败：
1. 分析是Phase 5改动导致的回归，还是测试本身需要更新
2. 如果是回归 → 修复代码
3. 如果是测试过时(比如Mock数据结构变了) → 更新测试
4. 重跑直到全绿

---

# ═══════════════════════════════════════════
# PART 2: Phase 5 新功能专项验证
# ═══════════════════════════════════════════

## 2.1 真实数据源测试
创建 `api/tests/test_production_data.py`:

```python
"""
验证真实数据源接入
注意：这些测试会调用真实外部API，需要网络
标记为 @pytest.mark.integration 可以单独运行
"""
import pytest

@pytest.mark.integration
class TestWorldBankAPI:
    async def test_gdp_malaysia_returns_data(self):
        """世界银行GDP API返回马来西亚数据"""
        from app.services.data_providers.worldbank import get_gdp
        data = await get_gdp("MYS")
        assert len(data) > 0
        assert data[0]["country"] == "Malaysia"
        assert data[0]["value"] is not None
        assert data[0]["value"] > 0  # GDP应该是正数

    async def test_population_malaysia(self):
        """人口数据"""
        from app.services.data_providers.worldbank import get_population
        data = await get_population("MYS")
        assert len(data) > 0
        # 马来西亚人口应该在3000万-4000万之间
        latest = data[0]["value"]
        assert 25_000_000 < latest < 45_000_000

    async def test_unemployment_returns_percentage(self):
        """失业率是百分比"""
        from app.services.data_providers.worldbank import get_unemployment
        data = await get_unemployment("MYS")
        if data:  # 可能最新年份还没数据
            assert 0 < data[0]["value"] < 30  # 失业率0-30%

    async def test_inflation_returns_data(self):
        """通胀率"""
        from app.services.data_providers.worldbank import get_inflation
        data = await get_inflation("MYS")
        if data:
            assert -10 < data[0]["value"] < 30  # 通胀率合理范围

    async def test_api_timeout_handled(self):
        """API超时不崩溃"""
        from app.services.data_providers.worldbank import get_gdp
        # 用一个不存在的国家代码
        data = await get_gdp("ZZZZZ")
        # 应该返回空而不是崩溃
        assert isinstance(data, (list, dict))

@pytest.mark.integration
class TestNewsAPI:
    async def test_news_sentiment_with_fallback(self):
        """新闻情感分析（有或无API Key都应该工作）"""
        from app.services.data_providers.news import get_news_sentiment
        result = await get_news_sentiment("Malaysia election 2026")
        assert "sentiment" in result
        assert "source" in result
        # 无论用真API还是LLM fallback，都应该有结果

    async def test_sentiment_score_range(self):
        """情感分数在[-1, 1]范围"""
        from app.services.data_providers.news import get_news_sentiment
        result = await get_news_sentiment("economy growth")
        score = result.get("sentiment", {}).get("overall_sentiment", 0)
        assert -1.0 <= score <= 1.0

@pytest.mark.integration
class TestMalaysiaData:
    def test_demographics_structure(self):
        """马来西亚人口数据结构正确"""
        from app.services.data_providers.malaysia import get_demographics
        data = get_demographics()
        assert data["total_population"] > 30_000_000
        assert abs(sum(data["ethnic_distribution"].values()) - 1.0) < 0.01
        assert len(data["states"]) >= 13

    def test_election_history(self):
        """选举历史数据正确"""
        from app.services.data_providers.malaysia import get_election_history
        data = get_election_history()
        assert "ge15" in data
        assert data["ge15"]["total_seats"] == 222
        assert data["ge15"]["coalitions"]["PH"]["seats"] == 82

    def test_ge15_seats_sum_to_222(self):
        """GE15所有联盟席位总和=222"""
        from app.services.data_providers.malaysia import get_election_history
        ge15 = get_election_history()["ge15"]
        total = sum(c["seats"] for c in ge15["coalitions"].values())
        assert total == 222
```

运行: `cd api && pytest tests/test_production_data.py -v -m integration`

## 2.2 Redis缓存测试
创建 `api/tests/test_cache.py`:

```python
"""验证Redis缓存层"""
import pytest

class TestCache:
    async def test_cache_set_and_get(self):
        """基本存取"""
        from app.core.cache import cache_set, cache_get
        await cache_set("test_key", {"foo": "bar"}, ttl=60)
        result = await cache_get("test_key")
        assert result == {"foo": "bar"}

    async def test_cache_miss_returns_none(self):
        """不存在的key返回None"""
        from app.core.cache import cache_get
        result = await cache_get("nonexistent_key_xyz")
        assert result is None

    async def test_cache_delete(self):
        """删除缓存"""
        from app.core.cache import cache_set, cache_get, cache_delete
        await cache_set("delete_me", "value", ttl=60)
        await cache_delete("delete_me")
        assert await cache_get("delete_me") is None

    async def test_worldbank_data_cached(self):
        """世界银行数据第二次调用走缓存（更快）"""
        import time
        from app.services.data_providers.worldbank import get_gdp
        
        # 第一次调用
        start = time.time()
        data1 = await get_gdp("MYS")
        first_call = time.time() - start
        
        # 第二次调用应该走缓存（如果实现了缓存）
        start = time.time()
        data2 = await get_gdp("MYS")
        second_call = time.time() - start
        
        # 数据应该一样
        assert data1 == data2
        # 注意：如果Redis没连接，两次都走API也没关系
```

## 2.3 安全中间件测试
创建 `api/tests/test_security.py`:

```python
"""验证安全措施"""
import pytest
from httpx import AsyncClient

class TestSecurity:
    async def test_rate_limit_allows_normal_requests(self, client: AsyncClient):
        """正常请求不被限流"""
        for _ in range(10):
            resp = await client.get("/api/v1/health")
            assert resp.status_code == 200

    async def test_rate_limit_blocks_excessive_requests(self, client: AsyncClient):
        """大量请求被限流（如果Rate Limit已实现）"""
        responses = []
        for _ in range(100):
            resp = await client.get("/api/v1/health")
            responses.append(resp.status_code)
        # 应该有一些429（如果限制是60/min）
        # 注意：如果Rate Limit没实现或阈值很高，这个测试可能全是200
        # 这种情况下标记为skip而不是fail

    async def test_cors_header_present(self, client: AsyncClient):
        """CORS header存在"""
        resp = await client.options("/api/v1/health", headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET"
        })
        # 应该有CORS相关header
        assert resp.status_code in [200, 204]

    async def test_input_sanitization(self, client: AsyncClient):
        """输入清理：超长输入被截断"""
        long_query = "a" * 5000
        resp = await client.post("/api/v1/predictions/create",
            json={"query": long_query},
            headers={"Authorization": "Bearer test_token"}
        )
        # 应该返回422(验证失败)或200(截断后处理)，不应该500
        assert resp.status_code != 500

    def test_env_not_in_git(self):
        """确保.env不在git中"""
        import subprocess
        result = subprocess.run(
            ["git", "ls-files", ".env", "api/.env", "web/.env"],
            capture_output=True, text=True, cwd="/path/to/repo"
        )
        assert result.stdout.strip() == "", ".env files should not be tracked by git"
```

## 2.4 监控测试
创建 `api/tests/test_monitoring.py`:

```python
"""验证监控系统"""

class TestHealthCheck:
    async def test_health_returns_service_status(self, client):
        """健康检查包含服务状态"""
        resp = await client.get("/api/v1/health")
        data = resp.json()
        assert data["status"] in ["healthy", "degraded"]
        # 如果增强了health endpoint
        if "services" in data:
            assert "database" in data["services"]

class TestCostTracking:
    async def test_llm_cost_logged(self):
        """LLM调用有成本记录"""
        from app.core.llm import _cost_log, call_llm
        initial_count = len(_cost_log)
        await call_llm("test_task", [{"role": "user", "content": "test"}])
        # 如果成本追踪已实现
        if len(_cost_log) > initial_count:
            entry = _cost_log[-1]
            assert "task" in entry
            assert "model" in entry
            assert "elapsed" in entry
```

## 2.5 LLM弹性测试
创建 `api/tests/test_llm_resilience.py`:

```python
"""验证LLM调用的超时/重试/降级"""
import pytest
from unittest.mock import patch, AsyncMock

class TestLLMResilience:
    async def test_timeout_triggers_fallback(self):
        """LLM超时→降级到更快模型"""
        import asyncio
        from app.core.llm import call_llm
        
        # Mock主模型超时
        with patch('app.core.llm._do_call', side_effect=asyncio.TimeoutError):
            # 应该不崩溃（要么降级成功要么优雅报错）
            try:
                result = await call_llm("test", [{"role": "user", "content": "test"}])
                # 如果有降级，应该返回结果
            except Exception as e:
                # 如果没有降级，至少应该是合理的错误
                assert "timeout" in str(e).lower() or "error" in str(e).lower()

    async def test_retry_on_transient_error(self):
        """临时错误自动重试"""
        call_count = 0
        
        async def flaky_call(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise ConnectionError("Temporary failure")
            return "success"
        
        with patch('app.core.llm._do_call', side_effect=flaky_call):
            try:
                result = await call_llm("test", [{"role": "user", "content": "test"}])
                # 如果重试实现了，应该成功
                if result:
                    assert call_count >= 2  # 至少重试了一次
            except ConnectionError:
                pass  # 如果没实现重试，至少不应该是500

    async def test_cost_tracking_records_usage(self):
        """每次LLM调用都记录成本"""
        from app.core.llm import _cost_log
        initial = len(_cost_log)
        
        from app.core.llm import call_llm
        try:
            await call_llm("test", [{"role": "user", "content": "hello"}])
        except:
            pass
        
        # 如果成本追踪已实现
        if hasattr(_cost_log, '__len__') and len(_cost_log) > initial:
            latest = _cost_log[-1]
            assert "tokens_in" in latest or "model" in latest
```

---

# ═══════════════════════════════════════════
# PART 3: 真实环境端到端 — 最重要的测试
# ═══════════════════════════════════════════

这是真正的大考。不用Mock，用真实的LLM和真实数据API跑完整流程。

## 3.1 Lite 全流程真实测试
创建 `api/tests/test_e2e_real.py`:

```python
"""
真实端到端测试
⚠️ 会调用真实OpenRouter API，产生费用
⚠️ 会调用真实世界银行API
标记为 @pytest.mark.real_e2e
"""
import pytest
import asyncio
import time

@pytest.mark.real_e2e
class TestRealPredictionFlow:
    
    async def test_full_prediction_malaysia_election(self):
        """
        最核心的测试：完整预测流程
        输入: "2026马来西亚大选谁赢"
        验证: 7个Stage全部完成，返回合理结果
        """
        from app.services.prediction_pipeline import run_full_pipeline
        
        start = time.time()
        
        context = {
            "query": "2026马来西亚大选谁赢",
            "region": "MY",
            "outcomes": [
                {"name": "PH (Pakatan Harapan)"},
                {"name": "PN (Perikatan Nasional)"},
                {"name": "BN (Barisan Nasional)"}
            ]
        }
        
        result = await run_full_pipeline(context)
        elapsed = time.time() - start
        
        # === 基本结构验证 ===
        assert result is not None
        assert "outcomes" in result
        assert len(result["outcomes"]) >= 2
        
        # === 概率验证 ===
        total_prob = sum(o["probability"] for o in result["outcomes"])
        assert 0.95 <= total_prob <= 1.05, f"概率总和应≈1.0, 实际={total_prob}"
        
        for o in result["outcomes"]:
            assert 0 <= o["probability"] <= 1, f"{o['name']} 概率超出范围: {o['probability']}"
            assert o["name"], "outcome名称不能为空"
        
        # === 置信区间验证 ===
        for o in result["outcomes"]:
            if "confidence_interval" in o:
                ci = o["confidence_interval"]
                assert ci[0] <= o["probability"] <= ci[1], f"概率不在置信区间内"
                assert 0 <= ci[0] and ci[1] <= 1
        
        # === 引擎分解验证 ===
        if "engine_breakdown" in result["outcomes"][0]:
            for o in result["outcomes"]:
                eb = o["engine_breakdown"]
                # 至少有GoT
                assert "got" in eb or len(eb) > 0
        
        # === 因果图验证 ===
        if "causal_graph" in result:
            graph = result["causal_graph"]
            assert "nodes" in graph
            assert "edges" in graph
            assert len(graph["nodes"]) >= 3, "因果图至少应该有3个节点"
            assert len(graph["edges"]) >= 2, "因果图至少应该有2条边"
        
        # === 数据质量验证 ===
        if "data" in result:
            data = result["data"]
            # 应该有经济数据（来自真实世界银行API）
            if "economic" in data:
                # 至少GDP或人口有数据
                has_real_data = bool(data["economic"].get("gdp")) or bool(data["economic"].get("population"))
                # 注意：如果API调用失败，这里可能没数据，不应该fail
        
        # === 三引擎验证 ===
        if "engines" in result:
            engines = result["engines"]
            # 至少GoT应该有结果
            assert "got" in engines or len(engines) > 0
            
            # MCTS
            if "mcts" in engines:
                mcts = engines["mcts"]
                assert "top_paths" in mcts or "tree_summary" in mcts
            
            # Debate
            if "debate" in engines:
                debate = engines["debate"]
                assert "rounds" in debate or "debate_log" in debate
        
        # === 时间验证 ===
        assert elapsed < 300, f"全流程应该<5分钟, 实际={elapsed:.0f}秒"
        
        print(f"\n{'='*60}")
        print(f"✅ 全流程完成! 耗时: {elapsed:.1f}秒")
        print(f"预测结果:")
        for o in result["outcomes"]:
            print(f"  {o['name']}: {o['probability']:.1%}")
        print(f"{'='*60}")
    
    async def test_full_prediction_english_query(self):
        """英文问题也能处理"""
        from app.services.prediction_pipeline import run_full_pipeline
        
        context = {
            "query": "Will AI surpass human intelligence by 2030?",
            "region": "US",
            "outcomes": [
                {"name": "Yes, before 2030"},
                {"name": "No, after 2030"}
            ]
        }
        
        result = await run_full_pipeline(context)
        assert result is not None
        assert len(result["outcomes"]) >= 2
        total = sum(o["probability"] for o in result["outcomes"])
        assert 0.9 <= total <= 1.1
    
    async def test_rerun_changes_probability(self):
        """变量修改后重跑，概率应该变化"""
        from app.services.prediction_pipeline import run_full_pipeline, run_rerun
        
        context = {
            "query": "2026马来西亚大选谁赢",
            "region": "MY",
            "outcomes": [
                {"name": "PH"},
                {"name": "PN"}
            ]
        }
        
        original = await run_full_pipeline(context)
        original_probs = {o["name"]: o["probability"] for o in original["outcomes"]}
        
        # 修改变量后重跑
        modified_context = {**context, "variable_overrides": {"economic_sentiment": 0.9}}
        rerun_result = await run_rerun(modified_context, original)
        rerun_probs = {o["name"]: o["probability"] for o in rerun_result["outcomes"]}
        
        # 概率应该有变化（不一定更大或更小，但应该不完全一样）
        # 注意：由于LLM有随机性，即使不改变量也可能不同
        # 所以这里只验证结构正确
        assert len(rerun_result["outcomes"]) >= 2
        total = sum(o["probability"] for o in rerun_result["outcomes"])
        assert 0.9 <= total <= 1.1

@pytest.mark.real_e2e
class TestRealDataSources:
    
    async def test_stage2_returns_real_economic_data(self):
        """Stage 2 返回的经济数据来自真实API"""
        from app.services.prediction_pipeline import stage_2_data_collection
        
        context = {"query": "Malaysia economy 2026", "region": "MY"}
        result = await stage_2_data_collection(context)
        
        assert "economic" in result
        # 至少有一项经济数据
        eco = result["economic"]
        has_data = bool(eco.get("gdp")) or bool(eco.get("unemployment")) or bool(eco.get("inflation"))
        print(f"经济数据获取: GDP={'✅' if eco.get('gdp') else '❌'} "
              f"失业率={'✅' if eco.get('unemployment') else '❌'} "
              f"通胀={'✅' if eco.get('inflation') else '❌'}")
        # 不强制要求所有数据都有（API可能暂时不可用），但至少情感分析应该有
        assert "sentiment" in result

@pytest.mark.real_e2e
class TestRealThreeEngines:
    
    async def test_three_engines_parallel(self):
        """三引擎真正并行运行"""
        start = time.time()
        
        # 模拟Stage 5的三引擎并行
        from app.services.engines.mcts_engine import MCTSEngine
        from app.services.engines.debate_engine import DebateEngine
        
        context = {
            "query": "2026 Malaysia election",
            "outcomes": [{"name": "PH"}, {"name": "PN"}],
            "data_summary": "Malaysia economic and political context"
        }
        
        # 并行运行
        mcts_result, debate_result = await asyncio.gather(
            MCTSEngine(iterations=30).search(context),  # 减少迭代加速测试
            DebateEngine().run(context, ["PH", "PN"]),
            return_exceptions=True
        )
        
        elapsed = time.time() - start
        
        # 至少一个引擎成功
        mcts_ok = not isinstance(mcts_result, Exception)
        debate_ok = not isinstance(debate_result, Exception)
        assert mcts_ok or debate_ok, "至少一个引擎应该成功"
        
        if mcts_ok:
            print(f"MCTS: ✅ ({mcts_result.get('iterations', '?')} iterations)")
        if debate_ok:
            print(f"Debate: ✅ ({len(debate_result.get('rounds', debate_result.get('debate_log', [])))} rounds)")
        
        print(f"并行耗时: {elapsed:.1f}秒")
        # 并行应该比串行快（两个引擎总时间应该<单个×2）
        assert elapsed < 180, f"三引擎并行应<3分钟, 实际={elapsed:.0f}秒"
```

运行: `cd api && pytest tests/test_e2e_real.py -v -m real_e2e -s`
（`-s` 显示print输出，方便看实际结果）

**⚠️ 这些测试会调用真实OpenRouter API，会产生约 $0.50-2.00 费用。**

---

# ═══════════════════════════════════════════
# PART 4: 前端视觉验证
# ═══════════════════════════════════════════

## 4.1 截图测试
创建 `web/e2e/screenshots.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

/**
 * 对每个关键页面截图
 * 不做像素对比，只确保页面渲染不崩溃+关键元素存在
 */

const PAGES = [
  { name: 'landing', url: '/', must_have: ['FutureOS', 'Lite'] },
  { name: 'lite', url: '/lite', must_have: ['predict'] },
  { name: 'auth', url: '/auth/login', must_have: ['email', 'login'] },
  { name: 'studio', url: '/studio', must_have: ['project'] },
  { name: 'exchange', url: '/exchange', must_have: ['market'] },
  { name: 'community', url: '/community', must_have: ['predict'] },
  { name: 'leaderboard', url: '/leaderboard', must_have: ['rank'] },
  { name: 'pricing', url: '/pricing', must_have: ['free'] },
];

for (const page of PAGES) {
  test(`Screenshot: ${page.name}`, async ({ page: p }) => {
    await p.goto(page.url);
    await p.waitForTimeout(3000);
    
    // 页面不崩溃
    const errors: string[] = [];
    p.on('pageerror', err => errors.push(err.message));
    
    // 截图
    await p.screenshot({ 
      path: `e2e/screenshots/${page.name}-desktop.png`,
      fullPage: true 
    });
    
    // 移动端截图
    await p.setViewportSize({ width: 375, height: 812 });
    await p.screenshot({
      path: `e2e/screenshots/${page.name}-mobile.png`,
      fullPage: true
    });
    
    // 无JS错误
    expect(errors).toEqual([]);
    
    // 关键文本存在（不区分大小写）
    const bodyText = await p.locator('body').textContent();
    for (const text of page.must_have) {
      expect(bodyText?.toLowerCase()).toContain(text.toLowerCase());
    }
  });
}

// 有结果的预测页截图（使用seed数据）
test('Screenshot: prediction result', async ({ page }) => {
  // 用seed的已完成预测ID
  await page.goto('/lite/SEED_PREDICTION_ID/result');
  await page.waitForTimeout(5000);
  
  await page.screenshot({
    path: 'e2e/screenshots/result-desktop.png',
    fullPage: true
  });
  
  // SVG因果图存在
  await expect(page.locator('svg')).toBeVisible();
});
```

运行后在 `web/e2e/screenshots/` 中检查所有截图：
- 页面是否正确渲染（不是空白/报错）
- 深色主题是否一致
- 移动端是否不溢出

---

# ═══════════════════════════════════════════
# PART 5: SEO + 元数据验证
# ═══════════════════════════════════════════

创建 `web/e2e/seo.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('SEO验证', () => {
  test('Landing page 有完整meta', async ({ page }) => {
    await page.goto('/');
    
    // title
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(10);
    expect(title.length).toBeLessThan(70);
    
    // description
    const desc = await page.getAttribute('meta[name="description"]', 'content');
    expect(desc).toBeTruthy();
    expect(desc!.length).toBeGreaterThan(50);
    
    // OG tags
    const ogTitle = await page.getAttribute('meta[property="og:title"]', 'content');
    expect(ogTitle).toBeTruthy();
    
    const ogDesc = await page.getAttribute('meta[property="og:description"]', 'content');
    expect(ogDesc).toBeTruthy();
    
    const ogImage = await page.getAttribute('meta[property="og:image"]', 'content');
    // OG image 可选但推荐
    if (ogImage) {
      expect(ogImage).toContain('http');
    }
  });

  test('Favicon存在', async ({ page }) => {
    await page.goto('/');
    const favicon = await page.getAttribute('link[rel="icon"]', 'href');
    expect(favicon).toBeTruthy();
  });

  test('robots.txt可访问', async ({ page }) => {
    const resp = await page.goto('/robots.txt');
    expect(resp?.status()).toBe(200);
  });

  test('sitemap.xml可访问', async ({ page }) => {
    const resp = await page.goto('/sitemap.xml');
    if (resp?.status() === 200) {
      const text = await page.textContent('body');
      expect(text).toContain('url');
    }
    // sitemap不是必须的，404也可以接受
  });

  test('结果页有动态OG（如果实现）', async ({ page }) => {
    await page.goto('/lite/SEED_PREDICTION_ID/result');
    const ogTitle = await page.getAttribute('meta[property="og:title"]', 'content');
    // 如果实现了动态OG，标题应该包含预测问题
    if (ogTitle) {
      expect(ogTitle.length).toBeGreaterThan(5);
    }
  });
});
```

---

# ═══════════════════════════════════════════
# PART 6: 修复所有失败
# ═══════════════════════════════════════════

运行所有测试（包括新增的）:

```bash
# 回归测试
cd api && pytest -v --cov=app --ignore=tests/test_e2e_real.py --ignore=tests/test_production_data.py --tb=short

# 生产化验证
cd api && pytest tests/test_cache.py tests/test_security.py tests/test_monitoring.py tests/test_llm_resilience.py -v

# 真实数据源 (需要网络)
cd api && pytest tests/test_production_data.py -v -m integration

# 真实E2E (会调用OpenRouter，产生费用)
cd api && pytest tests/test_e2e_real.py -v -m real_e2e -s

# 前端
cd web && pnpm test -- --run
cd web && npx playwright test
cd web && pnpm build
```

**每个失败:**
1. 判断是bug还是测试需要调整
2. 修复
3. 重跑确认
4. 记录到报告

---

# ═══════════════════════════════════════════
# PART 7: 最终验收报告
# ═══════════════════════════════════════════

创建 `docs/sessions/final-acceptance-report.md`:

```markdown
# FutureOS 最终验收报告
日期: [今天]

## 测试总览
| Suite | Tests | Passed | Failed |
|-------|-------|--------|--------|
| 后端回归 | | | |
| 后端新增(缓存/安全/监控) | | | |
| 真实数据源集成 | | | |
| 真实E2E(LLM+数据) | | | |
| 前端单元 | | | |
| E2E Playwright | | | |
| 截图验证 | | | |
| SEO验证 | | | |
| Build | | | |

## 真实预测流程结果
- 问题: "2026马来西亚大选谁赢"
- 耗时: X秒
- 结果:
  - PH: XX%
  - PN: XX%
  - BN: XX%
- 数据源: [真实世界银行/新闻/LLM]
- 引擎: [GoT ✅/❌] [MCTS ✅/❌] [Debate ✅/❌]
- 因果图节点数: X
- 因果图边数: X

## 生产化功能状态
| 功能 | 状态 | 备注 |
|------|------|------|
| 世界银行数据 | ✅/❌ | |
| 新闻情感分析 | ✅/❌ | |
| Redis缓存 | ✅/❌ | |
| LLM超时降级 | ✅/❌ | |
| LLM重试 | ✅/❌ | |
| Rate Limiting | ✅/❌ | |
| CORS收紧 | ✅/❌ | |
| 输入清理 | ✅/❌ | |
| 数据库索引 | ✅/❌ | |
| Sentry | ✅/❌ | |
| 健康检查增强 | ✅/❌ | |
| OG Meta | ✅/❌ | |
| Favicon | ✅/❌ | |
| 404页面 | ✅/❌ | |
| Skeleton Loading | ✅/❌ | |

## 性能
- Landing页加载: X秒
- Lite首页加载: X秒
- 结果页加载: X秒
- 完整预测流程: X秒

## 安全
- [ ] .env不在Git中
- [ ] 前端无敏感key
- [ ] CORS只允许指定域名
- [ ] Rate Limit工作

## 已知问题（如果有）
[列出所有还没修复的问题+优先级]

## 修复记录
[列出这轮修复了什么]

## 上线建议
[READY / NOT READY]
原因: ...
```

---

# ═══════════════════════════════════════════
# PART 8: 上线清单 (Deployment Checklist)
# ═══════════════════════════════════════════

如果所有测试通过，执行以下上线清单:

创建 `docs/LAUNCH_CHECKLIST.md`:

```markdown
# FutureOS 上线清单

## 部署前
- [ ] 所有测试通过 (final-acceptance-report.md)
- [ ] .env.production 已配置
  - [ ] SUPABASE_URL (生产)
  - [ ] SUPABASE_ANON_KEY (生产)
  - [ ] SUPABASE_SERVICE_ROLE_KEY (生产)
  - [ ] OPENROUTER_API_KEY (生产)
  - [ ] REDIS_URL (Railway Redis)
  - [ ] SENTRY_DSN (前后端各一个)
  - [ ] NEWSDATA_API_KEY (可选)
- [ ] Railway环境变量已设置
- [ ] Supabase生产数据库迁移已执行 (001-007)
- [ ] Supabase RLS策略已验证

## 部署
- [ ] git push → Railway自动部署
- [ ] API健康检查通过 (GET /api/v1/health → 200)
- [ ] 前端首页可访问 (GET / → 200)
- [ ] 所有路由可访问 (无404)

## 部署后验证
- [ ] 注册新用户 → 成功
- [ ] 登录 → 跳转到Lite
- [ ] 创建预测 → 进度页 → 结果页 (全流程)
- [ ] 因果图正常渲染
- [ ] 变量滑块可拖动 → 概率变化
- [ ] Studio → 创建项目 → 各工作台可访问
- [ ] Exchange → 市场列表 → 可查看
- [ ] 分享链接可打开
- [ ] 移动端测试 (手机浏览器)

## 监控确认
- [ ] Sentry Dashboard有数据
- [ ] 无异常错误
- [ ] LLM调用正常 (非超时/报错)

## 可选: 域名配置
- [ ] 购买域名 (如 futureos.app)
- [ ] Railway自定义域名配置
- [ ] SSL正常 (自动)
- [ ] 前端 NEXT_PUBLIC_APP_URL 更新
- [ ] API CORS更新
- [ ] OG Meta URL更新
```

---

## 执行步骤

1. 先运行 PART 1 回归测试 → 全绿
2. 运行 PART 2 专项验证 → 全绿
3. 运行 PART 3 真实E2E → 成功
4. 运行 PART 4 截图 → 检查
5. 运行 PART 5 SEO → 全绿
6. PART 6 修复所有失败
7. PART 7 生成最终报告
8. PART 8 输出上线清单

完成后把 `docs/sessions/final-acceptance-report.md` 和 `docs/LAUNCH_CHECKLIST.md` 的内容汇报给我。
我看完后决定是否上线。

开始。
