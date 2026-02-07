"use client";

import { useRef, useEffect, useCallback } from "react";
import * as d3 from "d3";

interface CausalNode {
  id: string;
  label: string;
  probability: number;
  confidence: number;
  category: string;
}

interface CausalEdge {
  source: string;
  target: string;
  weight: number;
  type: string;
  description: string;
}

interface Props {
  nodes: CausalNode[];
  edges: CausalEdge[];
  width?: number;
  height?: number;
  onNodeClick?: (node: CausalNode) => void;
}

interface SimNode extends CausalNode, d3.SimulationNodeDatum {}
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  weight: number;
  type: string;
  description: string;
}

export function CausalGraph({ nodes, edges, width = 800, height = 500, onNodeClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  const render = useCallback(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const simNodes: SimNode[] = nodes.map((n) => ({ ...n }));
    const simLinks: SimLink[] = edges
      .filter((e) => nodes.some((n) => n.id === e.source) && nodes.some((n) => n.id === e.target))
      .map((e) => ({ ...e, source: e.source, target: e.target }));

    // Scales
    const sizeScale = d3.scaleSqrt().domain([0, 1]).range([8, 32]);
    const colorScale = d3.scaleSequential(d3.interpolateRdYlGn).domain([0, 1]);
    const linkWidthScale = d3.scaleLinear().domain([0, 1]).range([1, 6]);

    // Zoom
    const g = svg.append("g");
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 4])
        .on("zoom", (event) => g.attr("transform", event.transform))
    );

    // Arrow markers
    g.append("defs")
      .selectAll("marker")
      .data(["positive", "negative"])
      .join("marker")
      .attr("id", (d) => `arrow-${d}`)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 20)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("fill", (d) => (d === "positive" ? "#22c55e" : "#ef4444"))
      .attr("d", "M0,-5L10,0L0,5");

    // Links
    const link = g
      .append("g")
      .selectAll("line")
      .data(simLinks)
      .join("line")
      .attr("stroke", (d) => (d.type === "positive" ? "#22c55e" : "#ef4444"))
      .attr("stroke-opacity", 0.5)
      .attr("stroke-width", (d) => linkWidthScale(d.weight))
      .attr("marker-end", (d) => `url(#arrow-${d.type})`);

    // Link tooltips
    link.append("title").text((d) => d.description);

    // Nodes
    const node = g
      .append("g")
      .selectAll<SVGGElement, SimNode>("g")
      .data(simNodes)
      .join("g")
      .style("cursor", "pointer");

    // Drag behavior
    const dragBehavior = d3.drag<SVGGElement, SimNode>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    node.call(dragBehavior);

    node
      .append("circle")
      .attr("r", (d) => sizeScale(d.probability))
      .attr("fill", (d) => colorScale(d.confidence))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.3);

    node
      .append("text")
      .text((d) => d.label)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => sizeScale(d.probability) + 14)
      .attr("fill", "#9ca3af")
      .attr("font-size", "11px");

    node.on("click", (_event, d) => onNodeClick?.(d));
    node.append("title").text((d) => `${d.label}: ${Math.round(d.probability * 100)}%`);

    // Simulation
    const simulation = d3
      .forceSimulation(simNodes)
      .force("link", d3.forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<SimNode>().radius((d) => sizeScale(d.probability) + 10))
      .on("tick", () => {
        link
          .attr("x1", (d) => (d.source as SimNode).x!)
          .attr("y1", (d) => (d.source as SimNode).y!)
          .attr("x2", (d) => (d.target as SimNode).x!)
          .attr("y2", (d) => (d.target as SimNode).y!);
        node.attr("transform", (d) => `translate(${d.x},${d.y})`);
      });

    return () => simulation.stop();
  }, [nodes, edges, width, height, onNodeClick]);

  useEffect(() => {
    render();
  }, [render]);

  return (
    <svg
      ref={svgRef}
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="rounded-lg border border-gray-800 bg-gray-900/30"
    />
  );
}
