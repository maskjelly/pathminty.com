import { z } from "zod";

export const REPLAY_CONTRACT_VERSION = 1 as const;
/**
 * Hard collector/Worker body limit for one replay batch (2 MiB).
 * Cloudflare Workers safely accept multi-MiB request bodies; this admits large
 * Shopify full-DOM rrweb snapshots while remaining bounded. Soft packing in
 * the recorder flushes earlier.
 */
export const MAX_REPLAY_BATCH_BYTES = 2 * 1024 * 1024;
/**
 * Browser fetch `keepalive` bodies are effectively capped near 64 KiB.
 * Never set keepalive above this threshold.
 */
export const KEEPALIVE_MAX_BODY_BYTES = 60 * 1024;
export const MAX_REPLAY_EVENTS_PER_BATCH = 5_000;
export const MAX_SHOPIFY_EVENT_BYTES = 32 * 1024;
/** Idle window after last activity before a session is considered ended. */
export const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1_000;

export const ShopIdSchema = z
  .string()
  .min(15)
  .max(255)
  .regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/);

export const StorefrontInstallationSchema = z
  .object({
    shopId: ShopIdSchema,
    publicToken: z.string().regex(/^[a-f0-9]{48}$/),
    pixelId: z.string().min(1).max(255),
    connectedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type StorefrontInstallation = z.infer<typeof StorefrontInstallationSchema>;

const EventTimestampSchema = z.number().int().nonnegative();
const NormalizedCoordinateSchema = z.number().min(0).max(1);
const PointerTypeSchema = z.enum(["mouse", "pen", "touch", ""]);
const StructuralTargetSchema = z
  .string()
  .max(512)
  .regex(
    /^(?:\[private\]|[a-z][a-z0-9-]*(?::nth-of-type\([1-9][0-9]*\))?(?: > [a-z][a-z0-9-]*(?::nth-of-type\([1-9][0-9]*\))?){0,4})$/,
  );
const UuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);

/** Lightweight coordinate events (tests / legacy seed only). */
export const ReplayEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("page_view"), at: EventTimestampSchema }).strict(),
  z
    .object({
      type: z.literal("pointer_move"),
      at: EventTimestampSchema,
      x: NormalizedCoordinateSchema,
      y: NormalizedCoordinateSchema,
      pointer: PointerTypeSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("pointer_down"),
      at: EventTimestampSchema,
      x: NormalizedCoordinateSchema,
      y: NormalizedCoordinateSchema,
      pointer: PointerTypeSchema,
      target: StructuralTargetSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("scroll"),
      at: EventTimestampSchema,
      depth: NormalizedCoordinateSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("visibility"),
      at: EventTimestampSchema,
      state: z.enum(["hidden", "visible"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("search_submit"),
      at: EventTimestampSchema,
      queryLength: z.number().int().nonnegative().max(10_000).optional(),
    })
    .strict(),
]);

export type ReplayEvent = z.infer<typeof ReplayEventSchema>;

/**
 * rrweb eventWithTime shape. Data is intentionally opaque at the contract edge;
 * privacy masking happens in the storefront recorder before upload.
 */
export const RrwebEventSchema = z
  .object({
    type: z.number().int().min(0).max(10),
    data: z.unknown(),
    timestamp: z.number().int().nonnegative(),
  })
  .passthrough();

export type RrwebEvent = z.infer<typeof RrwebEventSchema>;

const ViewportSchema = z
  .object({
    width: z.number().int().positive().max(20_000),
    height: z.number().int().positive().max(20_000),
    devicePixelRatio: z.number().positive().max(10),
  })
  .strict();

/** Full scrollable document size at capture time (for page-normalized heatmaps). */
const DocumentSizeSchema = z
  .object({
    width: z.number().int().positive().max(50_000),
    height: z.number().int().positive().max(200_000),
  })
  .strict();

