import { PipelineEventSchema, type PipelineEvent } from "@pathminty/contracts";

const EVENTS_KEY = "ops:pipeline-events";
const MAX_EVENTS = 80;

type EventStore = {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
};

export async function listPipelineEvents(store: EventStore): Promise<PipelineEvent[]> {
  const stored = await store.get(EVENTS_KEY, "json");
  if (!Array.isArray(stored)) return [];
  return stored
    .map((item) => PipelineEventSchema.safeParse(item))
    .filter((item) => item.success)
    .map((item) => item.data);
}

export async function pushPipelineEvent(
  store: EventStore,
  event: Omit<PipelineEvent, "id" | "ackedAt"> & { id?: string },
): Promise<PipelineEvent> {
  const next: PipelineEvent = {
    id: event.id ?? crypto.randomUUID(),
    shopId: event.shopId,
    service: event.service,
    level: event.level,
    code: event.code,
    message: event.message,
    requestId: event.requestId,
    at: event.at,
    ackedAt: null,
  };
  const existing = await listPipelineEvents(store);
  const events = [next, ...existing].slice(0, MAX_EVENTS);
  await store.put(EVENTS_KEY, JSON.stringify(events));
  return next;
}

export async function ackPipelineEvent(store: EventStore, id: string): Promise<void> {
  const existing = await listPipelineEvents(store);
  const now = new Date().toISOString();
  await store.put(
    EVENTS_KEY,
    JSON.stringify(
      existing.map((event) => (event.id === id ? { ...event, ackedAt: now } : event)),
    ),
  );
}
