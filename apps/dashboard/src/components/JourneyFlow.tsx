import type {
  JourneyEdge,
  JourneyGraphResponse,
  JourneyNode,
} from "@pathminty/contracts";
import { useMemo, useState } from "react";

function shortRoute(route: string) {
  if (route.length <= 28) return route;
  return `${route.slice(0, 12)}…${route.slice(-12)}`;
}

function formatRate(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

type LayoutNode = JourneyNode & { x: number; y: number; rank: number };

function layoutNodes(nodes: readonly JourneyNode[], width: number, height: number) {
  const layers = new Map<number, JourneyNode[]>();
  for (const node of nodes) {
    const list = layers.get(node.layer) ?? [];
    list.push(node);
    layers.set(node.layer, list);
  }
  const layerKeys = [...layers.keys()].sort((a, b) => a - b);
  const padX = 48;
  const padY = 36;
  const result: LayoutNode[] = [];

  layerKeys.forEach((layer, layerIndex) => {
    const group = (layers.get(layer) ?? []).sort(
      (a, b) => b.sessionCount - a.sessionCount,
    );
    const x =
      layerKeys.length <= 1
        ? width / 2
        : padX + (layerIndex / (layerKeys.length - 1)) * (width - padX * 2);
    group.forEach((node, index) => {
      const y =
        group.length <= 1
          ? height / 2
          : padY + (index / (group.length - 1)) * (height - padY * 2);
      result.push({ ...node, x, y, rank: index });
    });
  });
  return result;
}

function edgePath(
  from: LayoutNode,
  to: LayoutNode,
  index: number,
  total: number,
): string {
  const midX = (from.x + to.x) / 2;
  const fan = (index - (total - 1) / 2) * 12;
  const midY = (from.y + to.y) / 2 + fan;
  return `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${midY}, ${to.x} ${to.y}`;
}

export function JourneyFlow({
  graph,
  onSelectRoute,
}: {
  graph: JourneyGraphResponse;
  onSelectRoute: (route: string) => void;
}) {
  const [hover, setHover] = useState<
    { kind: "node"; node: JourneyNode } | { kind: "edge"; edge: JourneyEdge } | null
  >(null);

  const width = 960;
  const height = 420;
  const laidOut = useMemo(() => layoutNodes(graph.nodes, width, height), [graph.nodes]);
  const byRoute = useMemo(() => {
    const map = new Map<string, LayoutNode>();
    for (const node of laidOut) map.set(node.route, node);
    return map;
  }, [laidOut]);

  const maxEdge = Math.max(...graph.edges.map((e) => e.sessionCount), 1);
  const maxNode = Math.max(...graph.nodes.map((n) => n.sessionCount), 1);

  if (graph.nodes.length === 0) {
    return (
      <section className="journey-empty">
        <p>No journey paths in this range</p>
        <h2>Need multi-page sessions</h2>
        <p>
          Journeys appear after shoppers visit more than one route in a session. Edge
          thickness shows traffic; hover shows checkout-reach rate (not purchase).
        </p>
      </section>
    );
  }

  return (
    <section className="journey-flow" aria-label="Shopper journeys">
      <div className="journey-legend">
        <span>
          <i className="journey-swatch traffic" /> Edge thickness = session traffic
        </span>
        <span>
          <i className="journey-swatch convert" /> Hover = reached checkout rate
        </span>
        <span className="journey-basis">
          Basis: {graph.conversionBasis.replaceAll("_", " ")} ·{" "}
          {graph.conversionBasis === "verified_purchase"
            ? `${graph.orderCount} orders · ${graph.checkoutSessions}/${graph.totalSessions} reached checkout`
            : `${graph.checkoutSessions}/${graph.totalSessions} sessions reached checkout`}
        </span>
      </div>

      <div className="journey-canvas-wrap">
        <svg
          className="journey-svg"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Journey flow diagram"
        >
          <defs>
            <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ff8a55" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#ff6a2b" stopOpacity="0.85" />
            </linearGradient>
          </defs>

          {graph.edges.map((edge, index) => {
            const from = byRoute.get(edge.from);
            const to = byRoute.get(edge.to);
            if (!from || !to) return null;
            const weight = edge.sessionCount / maxEdge;
            const stroke = 1.5 + weight * 14;
            const active =
              hover?.kind === "edge" &&
              hover.edge.from === edge.from &&
              hover.edge.to === edge.to;
            return (
              <path
                key={`${edge.from}->${edge.to}`}
                d={edgePath(from, to, index, graph.edges.length)}
                fill="none"
                stroke={active ? "#ffb08a" : "url(#edgeGrad)"}
                strokeWidth={stroke}
                strokeLinecap="round"
                opacity={0.35 + weight * 0.55}
                className="journey-edge"
                onMouseEnter={() => setHover({ kind: "edge", edge })}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}

          {laidOut.map((node) => {
            const size = 28 + (node.sessionCount / maxNode) * 36;
            const active = hover?.kind === "node" && hover.node.route === node.route;
            return (
              <g
                key={node.route}
                className="journey-node"
                transform={`translate(${node.x}, ${node.y})`}
                onMouseEnter={() => setHover({ kind: "node", node })}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelectRoute(node.route)}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={-size / 2}
                  y={-22}
                  width={size}
                  height={44}
                  rx={8}
                  className={
                    node.isCheckout
                      ? "journey-node-box checkout"
                      : node.isLanding
                        ? "journey-node-box landing"
                        : "journey-node-box"
                  }
                  data-active={active}
                />
                <text y={-4} textAnchor="middle" className="journey-node-label">
                  {shortRoute(node.route)}
                </text>
                <text y={14} textAnchor="middle" className="journey-node-meta">
                  {node.sessionCount} · {formatRate(node.checkoutRate)}
                </text>
              </g>
            );
          })}
        </svg>

        {hover && (
          <div className="journey-tooltip" role="status">
            {hover.kind === "node" ? (
              <>
                <strong>{hover.node.route}</strong>
                <p>
                  {hover.node.sessionCount} sessions ·{" "}
                  {formatRate(hover.node.checkoutRate)} reached checkout
                </p>
                <small>
                  {hover.node.checkoutReachCount} of {hover.node.sessionCount} later hit
                  cart/checkout (not verified purchase)
                </small>
              </>
            ) : (
              <>
                <strong>
                  {hover.edge.from} → {hover.edge.to}
                </strong>
                <p>
                  {hover.edge.sessionCount} sessions on this path ·{" "}
                  {formatRate(hover.edge.checkoutRate)} reached checkout
                </p>
                <small>Thicker edges = heavier traffic</small>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