export type DocumentSize = z.infer<typeof DocumentSizeSchema>;

const ReplayBatchBaseSchema = z.object({
  schemaVersion: z.literal(REPLAY_CONTRACT_VERSION),
  batchId: UuidSchema,
  shopId: ShopIdSchema,
  visitorId: z.string().min(8).max(128),
  sessionId: UuidSchema,
  /**
   * Monotonic whole-browser-session sequence. Allocated before upload so
   * pagehide and the next document cannot race the same chunk key.
   */
  sequence: z.number().int().nonnegative().max(9_999_999),
  capturedAt: z.string().datetime({ offset: true }),
  route: z.string().min(1).max(2_048),
  viewport: ViewportSchema,
  /** Scrollable document dimensions; required for storefront rrweb heatmaps. */
  document: DocumentSizeSchema.optional(),
  source: z.enum(["storefront", "test"]).optional(),
  isFinal: z.boolean(),
});

export const ReplayBatchSchema = z.discriminatedUnion("encoding", [
  ReplayBatchBaseSchema.extend({
    encoding: z.literal("json"),
    payload: z.array(ReplayEventSchema).max(MAX_REPLAY_EVENTS_PER_BATCH),
  }).strict(),
  ReplayBatchBaseSchema.extend({
    encoding: z.literal("rrweb"),
    payload: z.array(RrwebEventSchema).max(MAX_REPLAY_EVENTS_PER_BATCH),
  }).strict(),
]);

export type ReplayBatch = z.infer<typeof ReplayBatchSchema>;

export const HeatmapClickSchema = z
  .object({
    at: EventTimestampSchema,
    route: z.string().min(1).max(2_048),
    x: NormalizedCoordinateSchema,
    y: NormalizedCoordinateSchema,
    target: StructuralTargetSchema.optional(),
  })
  .strict();

export type HeatmapClick = z.infer<typeof HeatmapClickSchema>;

export const HeatmapHoverSchema = z
  .object({
    at: EventTimestampSchema,
    route: z.string().min(1).max(2_048),
    x: NormalizedCoordinateSchema,
    y: NormalizedCoordinateSchema,
    dwellMs: z.number().int().nonnegative().max(60_000),
  })
  .strict();

export type HeatmapHover = z.infer<typeof HeatmapHoverSchema>;

