# PathMinty dashboard design QA

## Target

- Selected reference: `docs/design/pathminty-heatmap-dark-reference.png`
- Implemented surface: `apps/dashboard`
- Primary state: desktop click heatmap for `/collections/women`

## Visual comparison

The selected reference and the live implementation were reviewed together at the same
desktop state. The implementation preserves the reference's core hierarchy:

- warm carbon application shell;
- narrow icon rail;
- compact full-width analysis controls;
- large light storefront canvas with vivid click heatmap;
- dark activity-density timeline;
- floating PathMinty insight panel;
- restrained bone text and orange accent colour.

The implementation intentionally uses the PathMinty logo, verified sample commerce data,
and a smaller insight action instead of copying the generated placeholder copy.

## Functional checks

- Desktop and mobile preview controls change the canvas state.
- Click, scroll, and attention heatmap controls change active state.
- Activity playback toggles between play and pause.
- Matching sessions opens a populated session modal and closes cleanly.
- Primary navigation changes active state.
- The compact merchant-mobile layout keeps the storefront legible and scrollable.
- Browser console: no errors or warnings in the tested state.

## Issues found and resolved

- P1: none.
- P2: the initial narrow-screen canvas cropped the storefront too aggressively. The
  mobile layout now contains the full preview and places the timeline and insight in
  normal flow.
- P3: none remaining for this implementation slice.

## Final result

Passed.
