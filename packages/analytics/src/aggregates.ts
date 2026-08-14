import type {
  ActivityTimelineResponse,
  AggregateInboxItem,
  DailyShopAggregate,
  HeatmapMode,
  HeatmapPoint,
  HeatmapResponse,
  JourneyGraphResponse,
  RouteDayAggregate,
  RouteListResponse,
  RouteSort,
  SessionSummary,
} from "@pathminty/contracts";

import {
  aggregateHeatmapPoints,
  isCheckoutRoute,
  isHomeRoute,
  pinHomeRoutes,
} from "./index";

const HOVER_SAMPLE_MS = 250;
const CELL_ROUTE_LIMIT = 120;
const SEEN_SESSION_CAP = 80_000;
const APPLIED_INBOX_CAP = 4_000;
export const REPLAY_SAMPLE_EVERY = 20;

const emptyDeviceCounts = () => ({ desktop: 0, tablet: 0, mobile: 0 });
const emptyDeviceCells = () => ({
  desktop: [] as HeatmapPoint[],
  tablet: [] as HeatmapPoint[],
  mobile: [] as HeatmapPoint[],
});

export function shouldKeepReplay(sessionId: string, rageClickCount = 0): boolean {
  if (rageClickCount > 0) return true;
  const hex = sessionId.replace(/-/gu, "").slice(0, 8);
  const value = Number.parseInt(hex, 16);
  if (!Number.isFinite(value)) return false;
  return value % REPLAY_SAMPLE_EVERY === 0;
}

export function utcDayKeys(fromMs: number, toMs: number): string[] {
  const start = Date.UTC(
    new Date(fromMs).getUTCFullYear(),
    new Date(fromMs).getUTCMonth(),
    new Date(fromMs).getUTCDate(),
  );
  const end = Date.UTC(
    new Date(toMs).getUTCFullYear(),
    new Date(toMs).getUTCMonth(),
    new Date(toMs).getUTCDate(),
  );
  const days: string[] = [];
  for (let stamp = start; stamp <= end; stamp += 86_400_000) {
    days.push(new Date(stamp).toISOString().slice(0, 10));
    if (days.length >= 31) break;
  }
  return days;
}

export function emptyDailyAggregate(
  shopId: string,
  day: string,
  nowIso = new Date().toISOString(),
): DailyShopAggregate {
  return {
    schemaVersion: 1,
    shopId,
    day,
    totalSessions: 0,
    checkoutSessions: 0,
    routes: {},
    edges: {},
    acquisitions: {},
    hourSessions: Array.from({ length: 24 }, () => 0),
    seenSessionIds: [],
    recentReplayIds: [],
    appliedInboxIds: [],
    updatedAt: nowIso,
  };
}

function sessionPath(session: SessionSummary): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (route: string) => {
    if (!route || seen.has(route)) return;
    seen.add(route);
    ordered.push(route);
  };
  push(session.entryRoute);
  for (const route of session.routes ?? []) push(route);
  push(session.exitRoute);
  return ordered;
}

function fingerprintClick(click: {
  at: number;
  route: string;
  x: number;
  y: number;
}): string {
  return `${click.at}:${click.route}:${click.x}:${click.y}`;
}

