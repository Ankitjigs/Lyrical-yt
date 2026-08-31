# Lyrical Styling Guide For AI Agents

This document is the styling quick-reference for agents working on Lyrical themes, panel visuals, popup styling, and lyric presentation.

Use it when you are:

- creating or editing theme presets
- restyling the YouTube lyrics panel
- restyling the extension popup/settings UI
- changing lyric colors, slider styling, scrollbars, or sync-state visuals
- modifying Better Lyrics style animation renderers inside Lyrical

## Styling Architecture

Lyrical has two main themed surfaces:

1. Popup UI
   - Rendered in `src/popup/App.jsx`
   - Uses the shared theme token map via inline CSS variables

2. In-page lyrics panel
   - Rendered in `src/content/components/LyricsPanel.jsx`
   - Injected into a shadow root from `src/content/main.jsx`
   - Core CSS lives in `src/content/styles.css`

Important: the lyrics panel lives inside a shadow root, so styling changes must be expressed through:

- CSS variables applied on the panel root
- styles injected into the shadow root
- inline React styles inside panel components

Do not assume popup/global document styles will affect the panel.

## Theme Source Of Truth

All built-in theme presets live in:

- `src/themes/presets/base.js`
- `src/themes/presets/midnight.js`
- `src/themes/presets/aurora.js`
- `src/themes/presets/sunset.js`
- `src/themes/presets/mono.js`

Preset registry:

- `src/themes/presets/index.js`
- `src/themes/index.js`

Theme data shape:

```js
{
  id,
  name,
  author,
  description,
  tokens: {
    "--lyrical-accent": "...",
    "--lyrical-panel-bg": "...",
  },
}
```

`base.js` defines the default token contract. Other presets should override only the values they want to change.

## Quick Reference: Most Important Tokens

Override these in presets before adding hardcoded colors anywhere else.

### Popup And Surface

```js
"--lyrical-popup-bg"
"--lyrical-popup-header-bg"
"--lyrical-page-bg"
"--lyrical-panel-bg"
"--lyrical-card-bg"
"--lyrical-card-bg-elevated"
"--lyrical-panel-surface"
"--lyrical-panel-surface-soft"
"--lyrical-panel-surface-strong"
"--lyrical-panel-hover"
"--lyrical-border"
"--lyrical-border-soft"
```

### Text

```js
"--lyrical-text-primary"
"--lyrical-text-secondary"
"--lyrical-text-muted"
"--lyrical-text-subtle"
"--lyrical-text-contrast"
```

### Brand / Accent / Status

```js
"--lyrical-accent"
"--lyrical-accent-soft"
"--lyrical-accent-strong"
"--lyrical-accent-glow"
"--lyrical-danger"
"--lyrical-success"
"--lyrical-success-strong"
"--lyrical-success-deep"
"--lyrical-success-soft"
"--lyrical-success-border"
"--lyrical-success-glow"
```

### Lyric-Specific Colors

```js
"--lyrical-romanized"
"--lyrical-translated"
"--lyrical-line-active-glow"
"--lyrical-word-inactive"
```

### Slider And Scrollbar

```js
"--lyrical-slider-rail"
"--lyrical-slider-gradient"
"--lyrical-slider-thumb"
"--lyrical-slider-thumb-ring"
"--lyrical-slider-thumb-border"
"--lyrical-scrollbar-track"
"--lyrical-scrollbar-thumb"
"--lyrical-scrollbar-thumb-hover"
```

### Better-Lyrics Bridge Tokens

These are used by Lyrical's Better Lyrics style animation layer:

```js
"--blyrics-lyric-active-color"
"--blyrics-glow-color"
"--blyrics-lyric-highlight-fade-in-duration"
```

Keep these aligned with Lyrical's main token palette.

## Where Tokens Are Consumed

### Popup

- `src/popup/App.jsx`
- `src/content/components/SettingsContent.jsx`
- `src/content/components/ThemeSelectionModal.jsx`
- `src/components/ui/Tooltip.jsx`

### Panel UI

- `src/content/components/LyricsPanel.jsx`
- `src/content/styles.css`
- `src/content/lyricsEffects.css`

### Synced Animation Renderers

- `src/modules/animations/BetterLyricsStrategy.jsx`
- `src/modules/animations/ImperativeBetterStrategy.jsx`

If you change lyric-related colors, verify both the normal panel renderer and the Better-style renderers.

## DOM And Selector Reference

### Main Panel Structure

Key IDs and classes used by the panel:

```text
#lyrical-panel
  #lyrical-content
    .lyric-line
      .lyric-original
      .lyric-romanized
      .lyric-translated
```

Important supporting UI:

```text
.lyrical-sync-slider
```