export const SessionSummarySchema = z
  .object({
    schemaVersion: z.literal(REPLAY_CONTRACT_VERSION),
    shopId: ShopIdSchema,
    visitorId: z.string().min(8).max(128),
    sessionId: UuidSchema,
    startedAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }),
    lastSeenAt: z.string().datetime({ offset: true }),
    durationMs: z.number().int().nonnegative(),
    status: z.enum(["active", "ended"]),
    entryRoute: z.string().min(1).max(2_048),
    exitRoute: z.string().min(1).max(2_048),
    routes: z.array(z.string().min(1).max(2_048)).min(1).max(64),
    viewport: ViewportSchema,
    /** Max observed document size across batches (page heatmap coordinate space). */
    document: DocumentSizeSchema,
    device: z.enum(["desktop", "tablet", "mobile"]),
    source: z.enum(["storefront", "test"]),
    eventCount: z.number().int().nonnegative(),
    pointerMoveCount: z.number().int().nonnegative(),
    clickCount: z.number().int().nonnegative(),
    maxScrollDepth: NormalizedCoordinateSchema,
    hasFullSnapshot: z.boolean(),
    clicks: z.array(HeatmapClickSchema).max(2_000),
    hovers: z.array(HeatmapHoverSchema).max(2_000),
    /** Checkout tokens seen on this journey (pixel + order join). */
    checkoutTokens: z.array(z.string().min(1).max(255)).max(16).optional(),
    /** Shopify order id when this session was joined to a purchase. */
    orderId: z.string().min(1).max(64).optional(),
    /** Net revenue attributed to this session (integer minor units). */
    netRevenueMinor: z.number().int().nonnegative().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    purchasedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const SessionListResponseSchema = z
  .object({
    sessions: z.array(SessionSummarySchema),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;

export const ReplaySessionResponseSchema = z
  .object({
    summary: SessionSummarySchema,
    batches: z.array(ReplayBatchSchema),
    reconstruction: z.enum(["ready", "incomplete"]),
    incompleteReason: z.string().min(1).max(500).optional(),
    /** Soft notice when playable but some batches were lost (e.g. checkout navigation). */
    reconstructionWarning: z.string().min(1).max(500).optional(),
  })
  .strict();

export type ReplaySessionResponse = z.infer<typeof ReplaySessionResponseSchema>;

export const HeatmapModeSchema = z.enum(["click", "hover"]);
export type HeatmapMode = z.infer<typeof HeatmapModeSchema>;

export const HeatmapPointSchema = z
  .object({
    x: NormalizedCoordinateSchema,
    y: NormalizedCoordinateSchema,
    weight: z.number().positive().max(1_000_000),
  })
  .strict();

export type HeatmapPoint = z.infer<typeof HeatmapPointSchema>;

export const HeatmapResponseSchema = z
  .object({
    shopId: ShopIdSchema,
    route: z.string().min(1).max(2_048),
    device: z.enum(["all", "desktop", "tablet", "mobile"]),
    mode: HeatmapModeSchema,
    sessionCount: numberAsNonNegInt(),
    eventCount: numberAsNonNegInt(),
    viewport: ViewportSchema.nullable(),
    /** Document coordinate space for full-page point overlay. */
    document: DocumentSizeSchema.nullable(),
    points: z.array(HeatmapPointSchema).max(20_000),
    /** Representative rrweb Meta + FullSnapshot (and optional early increments). */
    snapshotEvents: z.array(RrwebEventSchema).max(200).nullable(),
    status: z.enum(["ok", "empty", "interactions_without_snapshot"]),
  })
  .strict();

export type HeatmapResponse = z.infer<typeof HeatmapResponseSchema>;

/** Dashboard time window presets (merchant heatmaps + site map). */
export const TimeRangePresetSchema = z.enum(["1h", "24h", "7d", "30d"]);
export type TimeRangePreset = z.infer<typeof TimeRangePresetSchema>;

export const RouteSortSchema = z.enum([
  "most_active",
  "least_active",
  "sessions",
  "alpha",
]);
export type RouteSort = z.infer<typeof RouteSortSchema>;

export const RouteStatSchema = z
  .object({
    route: z.string().min(1).max(2_048),
    sessionCount: numberAsNonNegInt(),
    eventCount: numberAsNonNegInt(),
    clickCount: numberAsNonNegInt(),
    hoverWeight: numberAsNonNegInt(),
    lastSeenAt: z.string().datetime({ offset: true }),
    hasFullSnapshot: z.boolean(),
    /** Multi-touch: sum of net revenue from purchasing sessions that visited this route. */
    netRevenueMinor: numberAsNonNegInt(),
    orderCount: numberAsNonNegInt(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
  })
  .strict();

export type RouteStat = z.infer<typeof RouteStatSchema>;

export const RouteListResponseSchema = z
  .object({
    routes: z.array(RouteStatSchema).max(200),
    mostActive: RouteStatSchema.nullable(),
    leastActive: RouteStatSchema.nullable(),
    totalSessions: numberAsNonNegInt(),
    totalEvents: numberAsNonNegInt(),
    totalRoutes: numberAsNonNegInt(),
    totalNetRevenueMinor: numberAsNonNegInt(),
    orderCount: numberAsNonNegInt(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
  })
  .strict();

export type RouteListResponse = z.infer<typeof RouteListResponseSchema>;

export const ActivityBucketSchema = z
  .object({
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    eventCount: numberAsNonNegInt(),
    sessionCount: numberAsNonNegInt(),
  })
  .strict();

export type ActivityBucket = z.infer<typeof ActivityBucketSchema>;

export const ActivityTimelineResponseSchema = z
  .object({
    buckets: z.array(ActivityBucketSchema).max(200),
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    route: z.string().min(1).max(2_048).nullable(),
    device: z.enum(["all", "desktop", "tablet", "mobile"]),
    mode: HeatmapModeSchema,
  })
  .strict();

export type ActivityTimelineResponse = z.infer<typeof ActivityTimelineResponseSchema>;

export const HeatmapBatchResponseSchema = z
  .object({
    heatmaps: z.array(HeatmapResponseSchema).max(48),
  })
  .strict();

export type HeatmapBatchResponse = z.infer<typeof HeatmapBatchResponseSchema>;

/** Journey / flow graph built from session route sequences. */
export const JourneyNodeSchema = z
  .object({
    route: z.string().min(1).max(2_048),
    sessionCount: numberAsNonNegInt(),
    /** Sessions that reached a checkout/cart route after this node. */
    checkoutReachCount: numberAsNonNegInt(),
    /** checkoutReachCount / sessionCount (0–1). Behavioral proxy when no order join. */
    checkoutRate: z.number().min(0).max(1),
    /** Purchasing sessions that visited this route (verified order join). */
    orderCount: numberAsNonNegInt(),
    netRevenueMinor: numberAsNonNegInt(),
    isLanding: z.boolean(),
    isCheckout: z.boolean(),
    layer: z.number().int().nonnegative().max(32),
  })
  .strict();

export type JourneyNode = z.infer<typeof JourneyNodeSchema>;

export const JourneyEdgeSchema = z
  .object({
    from: z.string().min(1).max(2_048),
    to: z.string().min(1).max(2_048),
    sessionCount: numberAsNonNegInt(),
    checkoutReachCount: numberAsNonNegInt(),
    checkoutRate: z.number().min(0).max(1),
    orderCount: numberAsNonNegInt(),
    netRevenueMinor: numberAsNonNegInt(),
  })
  .strict();

export type JourneyEdge = z.infer<typeof JourneyEdgeSchema>;

export const JourneyGraphResponseSchema = z
  .object({
    nodes: z.array(JourneyNodeSchema).max(80),
    edges: z.array(JourneyEdgeSchema).max(200),
    totalSessions: numberAsNonNegInt(),
    checkoutSessions: numberAsNonNegInt(),
    orderCount: numberAsNonNegInt(),
    totalNetRevenueMinor: numberAsNonNegInt(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    /**
     * `verified_purchase` when at least one session in range has order join;
     * otherwise behavioral checkout reach only.
     */
    conversionBasis: z.enum(["reached_checkout", "verified_purchase"]),
  })
  .strict();

export type JourneyGraphResponse = z.infer<typeof JourneyGraphResponseSchema>;

function numberAsNonNegInt() {
  return z.number().int().nonnegative();
}

const MoneySchema = z
  .object({
    amountMinor: z.number().int().safe(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();

export const ShopifyPixelEventSchema = z
  .object({
    schemaVersion: z.literal(REPLAY_CONTRACT_VERSION),
    shopId: ShopIdSchema,
    type: z.enum([
      "page_viewed",
      "collection_viewed",
      "product_viewed",
      "search_submitted",
      "product_added_to_cart",
      "cart_viewed",
      "checkout_started",
      "payment_info_submitted",
      "checkout_completed",
    ]),
    eventId: z.string().min(1).max(255).optional(),
    clientId: z.string().min(1).max(255).optional(),
    occurredAt: z.string().datetime({ offset: true }),
    path: z.string().startsWith("/").max(2_048).optional(),
    searchQuery: z.string().max(120).optional(),
    productId: z.string().min(1).max(255).optional(),
    variantId: z.string().min(1).max(255).optional(),
    checkoutToken: z.string().min(1).max(255).optional(),
    orderId: z.string().min(1).max(255).optional(),
    total: MoneySchema.optional(),
  })
  .strict();

export type ShopifyPixelEvent = z.infer<typeof ShopifyPixelEventSchema>;

/**
 * Enqueued on every accepted batch so active sessions appear in the dashboard
 * within one polling interval — not only after a final flush.
 */
export const SessionSummaryJobSchema = z
  .object({
    schemaVersion: z.literal(REPLAY_CONTRACT_VERSION),
    jobId: UuidSchema,
    shopId: ShopIdSchema,
    sessionId: UuidSchema,
    sequence: z.number().int().nonnegative().max(9_999_999),
    isFinal: z.boolean(),
    enqueuedAt: z.string().min(20).max(40),
  })
  .strict();

export type SessionSummaryJob = z.infer<typeof SessionSummaryJobSchema>;

/** @deprecated Prefer SessionSummaryJobSchema; kept as an alias for existing consumers. */
export const SessionCompletedJobSchema = SessionSummaryJobSchema;
export type SessionCompletedJob = SessionSummaryJob;

/**
 * Queue message after gateway verifies a Shopify commerce/compliance webhook.
 * Payload is already authenticated; consumers must still validate shape and
 * never log the raw body (may contain residual PII in unexpected fields).
 */
export const ShopifyWebhookJobSchema = z
  .object({
    schemaVersion: z.literal(REPLAY_CONTRACT_VERSION),
    webhookId: z.string().min(1).max(128),
    shop: ShopIdSchema,
    topic: z.enum([
      "ORDERS_CREATE",
      "ORDERS_UPDATED",
      "REFUNDS_CREATE",
      "CUSTOMERS_DATA_REQUEST",
      "CUSTOMERS_REDACT",
      "SHOP_REDACT",
    ]),
    receivedAt: z.string().min(20).max(40),
    payload: z.unknown(),
  })
  .strict();

export type ShopifyWebhookJob = z.infer<typeof ShopifyWebhookJobSchema>;

/**
 * Verified commerce order fact (Level 1 PCD fields only).
 * Stored as JSON with integer minor units; shopId-scoped.
 */
export const OrderFactSchema = z
  .object({
    schemaVersion: z.literal(REPLAY_CONTRACT_VERSION),
    shopId: ShopIdSchema,
    shopifyOrderId: z.string().min(1).max(64),
    checkoutToken: z.string().min(1).max(255).optional(),
    sessionId: UuidSchema.optional().nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    gmvMinor: z.number().int().nonnegative(),
    discountsMinor: z.number().int().nonnegative(),
    refundsMinor: z.number().int().nonnegative(),
    cancellationsMinor: z.number().int().nonnegative(),
    netRevenueMinor: z.number().int().nonnegative(),
    orderedAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    financialStatus: z.string().min(1).max(64).optional(),
    cancelledAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export type OrderFact = z.infer<typeof OrderFactSchema>;

/** Maps checkout_token → session / order for join without scanning all summaries. */
export const CheckoutIndexSchema = z
  .object({
    schemaVersion: z.literal(REPLAY_CONTRACT_VERSION),
    shopId: ShopIdSchema,
    checkoutToken: z.string().min(1).max(255),
    sessionId: UuidSchema.optional(),
    shopifyOrderId: z.string().min(1).max(64).optional(),
    clientId: z.string().min(1).max(255).optional(),
    occurredAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type CheckoutIndex = z.infer<typeof CheckoutIndexSchema>;

export const CollectorAcceptedSchema = z
  .object({
    accepted: z.literal(true),
    batchId: UuidSchema,
  })
  .strict();

export type CollectorAccepted = z.infer<typeof CollectorAcceptedSchema>;

export const ErrorResponseSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      requestId: z.string().uuid(),
    }),
  })
  .strict();

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