export function buildAggregateInboxItem(input: {
  id: string;
  previous: SessionSummary | null;
  next: SessionSummary;
  keepReplay: boolean;
}): AggregateInboxItem {
  const next = input.next;
  const previous = input.previous;
  const started = Date.parse(next.startedAt);
  const hour = Number.isFinite(started) ? new Date(started).getUTCHours() : 0;
  const day = (next.lastSeenAt || next.startedAt).slice(0, 10);
  const isNewSession = !previous;

  const prevRoutes = new Set(previous ? sessionPath(previous) : []);
  const nextRoutes = sessionPath(next);
  const newRoutes = isNewSession
    ? nextRoutes
    : nextRoutes.filter((route) => !prevRoutes.has(route));

  const prevEdges = new Set<string>();
  if (previous) {
    const path = sessionPath(previous);
    for (let index = 0; index < path.length - 1; index += 1) {
      const from = path[index];
      const to = path[index + 1];
      if (from && to) prevEdges.add(`${from}\0${to}`);
    }
  }
  const newEdges: Array<{ from: string; to: string }> = [];
  for (let index = 0; index < nextRoutes.length - 1; index += 1) {
    const from = nextRoutes[index];
    const to = nextRoutes[index + 1];
    if (!from || !to || from === to) continue;
    const key = `${from}\0${to}`;
    if (prevEdges.has(key)) continue;
    prevEdges.add(key);
    newEdges.push({ from, to });
  }

  const prevClicks = new Set((previous?.clicks ?? []).map(fingerprintClick));
  const clicks = (next.clicks ?? [])
    .filter((click) => !prevClicks.has(fingerprintClick(click)))
    .map((click) => ({
      route: click.route,
      x: click.x,
      y: click.y,
      weight: 1,
    }));

  const prevHovers = new Set(
    (previous?.hovers ?? []).map((hover) =>
      fingerprintClick({
        at: hover.at,
        route: hover.route,
        x: hover.x,
        y: hover.y,
      }),
    ),
  );
  const hovers = (next.hovers ?? [])
    .filter(
      (hover) =>
        !prevHovers.has(
          fingerprintClick({
            at: hover.at,
            route: hover.route,
            x: hover.x,
            y: hover.y,
          }),
        ),
    )
    .map((hover) => ({
      route: hover.route,
      x: hover.x,
      y: hover.y,
      weight: Math.max(1, Math.round(hover.dwellMs / HOVER_SAMPLE_MS)),
    }));

  let acquisition: AggregateInboxItem["acquisition"] = null;
  if (isNewSession) {
    const landing = nextRoutes[0] ?? next.entryRoute;
    const raw = next.acquisition;
    acquisition = {
      source: raw?.source ?? "direct",
      medium: raw?.medium ?? (raw?.source === "direct" || !raw ? "none" : null),
      campaign: raw?.campaign ?? null,
      referrerHost: raw?.referrerHost ?? null,
      landingRoute: landing,
    };
  }

  return {
    schemaVersion: 1,
    id: input.id,
    shopId: next.shopId,
    sessionId: next.sessionId,
    day,
    hour: Math.min(23, Math.max(0, hour)),
    device: next.device,
    isNewSession,
    newRoutes,
    newEdges,
    clicks,
    hovers,
    reachedCheckout: nextRoutes.some((route) => isCheckoutRoute(route)),
    acquisition,
    hasFullSnapshot: next.hasFullSnapshot,
    keepReplay: input.keepReplay,
    lastSeenAt: next.lastSeenAt,
  };
}

function emptyRoute(lastSeenAt: string): RouteDayAggregate {
  return {
    sessionCount: 0,
    clickCount: 0,
    hoverWeight: 0,
    clickCells: [],
    hoverCells: [],
    clickCellsByDevice: emptyDeviceCells(),
    hoverCellsByDevice: emptyDeviceCells(),
    sessionsByDevice: emptyDeviceCounts(),
    checkoutReachCount: 0,
    hasFullSnapshot: false,
    lastSeenAt,
  };
}

function ensureRoute(
  daily: DailyShopAggregate,
  route: string,
  lastSeenAt: string,
): RouteDayAggregate {
  const existing = daily.routes[route];
  if (existing) return existing;
  const created = emptyRoute(lastSeenAt);
  daily.routes[route] = created;
  return created;
}

function pruneRouteCells(daily: DailyShopAggregate) {
  const withCells = Object.entries(daily.routes).filter(
    ([, route]) => route.clickCells.length > 0 || route.hoverCells.length > 0,
  );
  if (withCells.length <= CELL_ROUTE_LIMIT) return;
  const ranked = [...withCells].sort((left, right) => {
    const leftHome = isHomeRoute(left[0]) ? 1 : 0;
    const rightHome = isHomeRoute(right[0]) ? 1 : 0;
    if (leftHome !== rightHome) return rightHome - leftHome;
    return right[1].sessionCount - left[1].sessionCount;
  });
  for (const [route] of ranked.slice(CELL_ROUTE_LIMIT)) {
    const next = daily.routes[route];
    if (!next) continue;
    next.clickCells = [];
    next.hoverCells = [];
    next.clickCellsByDevice = emptyDeviceCells();
    next.hoverCellsByDevice = emptyDeviceCells();
    daily.routes[route] = next;
  }
}

