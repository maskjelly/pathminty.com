import { type CaptureHealth, type UsageSnapshot } from "@pathminty/contracts";

export function resolveCaptureHealth(input: {
  connected: boolean;
  lastReplayAt: string | null;
  lastPixelAt: string | null;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
  usage: UsageSnapshot;
  nowMs?: number;
}): CaptureHealth {
  const nowMs = input.nowMs ?? Date.now();
  const quotaPaused = input.usage.billableSessions >= input.usage.limit;
  const errorAge =
    input.lastErrorAt !== null
      ? nowMs - Date.parse(input.lastErrorAt)
      : Number.POSITIVE_INFINITY;
  const replayAge =
    input.lastReplayAt !== null
      ? nowMs - Date.parse(input.lastReplayAt)
      : Number.POSITIVE_INFINITY;
  const pixelAge =
    input.lastPixelAt !== null
      ? nowMs - Date.parse(input.lastPixelAt)
      : Number.POSITIVE_INFINITY;

  let hint: CaptureHealth["hint"] = "ok";
  if (!input.connected) hint = "disconnected";
  else if (quotaPaused) hint = "quota_paused";
  else if (Number.isFinite(errorAge) && errorAge < 60 * 60 * 1_000)
    hint = "recent_errors";
  else if (!input.lastReplayAt) hint = "awaiting_traffic";
  else if (
    Number.isFinite(pixelAge) &&
    pixelAge < 30 * 60 * 1_000 &&
    replayAge > 30 * 60 * 1_000
  ) {
    hint = "embed_silent";
  }

  return {
    connected: input.connected,
    lastReplayAt: input.lastReplayAt,
    lastPixelAt: input.lastPixelAt,
    lastErrorCode: input.lastErrorCode,
    lastErrorAt: input.lastErrorAt,
    quotaPaused,
    hint,
  };
}
