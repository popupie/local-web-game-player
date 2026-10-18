// @ts-nocheck

import { fontFamilyWithEmojiFallback } from "@/player-runtime/bridge/overlay/textStyle";

export function createTyranoOverlayAdapter({
  domSourceId,
  overlayIsActive,
  overlayState,
  removeEntry,
  scheduleFlush,
  upsertEntry,
}) {
  function install() {
    if (overlayState.tyranoHooksInstalled) return;

    const tryInstall = () => {
      if (overlayState.tyranoHooksInstalled) return true;
      const roots = tyranoRoots();
      if (!roots.length) return false;

      overlayState.tyranoHooksInstalled = true;
      overlayState.tyranoObserver = new MutationObserver(scheduleScan);
      for (const root of roots) {
        overlayState.tyranoObserver.observe(root, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: ["class", "hidden", "style"],
        });
      }
      if (document.fonts) {
        document.fonts.ready.then(scheduleScan);
        document.fonts.addEventListener?.("loadingdone", scheduleScan);
      }
      window.addEventListener("resize", scheduleScan);
      scheduleScan();
      return true;
    };

    if (tryInstall()) return;
    setTimeout(install, 250);
  }

  function scheduleScan() {
    if (!overlayState.tyranoHooksInstalled || overlayState.tyranoScanFrame) return;
    overlayState.tyranoScanFrame = requestAnimationFrame(() => {
      overlayState.tyranoScanFrame = 0;
      scanText();
    });
  }

  function scanText() {
    if (!overlayIsActive()) return;
    const roots = tyranoRoots();
    if (!roots.length) return;

    const sources = new Set();
    for (const root of roots) {
      for (const message of root.querySelectorAll(".message_inner")) {
        const paragraphs = message.querySelectorAll(":scope > p");
        if (!paragraphs.length) {
          sources.add(message);
          continue;
        }
        for (const paragraph of paragraphs) {
          sources.add(paragraph);
        }
      }
      for (const source of root.querySelectorAll(
        ".chara_name_area, [data-event-tag='glink'], .vchat-text-inner",
      )) {
        sources.add(source);
      }
    }

    const activeKeys = new Set();
    for (const source of sources) {
      if (!domSourceIsVisible(source)) continue;

      const sourceKey = `tyrano:${domSourceId(source)}`;
      const renderedLines = source.matches?.(".message_inner > p")
        ? tyranoRenderedLines(source)
        : [];
      if (renderedLines.length) {
        const logText = renderedLines.map((line) => line.text).join("\n");
        for (let index = 0; index < renderedLines.length; index += 1) {
          const line = renderedLines[index];
          const key = `${sourceKey}:line:${index}`;
          activeKeys.add(key);
          upsertEntry(key, tyranoOverlayEntry(source, line.text, {
            domRect: line.rect,
            logText,
            skipTextLog: index > 0,
            styleSource: line.styleSource,
          }));
        }
        continue;
      }

      const text = tyranoSourceText(source);
      if (!text.trim()) continue;
      activeKeys.add(sourceKey);
      upsertEntry(sourceKey, tyranoOverlayEntry(source, text));
    }

    for (const [key, entry] of overlayState.entries) {
      if (entry.domSource && !activeKeys.has(key)) removeEntry(key, entry);
    }
    scheduleFlush();
  }

  return { install, scheduleScan };
}

export function domSourceIsVisible(source) {
  if (!source?.isConnected) return false;
  const style = getComputedStyle(source);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number(style.opacity) === 0
  ) {
    return false;
  }
  const rect = source.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function scaledCssLength(value, scale) {
  const text = String(value || "");
  const match = text.match(/^(-?\d+(?:\.\d+)?)px$/);
  return match ? `${Number(match[1]) * scale}px` : text || "normal";
}

function tyranoRoots() {
  return Array.from(document.querySelectorAll("#tyrano_base, #vchat_base"));
}

export function tyranoSourceText(source) {
  const text = typeof source.innerText === "string" ? source.innerText : source.textContent;
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ");
}

export function tyranoOverlayWhiteSpace(text, computedWhiteSpace) {
  if (!String(text).includes("\n")) return computedWhiteSpace || "pre-wrap";
  return computedWhiteSpace === "pre" ||
    computedWhiteSpace === "pre-wrap" ||
    computedWhiteSpace === "break-spaces"
    ? computedWhiteSpace
    : "pre-wrap";
}

