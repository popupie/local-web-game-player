// @ts-nocheck

const EMOJI_FONT_FALLBACK =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

const EMOJI_FONT_NAMES = new Set([
  "apple color emoji",
  "segoe ui emoji",
  "noto color emoji",
]);

const GENERIC_FONT_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong",
]);

export function fontFamilyWithEmojiFallback(value) {
  const family = String(value || "sans-serif").trim() || "sans-serif";
  const families = splitFontFamilies(family);
  const withoutEmoji = families.filter((item) => !EMOJI_FONT_NAMES.has(normalizeFontFamily(item)));
  const genericIndex = withoutEmoji.findIndex((item) => GENERIC_FONT_FAMILIES.has(normalizeFontFamily(item)));
  const insertionIndex = genericIndex < 0 ? withoutEmoji.length : genericIndex;
  withoutEmoji.splice(
    insertionIndex,
    0,
    '"Apple Color Emoji"',
    '"Segoe UI Emoji"',
    '"Noto Color Emoji"',
  );
  if (genericIndex < 0) withoutEmoji.push("sans-serif");
  return withoutEmoji.join(", ") || EMOJI_FONT_FALLBACK;
}

export function canvasFontTraits(context, bitmap) {
  const font = String(context?.font || "");
  const weightMatch = font.match(/(?:^|\s)([1-9]00|bold(?:er)?|lighter)(?=\s|$)/iu);
  const styleMatch = font.match(/(?:^|\s)((?:italic|oblique(?:\s+-?\d+(?:\.\d+)?(?:deg|grad|rad|turn))?))(?=\s|$)/iu);
  return {
    fontStyle: bitmap?.fontItalic ? "italic" : styleMatch?.[1] || "normal",
    fontWeight: bitmap?.fontBold ? "700" : weightMatch?.[1] || "400",
    fontKerning: canvasEnum(context?.fontKerning, ["auto", "normal", "none"], "auto"),
    fontStretch: canvasEnum(
      context?.fontStretch,
      [
        "ultra-condensed",
        "extra-condensed",
        "condensed",
        "semi-condensed",
        "normal",
        "semi-expanded",
        "expanded",
        "extra-expanded",
        "ultra-expanded",
      ],
      "normal",
    ),
    fontVariantCaps: canvasEnum(
      context?.fontVariantCaps,
      [
        "normal",
        "small-caps",
        "all-small-caps",
        "petite-caps",
        "all-petite-caps",
        "unicase",
        "titling-caps",
      ],
      "normal",
    ),
    letterSpacing: canvasLength(context?.letterSpacing, "0px"),
    wordSpacing: canvasLength(context?.wordSpacing, "0px"),
    direction: canvasEnum(context?.direction, ["ltr", "rtl", "inherit"], "inherit"),
  };
}

function splitFontFamilies(value) {
  const result = [];
  let current = "";
  let quote = "";

  for (const char of String(value)) {
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? "" : char;
      current += char;
      continue;
    }
    if (char === "," && !quote) {
      if (current.trim()) result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) result.push(current.trim());
  return result;
}

function normalizeFontFamily(value) {
  return String(value || "")
    .trim()
    .replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, "$1$2")
    .toLocaleLowerCase();
}

function canvasEnum(value, allowed, fallback) {
  const normalized = String(value || "").toLocaleLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function canvasLength(value, fallback) {
  const normalized = String(value || "").trim();
  return /^-?\d+(?:\.\d+)?px$/u.test(normalized) ? normalized : fallback;
}

export function cssTransformFromTopLeftCanvasQuad(
  points,
  canvasRect,
  canvasWidth,
  canvasHeight,
  localWidth,
  localHeight,
) {
  if (!Array.isArray(points) || points.length !== 4) return null;
  if (!canvasRect || canvasRect.width <= 0 || canvasRect.height <= 0) return null;

  const width = Number(localWidth);
  const height = Number(localHeight);
  if (!(width > 0) || !(height > 0)) return null;

  const surfaceWidth = Number(canvasWidth) || canvasRect.width;
  const surfaceHeight = Number(canvasHeight) || canvasRect.height;
  const scaleX = canvasRect.width / surfaceWidth;
  const scaleY = canvasRect.height / surfaceHeight;
  const cssPoints = points.map((point) => ({
    x: canvasRect.left + Number(point?.x) * scaleX,
    y: canvasRect.top + Number(point?.y) * scaleY,
  }));
  if (cssPoints.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return null;
  }

  const [topLeft, topRight, , bottomLeft] = cssPoints;
  return {
    left: topLeft.x,
    top: topLeft.y,
    width,
    height,
    matrix: {
      a: (topRight.x - topLeft.x) / width,
      b: (topRight.y - topLeft.y) / width,
      c: (bottomLeft.x - topLeft.x) / height,
      d: (bottomLeft.y - topLeft.y) / height,
    },
    bounds: {
      left: Math.min(...cssPoints.map((point) => point.x)),
      top: Math.min(...cssPoints.map((point) => point.y)),
      right: Math.max(...cssPoints.map((point) => point.x)),
      bottom: Math.max(...cssPoints.map((point) => point.y)),
    },
  };
}