### Better-Style Renderer Structure

```text
.blyrics-container
  .blyrics--line
    .blyrics--words-container
      .blyrics--word
    .blyrics--romanized
    .blyrics--translated
```

Common active-state classes:

- `.lyric-line.active`
- `.blyrics--active`

## Theme Preview Requirements

Theme cards inside the popup modal render miniature previews from token values in:

- `src/content/components/ThemeSelectionModal.jsx`

When you add new presets, make sure the preview still looks representative. At minimum these tokens should look coherent together:

- `--lyrical-panel-bg`
- `--lyrical-panel-surface-soft`
- `--lyrical-border`
- `--lyrical-slider-gradient`
- `--lyrical-text-primary`
- `--lyrical-text-secondary`

## How To Add A New Built-In Theme

1. Create a new preset file in `src/themes/presets/`.
2. Export it with `createTheme(...)`.
3. Add it to `src/themes/presets/index.js`.
4. Make sure the token set covers panel, popup, romanized/translated text, slider, and status colors.
5. Check that the popup preview card looks correct.

Example:

```js
import { createTheme } from "./base";

export default createTheme({
  id: "my-theme",
  name: "My Theme",
  author: "Lyrical",
  description: "Short description",
  tokens: {
    "--lyrical-panel-bg": "linear-gradient(135deg, #101820 0%, #183a52 100%)",
    "--lyrical-accent": "#73d2ff",
    "--lyrical-romanized": "rgba(206, 164, 255, 0.84)",
    "--lyrical-translated": "rgba(115, 210, 255, 0.88)",
    "--lyrical-slider-gradient":
      "linear-gradient(90deg, #7c5cff 0%, #73d2ff 52%, #7df2c6 100%)",
    "--lyrical-slider-thumb": "#73d2ff",
  },
});
```

## Best Practices

1. Prefer token changes over hardcoded inline colors.
2. Keep popup and panel visually related, not identical.
3. Romanized and translated lyrics should be distinguishable from each other and from primary lyrics.
4. Slider styling should match the theme accent family.
5. Respect contrast on dark backgrounds; primary lyrics must stay readable.
6. When changing Better-style lyric visuals, verify both declarative and imperative strategies.
7. Keep expensive visual effects modest. Large animated blur layers can feel laggy while video is playing.
8. Use CSS variables for anything likely to vary by theme.
9. Preserve shadow-root compatibility. Prefer `:host`, panel-local CSS, and inline token usage.
10. Test long song titles, translated lyrics, and dense synced lyrics before calling styling done.

## Performance Notes

Lyrical runs beside a playing YouTube video, so expensive effects are noticeable quickly.

Prefer:

- transform and opacity animation
- static backdrop blur instead of animated blur radius
- small shadows and restrained glows
- token-driven gradients instead of large animated filters

Be careful with:

- animating `filter: blur(...)`
- large multi-layer shadows on many lyric lines at once
- per-card or per-line motion that runs continuously
- forcing unnecessary React re-renders for purely visual changes

## Do Not Forget These Cross-Checks

When editing styles, verify all of the following when relevant:

1. Popup still uses the active theme.
2. Panel still uses the active theme inside the shadow root.
3. Romanized and translated lines still honor theme colors.
4. Sync slider still matches the theme.
5. Theme modal preview cards still look correct.
6. Better-style synced lyrics still use the intended colors.

## Files Reference

| File | Purpose |
| --- | --- |
| `src/themes/presets/base.js` | Shared token contract |
| `src/themes/presets/*.js` | Built-in theme definitions |
| `src/themes/index.js` | Theme lookup and storage constants |
| `src/popup/App.jsx` | Popup root theme application |
| `src/content/main.jsx` | Shadow-root injection and store sync |
| `src/content/styles.css` | Core panel CSS and slider styling |
| `src/content/components/LyricsPanel.jsx` | Main panel UI |
| `src/content/components/SettingsContent.jsx` | Settings UI using shared theme tokens |
| `src/content/components/ThemeSelectionModal.jsx` | Theme chooser modal and previews |
| `src/modules/animations/BetterLyricsStrategy.jsx` | React-based synced lyrics renderer |
| `src/modules/animations/ImperativeBetterStrategy.jsx` | DOM-based synced lyrics renderer |

## Safe Defaults

If you are unsure, keep these principles:

- primary lyrics: bright and high-contrast
- romanized lyrics: softer but still legible
- translated lyrics: theme-accented and readable
- card surfaces: translucent or elevated, not flat-black everywhere
- borders: subtle, not harsh
- slider thumb: accent-colored
- success state: clearly different from accent

The goal is a cohesive panel and popup system, not isolated one-off color changes.
