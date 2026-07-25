# Design System

## 1. Brand character

Lumina should feel:

- wondrous;
- calm;
- intelligent;
- precise;
- cinematic without being heavy;
- approachable without being childish;
- scientific without feeling clinical.

Avoid generic “AI neon,” excessive glass blur, constant gradients, and decorative space dust behind every element.

## 2. Theme

Default: deep-space dark.

Light theme is required before public completion, not necessarily in Release 0.

Suggested dark tokens:

```css
--bg-0: #050816;
--bg-1: #080d1d;
--surface-1: #0d1429;
--surface-2: #131c36;
--border-subtle: #263252;
--text-primary: #f5f7ff;
--text-secondary: #b5bfd8;
--text-muted: #7f8aa8;
--accent-cyan: #56d8ff;
--accent-violet: #9a8cff;
--accent-gold: #ffd36a;
--success: #54d69b;
--warning: #ffbd66;
--danger: #ff7185;
```

These are initial tokens, not permission to hardcode colors in components.

## 3. Typography

Use a system font stack initially. Typography hierarchy:

- Display: sparse, large, for major curiosity moments
- Heading: compact, high contrast
- Body: comfortable reading width and line height
- Data: tabular numerals; monospace only for IDs/coordinates
- Labels: sentence case, not excessive uppercase

Do not use tiny text to fit more data. Minimum practical body size is 16 CSS pixels.

## 4. Spacing and layout

Base spacing scale: 4, 8, 12, 16, 24, 32, 48, 64.

- Reading content max width approximately 70 characters.
- Data pages can use wider split layouts.
- Major visual areas may be full bleed.
- Cards are not the default container for every section.
- Mobile layouts prioritize vertical storytelling and bottom-sheet details.

## 5. Component categories

### Primitives

Button, IconButton, Link, Input, Select, Checkbox, Radio, Switch, Slider, Dialog, Popover, Tooltip, Tabs, Accordion, Toast, Progress, Skeleton.

### Scientific

Quantity, Uncertainty, Coordinate, SourceBadge, FreshnessBadge, ModelBadge, MeasurementTable, ScaleBar, DataQualityFlag.

### Space

EntityChip, ObjectTypeBadge, ObservationScore, SkyDirection, MissionStatus, LaunchPrecision, MoonPhase, EquipmentBadge.

### Content

LearningObjective, Misconception, ExperimentStep, QuizPrompt, CitationList, KnownLikelyUnknown.

## 6. Status language

Use precise labels:

- Measured
- Estimated
- Calculated
- Simulated
- Model-based
- Artist's concept
- Unknown
- Disputed
- Stale data
- Provider unavailable
- Tentative launch time
- Confirmed

Do not use vague “AI confidence.”

## 7. Motion

Motion purposes:

- orientation;
- continuity;
- cause/effect;
- scale;
- physical simulation.

Rules:

- reduced-motion support;
- no parallax required for reading;
- no long entrance choreography;
- no content hidden until animation finishes;
- no motion for motion's sake;
- simulation playback must pause.

## 8. Imagery

Media classification must be visible:

- photograph;
- composite;
- false-color image;
- simulation;
- map;
- diagram;
- artist's concept.

Credits are one action away at most.

Do not crop scientific imagery in a way that changes meaning without offering full view.

## 9. Charts

- Use perceptually appropriate scales.
- Units in axis labels.
- Accessible color palette.
- Patterns/labels when color distinction matters.
- Tooltips supplement, not replace, readable values.
- Data download for advanced plots where licence permits.
- Error bars when uncertainty is relevant.
- No 3D bar/pie charts.

## 10. Accessibility

Target WCAG 2.2 AA.

- visible focus ring;
- contrast-tested tokens;
- no color-only state;
- 44px touch targets where practical;
- keyboard order matches visual order;
- dialogs trap and restore focus;
- tooltips not required to understand content;
- captions/transcripts;
- canvas alternatives;
- accessible names for icon-only controls.

## 11. Responsive breakpoints

Use content-driven breakpoints. Initial conventional values may be:

- small: 640px
- medium: 768px
- large: 1024px
- extra large: 1280px

Do not design only at breakpoints; test intermediate widths.

## 12. Iconography

Use one approved open-source icon family for UI. Scientific symbols may use custom SVG with documentation.

Do not use emoji as the only icon for critical controls.

## 13. Loading and errors

- skeleton matches final geometry;
- avoid fake progress percentages;
- jobs use real state/progress;
- stale data remains visible with label when safe;
- errors identify affected component rather than blanking the page;
- retry actions are bounded.

## 14. Visual QA

Every route is reviewed at:

- 320×568
- 390×844
- 768×1024
- 1366×768
- 1920×1080
- 200% text zoom
- reduced motion
- keyboard only
- high contrast where available
- WebGL disabled
