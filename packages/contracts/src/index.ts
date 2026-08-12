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
  })
  .strict();

export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const SessionListResponseSchema = z
  .object({
    sessions: z.array(SessionSummarySchema),
  })
  .strict();

export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;

export const ReplaySessionResponseSchema = z
  .object({
    summary: SessionSummarySchema,
    batches: z.array(ReplayBatchSchema),
    reconstruction: z.enum(["ready", "incomplete"]),
    incompleteReason: z.string().min(1).max(500).optional(),
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
