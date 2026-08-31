import { createTheme } from "./base";

export default createTheme({
  id: "midnight",
  name: "Midnight",
  author: "Lyrical",
  description: "The current deep-blue glass look, now as a reusable preset.",
  tokens: {
    "--lyrical-slider-rail": "rgba(255, 255, 255, 0.18)",
    "--lyrical-slider-thumb": "#7c7cff",
    "--lyrical-slider-thumb-ring": "rgba(124, 124, 255, 0.24)",
    "--lyrical-slider-thumb-border": "rgba(255, 255, 255, 0.58)",
  },
});
