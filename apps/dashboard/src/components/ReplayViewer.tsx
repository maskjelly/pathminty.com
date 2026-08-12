import type { ReplaySessionResponse, RrwebEvent } from "@pathminty/contracts";
import { Pause, Play } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { eventWithTime } from "rrweb";
import rrwebPlayer from "rrweb-player";
import "rrweb-player/dist/style.css";

function durationLabel(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

type PlayerInstance = {
  play: () => void;
  pause: () => void;
  setSpeed: (speed: number) => void;
  goto: (timeOffset: number, play?: boolean) => void;
  getMetaData: () => { totalTime: number };
  $destroy?: () => void;
};

/** Map validated wire events into rrweb-player's eventWithTime (contextual typing). */
function toPlayerEvents(events: readonly RrwebEvent[]): eventWithTime[] {
  return events.map((event): eventWithTime => {
    if ("delay" in event && typeof event.delay === "number") {
      return {
        type: event.type,
        data: event.data,
        timestamp: event.timestamp,
        delay: event.delay,
      };
    }
    return {
      type: event.type,
      data: event.data,
      timestamp: event.timestamp,
    };
  });
}

export function ReplayViewer({
  replay,
  loading,
  onClose,
}: {
  replay: ReplaySessionResponse | null;
  loading: boolean;
  onClose: () => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<PlayerInstance | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [totalMs, setTotalMs] = useState(0);
  const [assetWarning, setAssetWarning] = useState(false);

  const rrwebEvents = useMemo((): eventWithTime[] => {
    if (!replay || replay.reconstruction !== "ready") return [];
    const events: RrwebEvent[] = [];
    for (const batch of [...replay.batches].sort(
      (left, right) => left.sequence - right.sequence,
    )) {
      if (batch.encoding !== "rrweb") continue;
      for (const event of batch.payload) {
        events.push(event);
      }
    }
    events.sort((left, right) => left.timestamp - right.timestamp);
    return toPlayerEvents(events);
  }, [replay]);

  useEffect(() => {
    setPlaying(false);
    setElapsedMs(0);
    setTotalMs(0);
    setAssetWarning(false);
    setSpeed(1);

    const root = mountRef.current;
    if (!root || rrwebEvents.length < 2) {
      playerRef.current = null;
      return;
    }

    root.replaceChildren();
    // rrweb-player constructs a sandboxed iframe for DOM reconstruction and
    // does not execute storefront scripts from the captured page.
    const player = new rrwebPlayer({
      target: root,
      props: {
        events: rrwebEvents,
        width: Math.min(920, root.clientWidth || 920),
        height: Math.min(560, Math.round(((root.clientWidth || 920) * 9) / 16)),
        autoPlay: false,
        showController: false,
        speedOption: [0.5, 1, 2],
        speed: 1,
        skipInactive: true,
        tags: {},
      },
    }) as unknown as PlayerInstance;

    playerRef.current = player;
    try {
      const meta = player.getMetaData();
      setTotalMs(meta.totalTime || 0);
    } catch {
      setTotalMs(0);
    }

    // Non-blocking: external images/fonts may fail; content stays genuine.
    const onError = () => setAssetWarning(true);
    window.addEventListener("error", onError, true);

    const timer = window.setInterval(() => {
      const instance = playerRef.current;
      if (!instance) return;
      try {
        const meta = instance.getMetaData();
        setTotalMs(meta.totalTime || 0);
      } catch {
        // ignore
      }
    }, 500);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("error", onError, true);
      try {
        player.$destroy?.();
      } catch {
        root.replaceChildren();
      }
      playerRef.current = null;
    };
  }, [rrwebEvents]);

  useEffect(() => {
    playerRef.current?.setSpeed(speed);
  }, [speed]);

  const elapsedRef = useRef(0);
  useEffect(() => {
    elapsedRef.current = elapsedMs;
  }, [elapsedMs]);

  useEffect(() => {
    if (!playing) return;
    const started = performance.now();
    const base = elapsedRef.current;
    const timer = window.setInterval(() => {
      const next = base + (performance.now() - started) * speed;
      if (totalMs > 0 && next >= totalMs) {
        setElapsedMs(totalMs);
        setPlaying(false);
        playerRef.current?.pause();
        return;
      }
      setElapsedMs(next);
    }, 100);
    return () => window.clearInterval(timer);
  }, [playing, speed, totalMs]);

  const routeLabel = replay?.summary.exitRoute ?? replay?.summary.entryRoute ?? "—";
  const viewport = replay?.summary.viewport;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="replay-modal replay-modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="replay-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="close-button" onClick={onClose} title="Close" type="button">
          ×
        </button>
        <p className="modal-kicker">Storefront session recording</p>
        <h2 id="replay-title">Session replay</h2>

        {loading || !replay ? (
          <div className="replay-loading" role="status">
            Loading recording…
          </div>
        ) : replay.reconstruction === "incomplete" ? (
          <div className="recording-incomplete" role="alert">
            <strong>Recording incomplete</strong>
            <p>
              {replay.incompleteReason ??
                "This session cannot be reconstructed from the stored batches."}
            </p>
          </div>
        ) : rrwebEvents.length < 2 ? (
          <div className="recording-incomplete" role="alert">
            <strong>Recording incomplete</strong>
            <p>No usable DOM timeline events were found for this session.</p>
          </div>
        ) : (
          <>
            <div className="replay-meta-row">
              <span>{routeLabel}</span>
              <span>
                {viewport
                  ? `${viewport.width}×${viewport.height} · ${replay.summary.device}`
                  : replay.summary.device}
              </span>
              <span data-status={replay.summary.status}>{replay.summary.status}</span>
            </div>
            <div className="replay-player-shell" ref={mountRef} />
            {assetWarning && (
              <p className="asset-warning" role="status">
                Some external images or fonts could not load. The captured DOM is still
                shown as recorded.
              </p>
            )}
            <div className="replay-controls replay-controls-full">
              <button
                onClick={() => {
                  const player = playerRef.current;
                  if (!player) return;
                  if (playing) {
                    player.pause();
                    setPlaying(false);
                    return;
                  }
                  if (totalMs > 0 && elapsedMs >= totalMs) {
                    player.goto(0, true);
                    setElapsedMs(0);
                  } else {
                    player.play();
                  }
                  setPlaying(true);
                }}
                type="button"
              >
                {playing ? (
                  <Pause size={14} weight="fill" />
                ) : (
                  <Play size={14} weight="fill" />
                )}
                {playing ? "Pause" : "Play"}
              </button>
              <input
                aria-label="Replay position"
                max={Math.max(totalMs, 1)}
                min={0}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setElapsedMs(value);
                  playerRef.current?.goto(value, playing);
                }}
                type="range"
                value={Math.min(elapsedMs, totalMs || 0)}
              />
              <span>
                {durationLabel(elapsedMs)} / {durationLabel(totalMs)}
              </span>
              <label className="speed-select">
                Speed
                <select
                  aria-label="Playback speed"
                  onChange={(event) => setSpeed(Number(event.target.value))}
                  value={speed}
                >
                  <option value={0.5}>0.5×</option>
                  <option value={1}>1×</option>
                  <option value={2}>2×</option>
                </select>
              </label>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