function mergeCells(
  left: readonly HeatmapPoint[],
  right: readonly HeatmapPoint[],
): HeatmapPoint[] {
  return aggregateHeatmapPoints([...left, ...right]);
}

export function applyInboxToDaily(
  daily: DailyShopAggregate,
  item: AggregateInboxItem,
): DailyShopAggregate {
  if (daily.appliedInboxIds.includes(item.id)) return daily;
  const next: DailyShopAggregate = {
    ...daily,
    routes: { ...daily.routes },
    edges: { ...daily.edges },
    acquisitions: { ...daily.acquisitions },
    hourSessions: [...daily.hourSessions],
    seenSessionIds: [...daily.seenSessionIds],
    recentReplayIds: [...daily.recentReplayIds],
    appliedInboxIds: [...daily.appliedInboxIds, item.id].slice(-APPLIED_INBOX_CAP),
    updatedAt: item.lastSeenAt,
  };

  const alreadySeen = next.seenSessionIds.includes(item.sessionId);
  if (item.isNewSession && !alreadySeen) {
    next.totalSessions += 1;
    next.hourSessions[item.hour] = (next.hourSessions[item.hour] ?? 0) + 1;
    if (next.seenSessionIds.length < SEEN_SESSION_CAP) {
      next.seenSessionIds.push(item.sessionId);
    }
    if (item.reachedCheckout) next.checkoutSessions += 1;
  }

  if (item.keepReplay) {
    next.recentReplayIds = [
      item.sessionId,
      ...next.recentReplayIds.filter((id) => id !== item.sessionId),
    ].slice(0, 80);
  }

  const storeCells = (route: RouteDayAggregate) =>
    route.clickCells.length > 0 ||
    route.hoverCells.length > 0 ||
    isHomeRoute(
      Object.keys(next.routes).find((key) => next.routes[key] === route) ?? "",
    ) ||
    Object.values(next.routes).filter(
      (value) => value.clickCells.length > 0 || value.hoverCells.length > 0,
    ).length < CELL_ROUTE_LIMIT;

  for (const routeName of item.newRoutes) {
    const route = ensureRoute(next, routeName, item.lastSeenAt);
    const copy: RouteDayAggregate = {
      ...route,
      sessionsByDevice: { ...route.sessionsByDevice },
      clickCellsByDevice: {
        desktop: [...route.clickCellsByDevice.desktop],
        tablet: [...route.clickCellsByDevice.tablet],
        mobile: [...route.clickCellsByDevice.mobile],
      },
      hoverCellsByDevice: {
        desktop: [...route.hoverCellsByDevice.desktop],
        tablet: [...route.hoverCellsByDevice.tablet],
        mobile: [...route.hoverCellsByDevice.mobile],
      },
    };
    if (!(alreadySeen && item.isNewSession)) {
      copy.sessionCount += 1;
      copy.sessionsByDevice[item.device] += 1;
      if (item.reachedCheckout && item.isNewSession && !alreadySeen) {
        copy.checkoutReachCount += 1;
      }
    }
    if (item.hasFullSnapshot) copy.hasFullSnapshot = true;
    if (item.lastSeenAt > copy.lastSeenAt) copy.lastSeenAt = item.lastSeenAt;
    next.routes[routeName] = copy;
  }

  const addPoints = (
    routeName: string,
    mode: "click" | "hover",
    points: Array<{ x: number; y: number; weight: number }>,
  ) => {
    if (points.length === 0) return;
    const route = ensureRoute(next, routeName, item.lastSeenAt);
    const shouldStore =
      route.clickCells.length > 0 ||
      route.hoverCells.length > 0 ||
      isHomeRoute(routeName) ||
      storeCells(route);
    const copy: RouteDayAggregate = {
      ...route,
      clickCellsByDevice: {
        desktop: [...route.clickCellsByDevice.desktop],
        tablet: [...route.clickCellsByDevice.tablet],
        mobile: [...route.clickCellsByDevice.mobile],
      },
      hoverCellsByDevice: {
        desktop: [...route.hoverCellsByDevice.desktop],
        tablet: [...route.hoverCellsByDevice.tablet],
        mobile: [...route.hoverCellsByDevice.mobile],
      },
    };
    if (mode === "click") {
      copy.clickCount += points.reduce((sum, point) => sum + point.weight, 0);
      if (shouldStore) {
        copy.clickCells = mergeCells(copy.clickCells, points);
        copy.clickCellsByDevice[item.device] = mergeCells(
          copy.clickCellsByDevice[item.device],
          points,
        );
      }
    } else {
      copy.hoverWeight += points.reduce((sum, point) => sum + point.weight, 0);
      if (shouldStore) {
        copy.hoverCells = mergeCells(copy.hoverCells, points);
        copy.hoverCellsByDevice[item.device] = mergeCells(
          copy.hoverCellsByDevice[item.device],
          points,
        );
      }
    }
    if (item.hasFullSnapshot) copy.hasFullSnapshot = true;
    if (item.lastSeenAt > copy.lastSeenAt) copy.lastSeenAt = item.lastSeenAt;
    next.routes[routeName] = copy;
  };

  const clicksByRoute = new Map<string, HeatmapPoint[]>();
  for (const click of item.clicks) {
    const list = clicksByRoute.get(click.route) ?? [];
    list.push({ x: click.x, y: click.y, weight: click.weight });
    clicksByRoute.set(click.route, list);
  }
  for (const [route, points] of clicksByRoute) addPoints(route, "click", points);

  const hoversByRoute = new Map<string, HeatmapPoint[]>();
  for (const hover of item.hovers) {
    const list = hoversByRoute.get(hover.route) ?? [];
    list.push({ x: hover.x, y: hover.y, weight: hover.weight });
    hoversByRoute.set(hover.route, list);
  }
  for (const [route, points] of hoversByRoute) addPoints(route, "hover", points);

  for (const edge of item.newEdges) {
    const key = `${edge.from}\0${edge.to}`;
    next.edges[key] = (next.edges[key] ?? 0) + 1;
  }

  if (item.isNewSession && item.acquisition && !alreadySeen) {
    const raw = item.acquisition;
    const key = `${raw.source}|${raw.medium ?? ""}|${raw.campaign ?? ""}|${raw.landingRoute}`;
    const existing = next.acquisitions[key];
    if (existing) {
      next.acquisitions[key] = {
        ...existing,
        sessionCount: existing.sessionCount + 1,
      };
    } else {
      next.acquisitions[key] = { ...raw, sessionCount: 1 };
    }
  }

  pruneRouteCells(next);
  return next;
}

