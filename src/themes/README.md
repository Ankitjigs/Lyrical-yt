Add new theme presets in this directory.

Each preset exports:

- `id`
- `name`
- `author`
- `description`
- `tokens`

The `tokens` object maps CSS custom properties to color values. To add a new
theme:

1. Create a new file in `src/themes/presets/`.
2. Export it with `createTheme(...)`.
3. Add it to `src/themes/presets/index.js`.

The UI and content panel both read from these preset files, so new themes only
need to be defined once here.
