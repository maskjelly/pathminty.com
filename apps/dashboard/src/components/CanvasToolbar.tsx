import {
  ArrowClockwise,
  Cursor,
  DeviceMobile,
  DeviceTablet,
  HandPointing,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Monitor,
} from "@phosphor-icons/react";
import type { HeatmapMode, RouteSort, TimeRangePreset } from "@pathminty/contracts";

import type { DashboardDevice } from "../api/sessions";

const TIME_PRESETS: Array<{ id: TimeRangePreset; label: string }> = [
  { id: "1h", label: "1h" },
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
];

type CanvasToolbarProps = {
  timePreset: TimeRangePreset;
  onTimePreset: (preset: TimeRangePreset) => void;
  heatmapMode: HeatmapMode;
  onHeatmapMode: (mode: HeatmapMode) => void;
  device: DashboardDevice;
  onDevice: (device: DashboardDevice) => void;
  routeQuery: string;
  onRouteQuery: (value: string) => void;
  routeSort: RouteSort;
  onRouteSort: (value: RouteSort) => void;
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onRefresh: () => void;
};

export function CanvasToolbar({
  timePreset,
  onTimePreset,
  heatmapMode,
  onHeatmapMode,
  device,
  onDevice,
  routeQuery,
  onRouteQuery,
  routeSort,
  onRouteSort,
  scale,
  onZoomIn,
  onZoomOut,
  onFit,
  onRefresh,
}: CanvasToolbarProps) {
  return (
    <aside className="canvas-toolbar" aria-label="Canvas tools">
      <div className="canvas-tool-group" aria-label="Time range">
        {TIME_PRESETS.map((preset) => (
          <button
            data-active={timePreset === preset.id}
            key={preset.id}
            onClick={() => onTimePreset(preset.id)}
            type="button"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="canvas-tool-group" aria-label="Heatmap mode">
        <button
          data-active={heatmapMode === "click"}
          onClick={() => onHeatmapMode("click")}
          title="Clicks"
          type="button"
        >
          <Cursor size={16} />
        </button>
        <button
          data-active={heatmapMode === "hover"}
          onClick={() => onHeatmapMode("hover")}
          title="Hover"
          type="button"
        >
          <HandPointing size={16} />
        </button>
      </div>

      <div className="canvas-tool-group" aria-label="Device">
        <button
          data-active={device === "all"}
          onClick={() => onDevice("all")}
          title="All devices"
          type="button"
        >
          All
        </button>
        <button
          data-active={device === "desktop"}
          onClick={() => onDevice("desktop")}
          title="Desktop"
          type="button"
        >
          <Monitor size={16} />
        </button>
        <button
          data-active={device === "tablet"}
          onClick={() => onDevice("tablet")}
          title="Tablet"
          type="button"
        >
          <DeviceTablet size={16} />
        </button>
        <button
          data-active={device === "mobile"}
          onClick={() => onDevice("mobile")}
          title="Mobile"
          type="button"
        >
          <DeviceMobile size={16} />
        </button>
      </div>

      <label className="canvas-tool-search">
        <span>Find</span>
        <input
          onChange={(event) => onRouteQuery(event.target.value)}
          placeholder="/…"
          type="search"
          value={routeQuery}
        />
      </label>
      <label className="canvas-tool-search">
        <span>Sort</span>
        <select
          onChange={(event) => onRouteSort(event.target.value as RouteSort)}
          value={routeSort}
        >
          <option value="most_active">Active</option>
          <option value="least_active">Quiet</option>
          <option value="sessions">Sessions</option>
          <option value="alpha">A–Z</option>
        </select>
      </label>

      <div className="canvas-tool-group canvas-tool-zoom" aria-label="Zoom">
        <button onClick={onZoomIn} title="Zoom in" type="button">
          <MagnifyingGlassPlus size={16} />
        </button>
        <button onClick={onZoomOut} title="Zoom out" type="button">
          <MagnifyingGlassMinus size={16} />
        </button>
        <button onClick={onFit} title="Fit all" type="button">
          Fit
        </button>
        <span>{Math.round(scale * 100)}%</span>
      </div>

      <button className="canvas-tool-refresh" onClick={onRefresh} type="button">
        <ArrowClockwise size={15} />
        Refresh
      </button>
    </aside>
  );
}
