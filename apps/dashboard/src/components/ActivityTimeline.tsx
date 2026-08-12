import type { ActivityBucket } from "@pathminty/contracts";

function hourLabel(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "numeric" });
}

export function ActivityTimeline({
  buckets,
  selectedIndex,
  onSelect,
  showLabels = true,
}: {
  buckets: readonly ActivityBucket[];
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  showLabels?: boolean;
}) {
  const max = Math.max(...buckets.map((bucket) => bucket.eventCount), 1);

  return (
    <section className="activity-timeline" aria-label="Activity over time">
      <div className="activity-timeline-meta">
        <strong>Activity</strong>
        <span>
          {selectedIndex === null
            ? "Full range"
            : hourLabel(buckets[selectedIndex]?.startAt ?? "")}
        </span>
        {selectedIndex !== null && (
          <button
            className="timeline-clear"
            onClick={() => onSelect(null)}
            type="button"
          >
            Clear scrub
          </button>
        )}
      </div>
      <div className="activity-bars" role="list">
        {buckets.map((bucket, index) => {
          const height = Math.max(4, Math.round((bucket.eventCount / max) * 100));
          const active = selectedIndex === index;
          return (
            <button
              key={bucket.startAt}
              className="activity-bar"
              data-active={active}
              data-empty={bucket.eventCount === 0}
              onClick={() => onSelect(active ? null : index)}
              style={{ height: `${height}%` }}
              title={`${hourLabel(bucket.startAt)} · ${bucket.eventCount} events · ${bucket.sessionCount} sessions`}
              type="button"
              role="listitem"
            />
          );
        })}
      </div>
      {showLabels && buckets.length > 0 && (
        <div className="activity-labels">
          <span>{hourLabel(buckets[0]?.startAt ?? "")}</span>
          <span>{hourLabel(buckets[Math.floor(buckets.length / 2)]?.startAt ?? "")}</span>
          <span>{hourLabel(buckets.at(-1)?.startAt ?? "")}</span>
        </div>
      )}
    </section>
  );
}
