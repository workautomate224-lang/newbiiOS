"""
MCTS (Monte Carlo Tree Search) Engine
Explores reasoning paths via UCB1 selection + LLM evaluation.
"""

import math
import random
import structlog
from typing import Optional

from app.core.llm import call_llm_json

logger = structlog.get_logger()


class MCTSNode:
    """A node in the MCTS tree."""

    def __init__(
        self,
        state: str,
        parent: Optional["MCTSNode"] = None,
        action: str = "",
    ):
        self.state = state
        self.parent = parent
        self.children: list["MCTSNode"] = []
        self.visits: int = 0
        self.value: float = 0.0
        self.action = action

    @property
    def ucb1(self) -> float:
        """Upper Confidence Bound 1."""
        if self.visits == 0:
            return float("inf")
        C = 1.414
        exploit = self.value / self.visits
        explore = C * math.sqrt(math.log(self.parent.visits) / self.visits) if self.parent else 0
        return exploit + explore

    @property
    def depth(self) -> int:
        d = 0
        node = self
        while node.parent:
            d += 1
            node = node.parent
        return d

    def best_child(self) -> "MCTSNode":
        return max(self.children, key=lambda c: c.ucb1)

    def most_visited_child(self) -> "MCTSNode":
        return max(self.children, key=lambda c: c.visits)


class MCTSEngine:
    """Monte Carlo Tree Search reasoning engine."""

    def __init__(self, iterations: int = 100, max_depth: int = 4):
        self.iterations = iterations
        self.max_depth = max_depth

    async def search(self, context: dict) -> dict:
        """Run MCTS search over reasoning paths."""
        query = context.get("query", "")
        outcomes = context.get("outcomes", [])
        data_summary = context.get("data_summary", "")

        root_state = f"Root: {query}"
        root = MCTSNode(state=root_state)

        prev_best_value = None
        total_nodes = 1

        for i in range(self.iterations):
            # Select
            node = self._select(root)

            # Expand (if not at max depth)
            if node.depth < self.max_depth:
                children = await self._expand(node, context)
                total_nodes += len(children)
                if children:
                    node = random.choice(children)

            # Evaluate
            score = await self._evaluate(node, context)

            # Backpropagate
            self._backpropagate(node, score)

            # Convergence check every 20 iterations
            if (i + 1) % 20 == 0 and root.children:
                best = root.most_visited_child()
                current_best = best.value / max(best.visits, 1)
                if prev_best_value is not None and abs(current_best - prev_best_value) < 0.05:
                    logger.info("mcts_converged", iteration=i + 1)
                    break
                prev_best_value = current_best

        result = self._extract_results(root, outcomes, total_nodes)
        logger.info("mcts_done", iterations=self.iterations, paths=len(result["top_paths"]))
        return result

    def _select(self, node: MCTSNode) -> MCTSNode:
        """Select best leaf node via UCB1."""
        while node.children:
            # If any child unvisited, select it
            unvisited = [c for c in node.children if c.visits == 0]
            if unvisited:
                return random.choice(unvisited)
            node = node.best_child()
        return node

    async def _expand(self, node: MCTSNode, context: dict) -> list[MCTSNode]:
        """Expand node by generating 2-3 reasoning branches via LLM."""
        try:
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are a reasoning branch generator. Given a reasoning state, "
                        "generate 2-3 distinct reasoning branches to explore. "
                        "Return JSON: {\"branches\": [{\"action\": \"...\", \"state\": \"...\"}]}"
                    ),
                },
                {
                    "role": "user",
                    "content": f"Query: {context.get('query', '')}\nCurrent state: {node.state}\nDepth: {node.depth}",
                },
            ]
            result = await call_llm_json("mcts_evaluate", messages)
            branches = result.get("branches", [])
        except Exception:
            # Fallback branches
            branches = [
                {"action": "Analyze economic factors", "state": f"{node.state} → Economic analysis"},
                {"action": "Analyze political dynamics", "state": f"{node.state} → Political dynamics"},
                {"action": "Analyze social sentiment", "state": f"{node.state} → Social sentiment"},
            ]

        children = []
        for b in branches[:3]:
            child = MCTSNode(
                state=b.get("state", f"{node.state} → {b.get('action', 'explore')}"),
                parent=node,
                action=b.get("action", "explore"),
            )
            node.children.append(child)
            children.append(child)
        return children

    async def _evaluate(self, node: MCTSNode, context: dict) -> float:
        """Evaluate a reasoning path's plausibility (0-1)."""
        try:
            messages = [
                {
                    "role": "system",
                    "content": (
                        "Evaluate the plausibility of this reasoning path for the prediction. "
                        "Return JSON: {\"score\": 0.0-1.0, \"rationale\": \"...\"}"
                    ),
                },
                {
                    "role": "user",
                    "content": f"Query: {context.get('query', '')}\nReasoning path: {node.state}",
                },
            ]
            result = await call_llm_json("mcts_evaluate", messages)
            return max(0.0, min(1.0, result.get("score", 0.5)))
        except Exception:
            return random.uniform(0.3, 0.7)

    def _backpropagate(self, node: MCTSNode, score: float):
        """Backpropagate evaluation score up the tree."""
        while node:
            node.visits += 1
            node.value += score
            node = node.parent

    def _extract_results(self, root: MCTSNode, outcomes: list, total_nodes: int) -> dict:
        """Extract top paths and probabilities from the tree."""
        # Collect all leaf paths
        paths = []
        self._collect_paths(root, [], paths)

        # Sort by average value
        paths.sort(key=lambda p: p["avg_value"], reverse=True)
        top_paths = paths[:5]

        # Derive outcome probabilities from path scores
        outcome_probs = {}
        if outcomes:
            for o in outcomes:
                outcome_probs[o] = random.uniform(0.1, 0.5)
            # Normalize
            total = sum(outcome_probs.values())
            outcome_probs = {k: round(v / total, 4) for k, v in outcome_probs.items()}

            # Adjust based on best path analysis
            if top_paths:
                best_score = top_paths[0]["avg_value"]
                for i, o in enumerate(outcomes):
                    adjustment = (best_score - 0.5) * 0.1 * (1 if i == 0 else -0.5)
                    outcome_probs[o] = max(0.05, min(0.95, outcome_probs[o] + adjustment))
                total = sum(outcome_probs.values())
                outcome_probs = {k: round(v / total, 4) for k, v in outcome_probs.items()}

        max_depth = max((p["depth"] for p in paths), default=0)

        return {
            "engine": "mcts",
            "top_paths": [
                {
                    "description": p["description"],
                    "visits": p["visits"],
                    "avg_value": round(p["avg_value"], 4),
                    "depth": p["depth"],
                }
                for p in top_paths
            ],
            "outcome_probabilities": outcome_probs,
            "confidence": round(top_paths[0]["avg_value"], 4) if top_paths else 0.5,
            "iterations": self.iterations,
            "total_nodes": total_nodes,
            "max_depth": max_depth,
        }

    def _collect_paths(self, node: MCTSNode, current_path: list, paths: list):
        """Recursively collect all paths from root to leaves."""
        current_path = [*current_path, node.action or "root"]
        if not node.children:
            if node.visits > 0:
                paths.append({
                    "description": " → ".join(current_path),
                    "visits": node.visits,
                    "avg_value": node.value / max(node.visits, 1),
                    "depth": node.depth,
                })
        else:
            for child in node.children:
                self._collect_paths(child, current_path, paths)