function tyranoOverlayEntry(source, text, options = {}) {
  const boxStyle = getComputedStyle(source);
  const style = getComputedStyle(options.styleSource || source);
  const scale = domVisualScale(source);
  const isMeasuredLine = Boolean(options.domRect);
  return {
    domSource: source,
    domRect: options.domRect,
    text,
    logText: options.logText,
    skipTextLog: options.skipTextLog,
    fontSize: parseCssNumber(style.fontSize) || 24,
    fontFace: fontFamilyWithEmojiFallback(style.fontFamily || "sans-serif"),
    fontStyle: style.fontStyle,
    fontWeight: style.fontWeight,
    fontStretch: style.fontStretch,
    fontVariant: style.fontVariant,
    fontKerning: style.fontKerning,
    fontOpticalSizing: style.fontOpticalSizing,
    fontFeatureSettings: style.fontFeatureSettings,
    fontVariationSettings: style.fontVariationSettings,
    fontSynthesis: style.fontSynthesis,
    lineHeightCss: isMeasuredLine
      ? `${options.domRect.height / scale.y}px`
      : style.lineHeight || "normal",
    textAlign: isMeasuredLine ? "left" : style.textAlign || "left",
    textAlignLast: style.textAlignLast,
    direction: style.direction,
    letterSpacing: style.letterSpacing,
    wordSpacing: style.wordSpacing,
    wordBreak: style.wordBreak,
    overflowWrap: style.overflowWrap,
    whiteSpace: isMeasuredLine ? "pre" : tyranoOverlayWhiteSpace(text, style.whiteSpace),
    writingMode: style.writingMode,
    textOrientation: style.textOrientation,
    textRendering: style.textRendering,
    textTransform: style.textTransform,
    textIndent: isMeasuredLine ? "0px" : style.textIndent,
    textDecorationLine: style.textDecorationLine,
    textDecorationStyle: style.textDecorationStyle,
    textDecorationThickness: style.textDecorationThickness,
    paddingTop: isMeasuredLine ? "0px" : boxStyle.paddingTop,
    paddingRight: isMeasuredLine ? "0px" : boxStyle.paddingRight,
    paddingBottom: isMeasuredLine ? "0px" : boxStyle.paddingBottom,
    paddingLeft: isMeasuredLine ? "0px" : boxStyle.paddingLeft,
    borderTopWidth: isMeasuredLine ? "0px" : boxStyle.borderTopWidth,
    borderRightWidth: isMeasuredLine ? "0px" : boxStyle.borderRightWidth,
    borderBottomWidth: isMeasuredLine ? "0px" : boxStyle.borderBottomWidth,
    borderLeftWidth: isMeasuredLine ? "0px" : boxStyle.borderLeftWidth,
    visualScaleX: scale.x,
    visualScaleY: scale.y,
    updatedAt: performance.now(),
  };
}

function tyranoRenderedLines(source) {
  const writingMode = getComputedStyle(source).writingMode || "horizontal-tb";
  const vertical = writingMode.startsWith("vertical");
  const lines = [];
  const seenSegments = new Set();
  const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node;

  while ((node = walker.nextNode())) {
    if (!tyranoTextNodeIsSemantic(node, source)) continue;
    for (const segment of graphemeSegments(String(node.data || ""))) {
      const text = segment.text.replace(/\u00a0/g, " ");
      if (!text || /[\r\n]/u.test(text)) continue;
      range.setStart(node, segment.index);
      range.setEnd(node, segment.index + segment.text.length);
      const rect = firstRenderedRect(range.getClientRects());
      if (!rect) continue;

      const signature = [
        text,
        Math.round(rect.left * 2),
        Math.round(rect.top * 2),
        Math.round(rect.width * 2),
        Math.round(rect.height * 2),
      ].join(":");
      if (seenSegments.has(signature)) continue;
      seenSegments.add(signature);

      let line = lines.find((candidate) => rectSharesVisualLine(candidate, rect, vertical));
      if (!line) {
        line = {
          text: "",
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          styleSource: node.parentElement || source,
        };
        lines.push(line);
      }
      line.text += text;
      line.left = Math.min(line.left, rect.left);
      line.top = Math.min(line.top, rect.top);
      line.right = Math.max(line.right, rect.right);
      line.bottom = Math.max(line.bottom, rect.bottom);
    }
  }
  range.detach?.();

  lines.sort((a, b) => vertical ? b.left - a.left : a.top - b.top);
  return lines
    .filter((line) => line.text.trim())
    .map((line) => ({
      text: line.text,
      styleSource: line.styleSource,
      rect: {
        left: line.left,
        top: line.top,
        width: Math.max(1, line.right - line.left),
        height: Math.max(1, line.bottom - line.top),
      },
    }));
}

function tyranoTextNodeIsSemantic(node, source) {
  const parent = node.parentElement;
  if (!parent || !source.contains(parent)) return false;
  if (parent.closest(".img_next, .glyph_image, rt")) return false;

  const decoratedCharacter = parent.closest(".char.text-shadow, .char.text-stroke");
  if (!decoratedCharacter || !source.contains(decoratedCharacter)) return true;
  const dummy = parent.closest(".dummy");
  if (!dummy || dummy.parentElement !== decoratedCharacter) return false;
  const dummies = decoratedCharacter.querySelectorAll(":scope > .dummy");
  return dummy === dummies[dummies.length - 1];
}

function graphemeSegments(text) {
  if (typeof Intl?.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (segment) => ({
      index: segment.index,
      text: segment.segment,
    }));
  }
  const output = [];
  let index = 0;
  for (const character of Array.from(text)) {
    output.push({ index, text: character });
    index += character.length;
  }
  return output;
}

function firstRenderedRect(rects) {
  return Array.from(rects).find((rect) =>
    rect.height > 0 &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.right) &&
    Number.isFinite(rect.bottom),
  ) || null;
}

function rectSharesVisualLine(line, rect, vertical) {
  const start = vertical ? "left" : "top";
  const end = vertical ? "right" : "bottom";
  const overlap = Math.min(line[end], rect[end]) - Math.max(line[start], rect[start]);
  const lineSize = line[end] - line[start];
  const rectSize = rect[end] - rect[start];
  return overlap >= Math.min(lineSize, rectSize) * 0.5;
}

function parseCssNumber(value) {
  const parsed = Number.parseFloat(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function domVisualScale(source) {
  const root = source.closest("#tyrano_base, #vchat_base");
  if (!root) return { x: 1, y: 1 };
  const rect = root.getBoundingClientRect();
  const style = getComputedStyle(root);
  const layoutWidth = parseCssNumber(style.width) || root.offsetWidth;
  const layoutHeight = parseCssNumber(style.height) || root.offsetHeight;
  return {
    x: positiveScale(rect.width, layoutWidth),
    y: positiveScale(rect.height, layoutHeight),
  };
}

function positiveScale(rendered, layout) {
  const scale = Number(rendered) / Number(layout);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}