export function compactDailyAggregate(
  daily: DailyShopAggregate,
  items: readonly AggregateInboxItem[],
): DailyShopAggregate {
  return items.reduce((current, item) => applyInboxToDaily(current, item), daily);
}

export function mergeDailyAggregates(
  days: readonly DailyShopAggregate[],
): DailyShopAggregate | null {
  if (days.length === 0) return null;
  const first = days[0];
  if (!first) return null;
  const merged = {
    ...first,
    routes: { ...first.routes },
    edges: { ...first.edges },
    acquisitions: { ...first.acquisitions },
    hourSessions: [...first.hourSessions],
    seenSessionIds: [],
    recentReplayIds: [...first.recentReplayIds],
    appliedInboxIds: [],
  };
  for (const day of days.slice(1)) {
    merged.totalSessions += day.totalSessions;
    merged.checkoutSessions += day.checkoutSessions;
    merged.hourSessions = merged.hourSessions.map(
      (value, index) => value + (day.hourSessions[index] ?? 0),
    );
    merged.recentReplayIds = [...day.recentReplayIds, ...merged.recentReplayIds].slice(
      0,
      80,
    );
    for (const [key, count] of Object.entries(day.edges)) {
      merged.edges[key] = (merged.edges[key] ?? 0) + count;
    }
    for (const [key, row] of Object.entries(day.acquisitions)) {
      const existing = merged.acquisitions[key];
      merged.acquisitions[key] = existing
        ? { ...existing, sessionCount: existing.sessionCount + row.sessionCount }
        : { ...row };
    }
    for (const [routeName, route] of Object.entries(day.routes)) {
      const current = merged.routes[routeName];
      if (!current) {
        merged.routes[routeName] = {
          ...route,
          clickCellsByDevice: {
            desktop: [...route.clickCellsByDevice.desktop],
            tablet: [...route.clickCellsByDevice.tablet],
            mobile: [...route.clickCellsByDevice.mobile],
          },
          hoverCellsByDevice: {
            desktop: [...route.hoverCellsByDevice.desktop],
            tablet: [...route.hoverCellsByDevice.tablet],
            mobile: [...route.hoverCellsByDevice.mobile],
          },
          sessionsByDevice: { ...route.sessionsByDevice },
        };
        continue;
      }
      merged.routes[routeName] = {
        sessionCount: current.sessionCount + route.sessionCount,
        clickCount: current.clickCount + route.clickCount,
        hoverWeight: current.hoverWeight + route.hoverWeight,
        clickCells: mergeCells(current.clickCells, route.clickCells),
        hoverCells: mergeCells(current.hoverCells, route.hoverCells),
        clickCellsByDevice: {
          desktop: mergeCells(
            current.clickCellsByDevice.desktop,
            route.clickCellsByDevice.desktop,
          ),
          tablet: mergeCells(
            current.clickCellsByDevice.tablet,
            route.clickCellsByDevice.tablet,
          ),
          mobile: mergeCells(
            current.clickCellsByDevice.mobile,
            route.clickCellsByDevice.mobile,
          ),
        },
        hoverCellsByDevice: {
          desktop: mergeCells(
            current.hoverCellsByDevice.desktop,
            route.hoverCellsByDevice.desktop,
          ),
          tablet: mergeCells(
            current.hoverCellsByDevice.tablet,
            route.hoverCellsByDevice.tablet,
          ),
          mobile: mergeCells(
            current.hoverCellsByDevice.mobile,
            route.hoverCellsByDevice.mobile,
          ),
        },
        sessionsByDevice: {
          desktop: current.sessionsByDevice.desktop + route.sessionsByDevice.desktop,
          tablet: current.sessionsByDevice.tablet + route.sessionsByDevice.tablet,
          mobile: current.sessionsByDevice.mobile + route.sessionsByDevice.mobile,
        },
        checkoutReachCount: current.checkoutReachCount + route.checkoutReachCount,
        hasFullSnapshot: current.hasFullSnapshot || route.hasFullSnapshot,
        lastSeenAt:
          current.lastSeenAt > route.lastSeenAt ? current.lastSeenAt : route.lastSeenAt,
      };
    }
    if (day.updatedAt > merged.updatedAt) merged.updatedAt = day.updatedAt;
  }
  pruneRouteCells(merged);
  return merged;
}

