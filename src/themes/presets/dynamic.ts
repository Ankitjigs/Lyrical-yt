import { createTheme } from "./base";
import midnightPreset from "./midnight";

export default createTheme({
  id: "dynamic",
  name: "Dynamic",
  author: "Lyrical",
  description: "Adapts panel colors and glowing accents dynamically to the album art.",
  tokens: {
    ...midnightPreset.tokens,
  },
});
