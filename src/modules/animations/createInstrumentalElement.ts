/**
 * Creates an HTML element representing an instrumental break in the lyrics.
 * Ported from better-lyrics-master's createInstrumentalElement.ts
 *
 * @param {number} durationMs - Duration of the instrumental break in milliseconds
 * @param {number} lineIndex - Line index for unique SVG element IDs
 * @returns {HTMLDivElement} Container div with animated music note SVG
 */
export function createInstrumentalElement(durationMs, lineIndex) {
  const container = document.createElement("div");
  container.classList.add("blyrics--instrumental");
  container.style.setProperty("--blyrics-duration", `${durationMs}ms`);

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.classList.add("blyrics--instrumental-icon");
  svg.setAttribute("viewBox", "0 0 24 24");

  const defs = document.createElementNS(svgNS, "defs");

  const filterId = `blyrics-glow-${lineIndex}`;
  const clipId = `blyrics-wave-clip-${lineIndex}`;

  // Glow filter
  const filter = document.createElementNS(svgNS, "filter");
  filter.setAttribute("id", filterId);
  filter.setAttribute("x", "-100%");
  filter.setAttribute("y", "-100%");
  filter.setAttribute("width", "300%");
  filter.setAttribute("height", "300%");

  const feGaussianBlur = document.createElementNS(svgNS, "feGaussianBlur");
  feGaussianBlur.setAttribute("in", "SourceGraphic");
  feGaussianBlur.setAttribute("stdDeviation", "5");
  feGaussianBlur.setAttribute("result", "blur");
  filter.appendChild(feGaussianBlur);

  const feColorMatrix = document.createElementNS(svgNS, "feColorMatrix");
  feColorMatrix.setAttribute("in", "blur");
  feColorMatrix.setAttribute("type", "matrix");
  feColorMatrix.setAttribute("values", "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.6 0");
  feColorMatrix.setAttribute("result", "fadedBlur");
  filter.appendChild(feColorMatrix);

  const feMerge = document.createElementNS(svgNS, "feMerge");
  const feMergeNode1 = document.createElementNS(svgNS, "feMergeNode");
  feMergeNode1.setAttribute("in", "fadedBlur");
  feMerge.appendChild(feMergeNode1);
  const feMergeNode2 = document.createElementNS(svgNS, "feMergeNode");
  feMergeNode2.setAttribute("in", "SourceGraphic");
  feMerge.appendChild(feMergeNode2);
  filter.appendChild(feMerge);

  defs.appendChild(filter);

  // Wave clip path (rising water effect)
  const clipPath = document.createElementNS(svgNS, "clipPath");
  clipPath.setAttribute("id", clipId);
  clipPath.classList.add("blyrics--wave-clip");

  // Static block — sits at y=3.9 and extends to bottom
  const waveRect = document.createElementNS(svgNS, "path");
  waveRect.classList.add("blyrics--wave-rect");
  waveRect.setAttribute("d", "M -4 3.9 L 30 3.9 L 30 30 L -4 30 Z");
  clipPath.appendChild(waveRect);

  // Wavy surface — undulates and flattens over duration
  const wavePath = document.createElementNS(svgNS, "path");
  wavePath.classList.add("blyrics--wave-path");
  wavePath.setAttribute("d", "M -4 3 Q 1 2 5 3 Q 10 4 14 3 Q 18 2 22 3 Q 26 4 30 3 L 30 4 L -4 4 Z");
  clipPath.appendChild(wavePath);

  defs.appendChild(clipPath);
  svg.appendChild(defs);

  // Background note (inactive color)
  const NOTE_PATH = "M10 21q-1.65 0-2.825-1.175T6 17t1.175-2.825T10 13q.575 0 1.063.138t.937.412V4q0-.425.288-.712T13 3h4q.425 0 .713.288T18 4v2q0 .425-.288.713T17 7h-3v10q0 1.65-1.175 2.825T10 21";

  const bgPath = document.createElementNS(svgNS, "path");
  bgPath.classList.add("blyrics--instrumental-bg");
  bgPath.setAttribute("d", NOTE_PATH);
  svg.appendChild(bgPath);

  // Fill note (active color, clipped by wave)
  const g = document.createElementNS(svgNS, "g");
  g.setAttribute("filter", `url(#${filterId})`);

  const fillPath = document.createElementNS(svgNS, "path");
  fillPath.classList.add("blyrics--instrumental-fill");
  fillPath.setAttribute("clip-path", `url(#${clipId})`);
  fillPath.setAttribute("d", NOTE_PATH);
  g.appendChild(fillPath);

  svg.appendChild(g);
  container.appendChild(svg);

  return container;
}