function routeCells(
  route: RouteDayAggregate,
  mode: HeatmapMode,
  device: HeatmapResponse["device"],
): HeatmapPoint[] {
  if (mode === "scroll") return [];
  if (device === "all") {
    return mode === "hover" ? route.hoverCells : route.clickCells;
  }
  if (mode === "hover") return route.hoverCellsByDevice[device];
  return route.clickCellsByDevice[device];
}

function routeSessionCount(
  route: RouteDayAggregate,
  device: HeatmapResponse["device"],
): number {
  if (device === "all") return route.sessionCount;
  return route.sessionsByDevice[device];
}

export function heatmapFromAggregate(input: {
  shopId: string;
  route: string;
  device: HeatmapResponse["device"];
  mode: HeatmapMode;
  aggregate: DailyShopAggregate;
  snapshotEvents: HeatmapResponse["snapshotEvents"];
  fromIso: string;
  toIso: string;
  viewport?: HeatmapResponse["viewport"];
  document?: HeatmapResponse["document"];
}): HeatmapResponse {
  const route = input.aggregate.routes[input.route];
  const points = route ? routeCells(route, input.mode, input.device) : [];
  const sessionCount = route ? routeSessionCount(route, input.device) : 0;
  const eventCount = points.reduce((sum, point) => sum + point.weight, 0);
  let status: HeatmapResponse["status"] = "empty";
  if (points.length > 0 && input.snapshotEvents) status = "ok";
  else if (points.length > 0) status = "interactions_without_snapshot";
  return {
    shopId: input.shopId,
    route: input.route,
    device: input.device,
    mode: input.mode,
    sessionCount,
    eventCount,
    viewport: input.viewport ?? null,
    document: input.document ?? null,
    points,
    snapshotEvents: input.snapshotEvents,
    status,
  };
}

