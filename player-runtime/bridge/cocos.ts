// @ts-nocheck

const COCOS_NAMED_ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: "\u00a0",
  quot: '"',
};

const COCOS_EMOJI_FONT_FALLBACK =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

export function resolveCocosEngine(system) {
  if (!system || typeof system.get !== "function") return null;

  const candidates = [];
  try {
    if (typeof system.resolve === "function") candidates.push(system.resolve("cc"));
  } catch {
    // The import map may not be installed yet.
  }
  candidates.push("cc");

  for (const id of candidates) {
    if (!id) continue;
    try {
      const engine = system.get(id);
      if (isCocosEngine(engine)) return engine;
    } catch {
      // Keep looking through the registry.
    }
  }

  try {
    if (typeof system.entries === "function") {
      for (const [, module] of system.entries()) {
        if (isCocosEngine(module)) return module;
      }
    }
  } catch {
    // A partially initialized SystemJS registry is retried by the caller.
  }

  return null;
}

function isCocosEngine(value) {
  return Boolean(
    value &&
      value.director &&
      typeof value.director.getScene === "function" &&
      value.UITransform &&
      (value.Label || value.RichText),
  );
}

export function plainCocosText(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<img\b[^>]*>/giu, "")
    .replace(/<[^>]+>/gu, "")
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/giu, (entity, decimal, hexadecimal, named) => {
      if (decimal) return safeCodePoint(Number.parseInt(decimal, 10), entity);
      if (hexadecimal) return safeCodePoint(Number.parseInt(hexadecimal, 16), entity);
      return COCOS_NAMED_ENTITIES[String(named).toLowerCase()] ?? entity;
    })
    .replace(/\u00a0/gu, " ")
    .trim();
}

function safeCodePoint(value, fallback) {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) return fallback;
  try {
    return String.fromCodePoint(value);
  } catch {
    return fallback;
  }
}

export function cocosTextAlign(value) {
  const alignment = Number(value);
  if (alignment === 1) return "center";
  if (alignment === 2) return "right";
  return "left";
}

export function cocosVerticalAlignFactor(value) {
  const alignment = Number(value);
  if (alignment === 1) return 0.5;
  if (alignment === 2) return 1;
  return 0;
}

export function cocosFontFamily(source) {
  const renderedFamily = source?.textStyle?.fontFamily || source?._textStyle?.fontFamily;
  const usesSystemFont = source?.useSystemFont ?? source?._isSystemFontUsed;
  const assetFamily = source?.font?._nativeAsset || source?._font?._nativeAsset;
  const systemFamily = source?.fontFamily || source?._fontFamily;
  const family =
    renderedFamily ||
    (usesSystemFont === false ? assetFamily : systemFamily) ||
    assetFamily ||
    systemFamily ||
    "Arial";

  return String(family).trim() || "Arial";
}

export function cocosCssFontFamily(source) {
  const family = cocosFontFamily(source);
  return `${family}, ${COCOS_EMOJI_FONT_FALLBACK}`;
}

export function cocosFontMetrics(source, fallbackRenderScale = 1) {
  const configuredFontSize = firstPositiveNumber(source?.fontSize, source?._fontSize) || 24;
  const renderedFontSize = firstPositiveNumber(source?.actualFontSize, source?._actualFontSize);
  const renderScale =
    firstPositiveNumber(
      source?.textStyle?.fontScale,
      source?._textStyle?.fontScale,
      fallbackRenderScale,
    ) || 1;
  const overflow = Number(source?.overflow ?? source?._overflow);
  const fontSize = overflow === 2 && renderedFontSize
    ? renderedFontSize / renderScale
    : configuredFontSize;
  const configuredLineHeight = firstPositiveNumber(source?.lineHeight, source?._lineHeight);
  const lineHeight = configuredLineHeight
    ? configuredLineHeight * (fontSize / configuredFontSize)
    : fontSize;

  return { fontSize, lineHeight };
}

export function cocosRenderedText(source, fallbackText) {
  const segments = source?._segments;
  if (Array.isArray(segments) && segments.length > 0) {
    const segmentLineCount = segments.reduce(
      (count, segment) => Math.max(count, Number(segment?.lineCount) || 1),
      1,
    );
    const lineCount = Math.max(1, Number(source?._lineCount) || segmentLineCount);
    const lines = Array.from({ length: lineCount }, () => "");
    let hasText = false;

    for (const segment of segments) {
      const value = segment?.comp?.string ?? segment?.comp?._string;
      if (value === undefined || value === null) continue;
      const index = Math.min(lineCount - 1, Math.max(0, (Number(segment?.lineCount) || 1) - 1));
      lines[index] += String(value);
      hasText = true;
    }

    if (hasText) return lines.join("\n");
  }

  const layoutData = source?.textLayoutData || source?._textLayoutData;
  if (Array.isArray(layoutData?.parsedString) && layoutData.parsedString.length > 0) {
    return layoutData.parsedString.map((line) => String(line ?? "")).join("\n");
  }

  return String(fallbackText ?? "");
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}

export function cocosWorldToScreen(camera, Vec3, world) {
  if (!camera || typeof camera.worldToScreen !== "function" || typeof Vec3 !== "function") {
    return null;
  }
  return camera.worldToScreen(new Vec3(), world);
}

export function cocosCssRectFromScreenPoints(points, canvasRect, canvasWidth, canvasHeight) {
  if (!Array.isArray(points) || points.length < 2) return null;
  if (!canvasRect || canvasRect.width <= 0 || canvasRect.height <= 0) return null;

  const finitePoints = points.filter(
    (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y),
  );
  if (finitePoints.length !== points.length) return null;

  const pixelWidth = Number(canvasWidth) || canvasRect.width;
  const pixelHeight = Number(canvasHeight) || canvasRect.height;
  const scaleX = canvasRect.width / pixelWidth;
  const scaleY = canvasRect.height / pixelHeight;
  const minX = Math.min(...finitePoints.map((point) => point.x));
  const maxX = Math.max(...finitePoints.map((point) => point.x));
  const minY = Math.min(...finitePoints.map((point) => point.y));
  const maxY = Math.max(...finitePoints.map((point) => point.y));

  return {
    left: canvasRect.left + minX * scaleX,
    top: canvasRect.top + (pixelHeight - maxY) * scaleY,
    width: Math.max(1, (maxX - minX) * scaleX),
    height: Math.max(1, (maxY - minY) * scaleY),
  };
}

export function cocosCssTransformFromScreenPoints(
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

  const pixelWidth = Number(canvasWidth) || canvasRect.width;
  const pixelHeight = Number(canvasHeight) || canvasRect.height;
  const scaleX = canvasRect.width / pixelWidth;
  const scaleY = canvasRect.height / pixelHeight;
  const cssPoints = points.map((point) => ({
    x: canvasRect.left + Number(point?.x) * scaleX,
    y: canvasRect.top + (pixelHeight - Number(point?.y)) * scaleY,
  }));
  if (cssPoints.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return null;
  }

  const [bottomLeft, , topRight, topLeft] = cssPoints;
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
