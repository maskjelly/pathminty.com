import type { DocumentSize } from "@pathminty/contracts";

export type HeatmapDisplayLayout = Readonly<{
  pageWidth: number;
  pageHeight: number;
  scale: number;
  displayWidth: number;
  displayHeight: number;
}>;

/**
 * Size the reconstructed page to the captured document, then scale into the
 * available stage width while preserving aspect ratio.
 */
export function computeHeatmapDisplayLayout(
  documentSize: DocumentSize | null | undefined,
  viewport: { width: number; height: number } | null | undefined,
  availableWidth: number,
): HeatmapDisplayLayout {
  const pageWidth = Math.max(1, documentSize?.width ?? viewport?.width ?? 1_280);
  const pageHeight = Math.max(1, documentSize?.height ?? viewport?.height ?? 800);
  const width = Math.max(1, availableWidth);
  const scale = Math.min(1, width / pageWidth);
  return {
    pageWidth,
    pageHeight,
    scale,
    displayWidth: Math.round(pageWidth * scale),
    displayHeight: Math.round(pageHeight * scale),
  };
}

/**
 * Inline styles that pin heatmap Replayer wrappers to the stage top-left.
 *
 * ReplayViewer imports rrweb-player CSS globally, which sets
 * `.replayer-wrapper { left: 50%; top: 50%; float: left }`. That must not
 * center the heatmap reconstruction.
 */
export function heatmapRrwebWrapperPinStyles(
  pageWidth: number,
  pageHeight: number,
  scale: number,
): Readonly<Record<string, string>> {
  return {
    position: "absolute",
    left: "0px",
    top: "0px",
    right: "auto",
    bottom: "auto",
    float: "none",
    clear: "none",
    margin: "0px",
    marginLeft: "0px",
    marginTop: "0px",
    marginRight: "0px",
    marginBottom: "0px",
    transform: `scale(${scale})`,
    transformOrigin: "0 0",
    width: `${pageWidth}px`,
    height: `${pageHeight}px`,
  };
}

/** True when pin styles keep the wrapper at exact top-left without centering. */
export function isHeatmapWrapperPinnedTopLeft(
  styles: Readonly<Record<string, string>>,
): boolean {
  const left = styles.left ?? "";
  const top = styles.top ?? "";
  const float = styles.float ?? "";
  const origin = styles.transformOrigin ?? "";
  if (left === "50%" || top === "50%") return false;
  if (left.includes("50%") || top.includes("50%")) return false;
  if (float === "left" || float === "right") return false;
  if (left !== "0" && left !== "0px") return false;
  if (top !== "0" && top !== "0px") return false;
  if (!origin.includes("0") && !origin.includes("top") && !origin.includes("left")) {
    return false;
  }
  return true;
}