export function routeIndexFromAggregate(input: {
  aggregate: DailyShopAggregate;
  device: HeatmapResponse["device"];
  mode: HeatmapMode;
  sort: RouteSort;
  limit: number;
  query?: string;
  fromIso: string;
  toIso: string;
}): RouteListResponse {
  const query = input.query?.trim().toLowerCase() ?? "";
  const stats = Object.entries(input.aggregate.routes)
    .filter(([route]) => !query || route.toLowerCase().includes(query))
    .map(([route, value]) => {
      const sessionCount = routeSessionCount(value, input.device);
      const eventCount =
        input.mode === "hover"
          ? input.device === "all"
            ? value.hoverWeight
            : routeCells(value, "hover", input.device).reduce(
                (sum, point) => sum + point.weight,
                0,
              )
          : input.device === "all"
            ? value.clickCount
            : routeCells(value, "click", input.device).reduce(
                (sum, point) => sum + point.weight,
                0,
              );
      return {
        route,
        sessionCount,
        eventCount,
        clickCount:
          input.device === "all"
            ? value.clickCount
            : routeCells(value, "click", input.device).reduce(
                (sum, point) => sum + point.weight,
                0,
              ),
        hoverWeight:
          input.device === "all"
            ? value.hoverWeight
            : routeCells(value, "hover", input.device).reduce(
                (sum, point) => sum + point.weight,
                0,
              ),
        lastSeenAt: value.lastSeenAt,
        hasFullSnapshot: value.hasFullSnapshot,
        netRevenueMinor: 0,
        orderCount: 0,
        currency: null,
      };
    })
    .filter((row) => row.sessionCount > 0 || row.eventCount > 0);

  const sorted = [...stats].sort((left, right) => {
    if (input.sort === "least_active") {
      return (
        left.eventCount - right.eventCount || left.route.localeCompare(right.route)
      );
    }
    if (input.sort === "sessions") {
      return (
        right.sessionCount - left.sessionCount ||
        right.eventCount - left.eventCount ||
        left.route.localeCompare(right.route)
      );
    }
    if (input.sort === "alpha") return left.route.localeCompare(right.route);
    return (
      right.eventCount - left.eventCount ||
      right.sessionCount - left.sessionCount ||
      left.route.localeCompare(right.route)
    );
  });
  const byActive = [...stats].sort(
    (left, right) =>
      right.eventCount - left.eventCount ||
      right.sessionCount - left.sessionCount ||
      left.route.localeCompare(right.route),
  );
  const totalEvents = stats.reduce((sum, row) => sum + row.eventCount, 0);
  const totalSessions =
    input.device === "all"
      ? input.aggregate.totalSessions
      : stats.reduce((sum, row) => sum + row.sessionCount, 0);

  return {
    routes: pinHomeRoutes(sorted, input.limit),
    mostActive: byActive[0] ?? null,
    leastActive: byActive.filter((row) => row.sessionCount >= 3).at(-1) ?? null,
    totalSessions,
    totalEvents,
    totalRoutes: stats.length,
    totalNetRevenueMinor: 0,
    orderCount: 0,
    currency: null,
    from: input.fromIso,
    to: input.toIso,
  };
}

export function journeyFromAggregate(input: {
  aggregate: DailyShopAggregate;
  device: HeatmapResponse["device"];
  maxNodes: number;
  fromIso: string;
  toIso: string;
}): JourneyGraphResponse {
  const maxNodes = Math.min(Math.max(input.maxNodes, 4), 80);
  const ranked = Object.entries(input.aggregate.routes)
    .map(([route, value]) => ({
      route,
      count: routeSessionCount(value, input.device),
    }))
    .filter((row) => row.count > 0)
    .sort(
      (left, right) =>
        right.count - left.count || left.route.localeCompare(right.route),
    );
  const keep = new Set<string>();
  for (const row of ranked) {
    if (keep.size >= maxNodes) break;
    keep.add(row.route);
  }
  for (const route of Object.keys(input.aggregate.routes)) {
    if (isHomeRoute(route) || isCheckoutRoute(route)) keep.add(route);
  }

  const nodes = [...keep].map((route, index) => {
    const value = input.aggregate.routes[route];
    const sessionCount = value ? routeSessionCount(value, input.device) : 0;
    const checkoutReachCount = value?.checkoutReachCount ?? 0;
    return {
      route,
      sessionCount,
      checkoutReachCount,
      checkoutRate: sessionCount > 0 ? checkoutReachCount / sessionCount : 0,
      orderCount: 0,
      netRevenueMinor: 0,
      isLanding: isHomeRoute(route),
      isCheckout: isCheckoutRoute(route),
      layer: isCheckoutRoute(route) ? 3 : isHomeRoute(route) ? 0 : Math.min(2, index),
    };
  });

  const edges = Object.entries(input.aggregate.edges)
    .map(([key, sessionCount]) => {
      const [from, to] = key.split("\0");
      return { from: from ?? "", to: to ?? "", sessionCount };
    })
    .filter(
      (edge) =>
        edge.from &&
        edge.to &&
        keep.has(edge.from) &&
        keep.has(edge.to) &&
        edge.sessionCount > 0,
    )
    .sort((left, right) => right.sessionCount - left.sessionCount)
    .slice(0, 200)
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      sessionCount: edge.sessionCount,
      checkoutReachCount: 0,
      checkoutRate: 0,
      orderCount: 0,
      netRevenueMinor: 0,
    }));

  const acquisitions = Object.entries(input.aggregate.acquisitions)
    .map(([key, row]) => ({ key, ...row }))
    .sort(
      (left, right) =>
        right.sessionCount - left.sessionCount || left.key.localeCompare(right.key),
    )
    .slice(0, 40);

  return {
    nodes,
    edges,
    acquisitions,
    totalSessions:
      input.device === "all"
        ? input.aggregate.totalSessions
        : nodes.reduce((sum, node) => Math.max(sum, node.sessionCount), 0),
    checkoutSessions: input.aggregate.checkoutSessions,
    orderCount: 0,
    totalNetRevenueMinor: 0,
    currency: null,
    from: input.fromIso,
    to: input.toIso,
    conversionBasis: "reached_checkout",
  };
}

export function activityFromAggregate(input: {
  aggregate: DailyShopAggregate;
  fromMs: number;
  toMs: number;
}): ActivityTimelineResponse {
  const span = Math.max(1, input.toMs - input.fromMs);
  const bucketCount = span <= 25 * 60 * 60 * 1_000 ? 24 : 28;
  const bucketMs = span / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const startMs = input.fromMs + index * bucketMs;
    const endMs = index === bucketCount - 1 ? input.toMs : startMs + bucketMs;
    const startHour = new Date(startMs).getUTCHours();
    const sessionCount = input.aggregate.hourSessions[startHour] ?? 0;
    return {
      startAt: new Date(startMs).toISOString(),
      endAt: new Date(endMs).toISOString(),
      eventCount: sessionCount,
      sessionCount,
    };
  });
  return {
    buckets,
    from: new Date(input.fromMs).toISOString(),
    to: new Date(input.toMs).toISOString(),
    route: null,
    device: "all",
    mode: "click",
  };
}
