// @ts-nocheck

import {
  contentGeometry,
  displayObjectIsVisible,
  displayObjectPageBounds,
  findBitmapSprite,
  intersectRects,
  roundCssPixel,
} from "@/player-runtime/bridge/overlay/geometry";

export function createOverlayRenderer({
  cocosSourceIsVisible,
  construct2SourceIsVisible,
  construct2TextSegments,
  domSourceIsVisible,
  ensureOverlayDom,
  overlayIsActive,
  overlayState,
  removeEntry,
  scaledCssLength,
}) {
  function scheduleFlush() {
    if (overlayState.raf) return;
    overlayState.raf = requestAnimationFrame(() => {
      overlayState.raf = 0;
      flushOverlay();
    });
  }

  function flushOverlay() {
    ensureOverlayDom();
    if (!overlayIsActive()) return;

    for (const [key, entry] of overlayState.entries) {
      if (!entryIsVisible(entry)) {
        if (retainOpeningRpgMakerNameEntry(entry)) continue;
        removeEntry(key, entry);
        continue;
      }

      const rect = toPageRect(entry);
      if (!rect) {
        removeEntry(key, entry);
        continue;
      }

      if (!entry.element) {
        const rpgSource = !entry.domSource && !entry.constructSource && !entry.cocosSource;
        entry.element = document.createElement(entry.domSource ? "div" : "span");
        entry.element.className = entry.domSource
          ? "mz-player-text-overlay-entry mz-player-text-overlay-entry-dom"
          : entry.constructSource
            ? "mz-player-text-overlay-entry mz-player-text-overlay-entry-construct2"
            : entry.cocosSource
              ? "mz-player-text-overlay-entry mz-player-text-overlay-entry-cocos"
              : "mz-player-text-overlay-entry mz-player-text-overlay-entry-rpg";
        if (rpgSource) {
          entry.textElement = document.createElement("span");
          entry.textElement.className = "mz-player-text-overlay-entry-rpg-text";
          entry.element.appendChild(entry.textElement);
        }
        overlayState.root.appendChild(entry.element);
      }

      if (entry.constructSource) {
        layoutConstruct2Entry(entry, rect);
      } else {
        const displayText = entry.cocosSource ? entry.displayText || entry.text : entry.text;
        const textElement = entry.textElement || entry.element;
        if (textElement.textContent !== displayText) textElement.textContent = displayText;
      }
      entry.element.setAttribute("aria-label", entry.text);
      entry.element.dataset.rpgText = entry.text;
      entry.element.dataset.gameText = entry.text;
      entry.element.removeAttribute("title");
      const isChoice = Number.isInteger(entry.choiceIndex);
      entry.element.classList.toggle("mz-player-text-overlay-entry-choice", isChoice);
      if (isChoice) {
        entry.element.setAttribute("role", "option");
        entry.element.setAttribute("aria-selected", String(Number(entry.owner?.index?.()) === entry.choiceIndex));
        entry.element.dataset.choiceIndex = String(entry.choiceIndex);
      } else {
        entry.element.removeAttribute("role");
        entry.element.removeAttribute("aria-selected");
        delete entry.element.dataset.choiceIndex;
      }

      setStyleIfChanged(entry.element, "left", `${rect.left}px`);
      setStyleIfChanged(entry.element, "top", `${rect.top}px`);
      setStyleIfChanged(entry.element, "width", `${Math.max(1, rect.width)}px`);
      setStyleIfChanged(entry.element, "height", `${Math.max(1, rect.height)}px`);
      setStyleIfChanged(entry.element, "textAlign", entry.textAlign || "left");
      const usesEngineTransform = entry.cocosSource || entry.constructSource;
      setStyleIfChanged(entry.element, "transformOrigin", usesEngineTransform ? "0 0" : "");
      setStyleIfChanged(entry.element, "transform", usesEngineTransform ? rect.transform || "none" : "");
      if (entry.domSource) {
        const scaleX = entry.visualScaleX || 1;
        const scaleY = entry.visualScaleY || 1;
        const fontSize = Math.max(1, (entry.fontSize || rect.fontSize) * scaleY);
        setStyleIfChanged(entry.element, "fontFamily", entry.fontFace || "sans-serif");
        setStyleIfChanged(entry.element, "fontSize", `${fontSize}px`);
        setStyleIfChanged(entry.element, "fontStyle", entry.fontStyle || "normal");
        setStyleIfChanged(entry.element, "fontWeight", entry.fontWeight || "normal");
        setStyleIfChanged(entry.element, "fontStretch", entry.fontStretch || "normal");
        setStyleIfChanged(entry.element, "fontVariant", entry.fontVariant || "normal");
        setStyleIfChanged(entry.element, "fontKerning", entry.fontKerning || "auto");
        setStyleIfChanged(entry.element, "fontOpticalSizing", entry.fontOpticalSizing || "auto");
        setStyleIfChanged(entry.element, "fontFeatureSettings", entry.fontFeatureSettings || "normal");
        setStyleIfChanged(entry.element, "fontVariationSettings", entry.fontVariationSettings || "normal");
        setStyleIfChanged(entry.element, "fontSynthesis", entry.fontSynthesis || "weight style small-caps");
        setStyleIfChanged(entry.element, "lineHeight", scaledCssLength(entry.lineHeightCss, scaleY));
        setStyleIfChanged(entry.element, "whiteSpace", entry.whiteSpace || "pre-wrap");
        setStyleIfChanged(entry.element, "direction", entry.direction || "ltr");
        setStyleIfChanged(entry.element, "letterSpacing", scaledCssLength(entry.letterSpacing, scaleX));
        setStyleIfChanged(entry.element, "wordSpacing", scaledCssLength(entry.wordSpacing, scaleX));
        setStyleIfChanged(entry.element, "wordBreak", entry.wordBreak || "normal");
        setStyleIfChanged(entry.element, "overflowWrap", entry.overflowWrap || "normal");
        setStyleIfChanged(entry.element, "writingMode", entry.writingMode || "horizontal-tb");
        setStyleIfChanged(entry.element, "textOrientation", entry.textOrientation || "mixed");
        setStyleIfChanged(entry.element, "textRendering", entry.textRendering || "auto");
        setStyleIfChanged(entry.element, "textTransform", entry.textTransform || "none");
        setStyleIfChanged(entry.element, "textAlignLast", entry.textAlignLast || "auto");
        setStyleIfChanged(entry.element, "textIndent", scaledCssLength(entry.textIndent, scaleX));
        setStyleIfChanged(entry.element, "textDecorationLine", entry.textDecorationLine || "none");
        setStyleIfChanged(entry.element, "textDecorationStyle", entry.textDecorationStyle || "solid");
        setStyleIfChanged(entry.element, "textDecorationThickness", scaledCssLength(entry.textDecorationThickness, scaleY));
        setStyleIfChanged(entry.element, "paddingTop", scaledCssLength(entry.paddingTop, scaleY));
        setStyleIfChanged(entry.element, "paddingRight", scaledCssLength(entry.paddingRight, scaleX));
        setStyleIfChanged(entry.element, "paddingBottom", scaledCssLength(entry.paddingBottom, scaleY));
        setStyleIfChanged(entry.element, "paddingLeft", scaledCssLength(entry.paddingLeft, scaleX));
        setStyleIfChanged(entry.element, "boxSizing", "border-box");
        setStyleIfChanged(entry.element, "borderStyle", "solid");
        setStyleIfChanged(entry.element, "borderColor", "transparent");
        setStyleIfChanged(entry.element, "borderTopWidth", scaledCssLength(entry.borderTopWidth, scaleY));
        setStyleIfChanged(entry.element, "borderRightWidth", scaledCssLength(entry.borderRightWidth, scaleX));
        setStyleIfChanged(entry.element, "borderBottomWidth", scaledCssLength(entry.borderBottomWidth, scaleY));
        setStyleIfChanged(entry.element, "borderLeftWidth", scaledCssLength(entry.borderLeftWidth, scaleX));
      } else if (entry.constructSource) {
        setStyleIfChanged(entry.element, "whiteSpace", "pre");
      } else if (entry.cocosSource) {
        setStyleIfChanged(entry.element, "whiteSpace", "pre");
        setStyleIfChanged(entry.element, "fontFamily", entry.fontFace || "sans-serif");
        setStyleIfChanged(entry.element, "fontSize", `${Math.max(1, rect.fontSize)}px`);
        setStyleIfChanged(entry.element, "fontStyle", entry.fontStyle || "normal");
        setStyleIfChanged(entry.element, "fontWeight", entry.fontWeight || "400");
        setStyleIfChanged(entry.element, "fontKerning", "auto");
        setStyleIfChanged(entry.element, "fontVariantLigatures", "normal");
        setStyleIfChanged(entry.element, "textDecorationLine", entry.textDecoration || "none");
        setStyleIfChanged(entry.element, "lineHeight", `${Math.max(1, entry.lineHeight || rect.fontSize * 1.2)}px`);
        setStyleIfChanged(entry.element, "paddingTop", `${Math.max(0, entry.paddingTop || 0)}px`);
      } else {
        const textElement = entry.textElement || entry.element;
        const textRect = rect.textRect || {
          left: 0,
          top: 0,
          width: rect.width,
          height: rect.height,
          baselineOffset: rect.baselineOffset,
        };
        setStyleIfChanged(textElement, "left", `${roundCssPixel(textRect.left)}px`);
        setStyleIfChanged(textElement, "top", `${roundCssPixel(textRect.top)}px`);
        setStyleIfChanged(textElement, "width", `${Math.max(1, roundCssPixel(textRect.width))}px`);
        setStyleIfChanged(textElement, "height", `${Math.max(1, roundCssPixel(textRect.height))}px`);
        setStyleIfChanged(textElement, "whiteSpace", "pre");
        setStyleIfChanged(textElement, "fontFamily", entry.fontFace || "sans-serif");
        setStyleIfChanged(textElement, "fontSize", `${Math.max(1, rect.fontSize)}px`);
        setStyleIfChanged(textElement, "fontStyle", entry.fontStyle || "normal");
        setStyleIfChanged(textElement, "fontWeight", entry.fontWeight || "400");
        setStyleIfChanged(textElement, "fontStretch", entry.fontStretch || "normal");
        setStyleIfChanged(textElement, "fontVariantCaps", entry.fontVariantCaps || "normal");
        setStyleIfChanged(textElement, "fontKerning", entry.fontKerning || "auto");
        setStyleIfChanged(textElement, "fontVariantLigatures", "normal");
        setStyleIfChanged(textElement, "fontSynthesis", "weight style");
        setStyleIfChanged(textElement, "letterSpacing", entry.letterSpacing || "0px");
        setStyleIfChanged(textElement, "wordSpacing", entry.wordSpacing || "0px");
        setStyleIfChanged(textElement, "direction", entry.direction === "rtl" ? "rtl" : "ltr");
        setStyleIfChanged(textElement, "textAlign", entry.textAlign || "left");
        setStyleIfChanged(textElement, "textRendering", "auto");
        if (Number.isFinite(textRect.baselineOffset)) {
          const domBaseline = domTextBaselineOffset(entry, rect.fontSize);
          const baselineShift = textRect.baselineOffset - domBaseline;
          setStyleIfChanged(textElement, "lineHeight", "normal");
          setStyleIfChanged(textElement, "transformOrigin", "0 0");
          setStyleIfChanged(textElement, "transform", `translateY(${roundCssPixel(baselineShift)}px)`);
        } else {
          setStyleIfChanged(textElement, "lineHeight", `${Math.max(1, textRect.height)}px`);
          setStyleIfChanged(textElement, "transformOrigin", "");
          setStyleIfChanged(textElement, "transform", "");
        }
      }
    }
  }

  function layoutConstruct2Entry(entry, rect) {
    const source = entry.constructSource;
    const sourceWidth = Math.abs(Number(source.width));
    const sourceHeight = Math.abs(Number(source.height));
    const characterHeight = Number(source.characterHeight);
    const characterScale = Number(source.characterScale) || 1;
    const lines = Array.isArray(source.lines)
      ? source.lines.map((line) => ({
          text: String(line?.text ?? ""),
          width: Math.max(0, Number(line?.width) || 0),
        }))
      : [];
    const canPlaceSpritefontLines =
      sourceWidth > 0 &&
      sourceHeight > 0 &&
      characterHeight > 0 &&
      lines.length > 0;

    if (!canPlaceSpritefontLines) {
      if (entry.renderedConstructText !== entry.text || entry.constructLineElements) {
        entry.element.textContent = entry.text;
        entry.constructLineElements = null;
        entry.renderedConstructText = entry.text;
      }
      setStyleIfChanged(entry.element, "fontFamily", entry.fontFace || "sans-serif");
      setStyleIfChanged(entry.element, "fontSize", `${Math.max(1, rect.fontSize)}px`);
      setStyleIfChanged(entry.element, "fontStyle", entry.fontStyle || "normal");
      setStyleIfChanged(entry.element, "fontWeight", entry.fontWeight || "400");
      setStyleIfChanged(entry.element, "lineHeight", `${Math.max(1, rect.lineHeight || rect.fontSize * 1.2)}px`);
      setStyleIfChanged(entry.element, "paddingTop", `${Math.max(0, rect.paddingTop || 0)}px`);
      return;
    }

    const characterWidth = Math.max(1, Number(source.characterWidth) || characterHeight);
    const characterSpacing = Number(source.characterSpacing) || 0;
    const lineSignature = [
      characterWidth,
      characterScale,
      characterSpacing,
      lines.map((line) => `${line.width}:${line.text}`).join("\n"),
    ].join("|");
    if (entry.constructLineSignature !== lineSignature || !entry.constructLineElements) {
      entry.element.textContent = "";
      entry.constructLineElements = lines.map((line) => {
        const element = document.createElement("span");
        element.className = "mz-player-text-overlay-entry-construct2-line";
        element.setAttribute("aria-label", line.text);
        element.replaceChildren(
          ...construct2TextSegments(line.text).map((character) => {
            const characterElement = document.createElement("span");
            characterElement.className = "mz-player-text-overlay-entry-construct2-character";
            characterElement.textContent = character;
            return characterElement;
          }),
        );
        entry.element.appendChild(element);
        return element;
      });
      entry.constructLineSignature = lineSignature;
      entry.renderedConstructText = entry.text;
    }
    setStyleIfChanged(entry.element, "paddingTop", "0px");

    if (!overlayState.measureContext) {
      overlayState.measureContext = document.createElement("canvas").getContext("2d");
    }
    const scaleX = rect.width / sourceWidth;
    const scaleY = rect.height / sourceHeight;
    const cellHeight = Math.max(1, characterHeight * characterScale * scaleY);
    const lineStep = Math.max(
      1,
      (characterHeight * characterScale + (Number(source.lineHeight) || 0)) * scaleY,
    );
    const fontSize = Math.max(1, cellHeight * 0.78);
    const font = `${entry.fontStyle || "normal"} ${entry.fontWeight || "400"} ${fontSize}px ${entry.fontFace || "sans-serif"}`;
    const textHeight = Math.max(0, Number(source.textHeight) || 0);
    const verticalOffset =
      (Number(source.valign) || 0) * Math.max(0, sourceHeight - textHeight) * scaleY +
      (Number(source.lineHeight) || 0) * scaleY;
    const horizontalAlignment = Number(source.halign) || 0;
    const context = overlayState.measureContext;
    if (context) context.font = font;

    for (let index = 0; index < entry.constructLineElements.length; index += 1) {
      const element = entry.constructLineElements[index];
      const line = lines[index];
      const targetWidth = Math.max(1, line.width * scaleX);
      const left = horizontalAlignment * Math.max(0, sourceWidth - line.width) * scaleX;
      const top = verticalOffset + index * lineStep;

      setStyleIfChanged(element, "left", `${roundCssPixel(left)}px`);
      setStyleIfChanged(element, "top", `${roundCssPixel(top)}px`);
      setStyleIfChanged(element, "width", `${roundCssPixel(targetWidth)}px`);
      setStyleIfChanged(element, "height", `${roundCssPixel(cellHeight)}px`);
      setStyleIfChanged(element, "font", font);
      setStyleIfChanged(element, "lineHeight", `${roundCssPixel(cellHeight)}px`);
      setStyleIfChanged(element, "transform", "");

      let characterX = 0;
      const characterElements = [...element.children];
      const characters = construct2TextSegments(line.text);
      for (let characterIndex = 0; characterIndex < characters.length; characterIndex += 1) {
        const character = characters[characterIndex];
        const characterElement = characterElements[characterIndex];
        if (!characterElement) continue;
        let renderedCharacterWidth = 0;
        for (let unitIndex = 0; unitIndex < character.length; unitIndex += 1) {
          let advanceWidth = characterWidth;
          try {
            advanceWidth = Math.max(
              0,
              Number(source.getCharacterWidth?.(character.charAt(unitIndex))) || characterWidth,
            );
          } catch {
            advanceWidth = characterWidth;
          }
          renderedCharacterWidth += advanceWidth * characterScale;
          if (unitIndex + 1 < character.length) renderedCharacterWidth += characterSpacing;
        }
        const measuredCharacterWidth = Math.max(
          1,
          context?.measureText(character).width || renderedCharacterWidth,
        );
        setStyleIfChanged(characterElement, "left", `${roundCssPixel(characterX * scaleX)}px`);
        setStyleIfChanged(
          characterElement,
          "transform",
          `scaleX(${renderedCharacterWidth * scaleX / measuredCharacterWidth})`,
        );
        characterX += renderedCharacterWidth + characterSpacing;
      }
    }
  }

  function setStyleIfChanged(element, name, value) {
    if (element.style[name] !== value) element.style[name] = value;
  }

  function refreshRpgMakerFontMetrics() {
    overlayState.baselineProbeCache.clear();
    scheduleFlush();
  }

  function domTextBaselineOffset(entry, fontSize) {
    const size = Math.max(1, Number(fontSize) || 24);
    const sample = String(entry.text || "Hg").slice(0, 64) || "Hg";
    const key = [
      entry.fontFace || "sans-serif",
      size,
      entry.fontStyle || "normal",
      entry.fontWeight || "400",
      entry.fontStretch || "normal",
      entry.fontVariantCaps || "normal",
      entry.letterSpacing || "0px",
      sample,
    ].join("|");
    const cached = overlayState.baselineProbeCache.get(key);
    if (Number.isFinite(cached)) return cached;

    const probe = document.createElement("span");
    probe.style.position = "fixed";
    probe.style.left = "-10000px";
    probe.style.top = "0";
    probe.style.display = "inline-block";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    probe.style.whiteSpace = "pre";
    probe.style.padding = "0";
    probe.style.margin = "0";
    probe.style.border = "0";
    probe.style.lineHeight = "normal";
    probe.style.fontFamily = entry.fontFace || "sans-serif";
    probe.style.fontSize = `${size}px`;
    probe.style.fontStyle = entry.fontStyle || "normal";
    probe.style.fontWeight = entry.fontWeight || "400";
    probe.style.fontStretch = entry.fontStretch || "normal";
    probe.style.fontVariantCaps = entry.fontVariantCaps || "normal";
    probe.style.fontKerning = entry.fontKerning || "auto";
    probe.style.fontSynthesis = "weight style";
    probe.style.letterSpacing = entry.letterSpacing || "0px";
    probe.append(document.createTextNode(sample));

    const marker = document.createElement("span");
    marker.style.display = "inline-block";
    marker.style.width = "0";
    marker.style.height = "0";
    marker.style.padding = "0";
    marker.style.margin = "0";
    marker.style.border = "0";
    probe.appendChild(marker);
    document.documentElement.appendChild(probe);
    const value = marker.getBoundingClientRect().top - probe.getBoundingClientRect().top;
    probe.remove();
    const result = Number.isFinite(value) ? value : size;
    overlayState.baselineProbeCache.set(key, result);
    return result;
  }

  function entryIsVisible(entry) {
    if (entry.domSource) return domSourceIsVisible(entry.domSource);
    if (entry.constructSource) return construct2SourceIsVisible(entry.constructSource);
    if (entry.cocosSource) return cocosSourceIsVisible(entry.cocosSource);
    const owner = entry.owner;
    if (!owner || owner.destroyed || !owner.parent) return false;
    if (!ownerBelongsToActiveScene(owner)) return false;
    const openingNameWindow =
      /(?:namebox|namewindow)/iu.test(String(owner.constructor?.name || "")) &&
      typeof owner.isOpening === "function" &&
      owner.isOpening();
    if (typeof owner.isClosed === "function" && owner.isClosed() && !openingNameWindow) return false;
    if (entry.choiceSprite && !displayObjectIsVisible(entry.choiceSprite)) return false;
    const bitmapSprite = findBitmapSprite(owner, entry.bitmap);
    if (bitmapSprite && !displayObjectIsVisible(bitmapSprite)) return false;
    return displayObjectIsVisible(owner);
  }

  function retainOpeningRpgMakerNameEntry(entry) {
    if (entry.domSource || entry.constructSource || entry.cocosSource) return false;
    const owner = entry.owner;
    if (!owner || owner.destroyed || !owner.parent) return false;
    if (!/(?:namebox|namewindow)/iu.test(String(owner.constructor?.name || ""))) return false;
    return owner.active === true || (typeof owner.isOpening === "function" && owner.isOpening());
  }

  function ownerBelongsToActiveScene(owner) {
    const scene = currentScene();
    if (!scene) return true;
    return ownerBelongsToScene(owner, scene);
  }

  function ownerBelongsToScene(owner, scene) {
    let current = owner;
    let guard = 0;
    while (current && guard++ < 30) {
      if (current === scene) return true;
      current = current.parent;
    }
    return false;
  }

  function currentScene() {
    return window.SceneManager?._scene || overlayState.lastScene || null;
  }

  function toPageRect(entry) {
    if (entry.constructSource) return entry.constructRect || null;
    if (entry.cocosSource) return entry.cocosRect || null;
    if (entry.domSource) {
      const rect = entry.domRect || entry.domSource.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return {
        left: roundCssPixel(rect.left),
        top: roundCssPixel(rect.top),
        width: roundCssPixel(rect.width),
        height: roundCssPixel(rect.height),
        fontSize: entry.fontSize || 24,
      };
    }

    const graphics = window.Graphics;
    const canvas = graphics && graphics._canvas;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const scaleX = rect.width / (graphics.width || canvas.width || rect.width || 1);
    const scaleY = rect.height / (graphics.height || canvas.height || rect.height || 1);
    const content = contentGeometry(entry);
    const clipped = intersectRects(entry, {
      x: content.originX,
      y: content.originY,
      width: content.visibleWidth,
      height: content.visibleHeight,
    });
    if (!clipped || clipped.width <= 0 || clipped.height <= 0) return null;

    const pageLeft = rect.left + (content.x - content.originX + clipped.x) * scaleX;
    const pageTop = rect.top + (content.y - content.originY + clipped.y) * scaleY;
    const pageWidth = clipped.width * scaleX;
    const pageHeight = clipped.height * scaleY;

    if (pageLeft >= rect.right || pageTop >= rect.bottom || pageLeft + pageWidth <= rect.left || pageTop + pageHeight <= rect.top) return null;

    const textRect = {
      left: roundCssPixel(pageLeft),
      top: roundCssPixel(pageTop),
      width: roundCssPixel(pageWidth),
      height: roundCssPixel(pageHeight),
      fontSize: roundCssPixel((entry.fontSize || entry.height || 24) * scaleY),
      baselineOffset: Number.isFinite(entry.baseline)
        ? roundCssPixel((entry.baseline - clipped.y) * scaleY)
        : undefined,
      sourceX: clipped.x,
      sourceScaleX: scaleX,
    };

    const choiceRect = choicePageRect(entry, canvas, rect, graphics, content, scaleX, scaleY);
    if (!choiceRect) {
      return {
        ...textRect,
        textRect: {
          left: 0,
          top: 0,
          width: textRect.width,
          height: textRect.height,
          baselineOffset: textRect.baselineOffset,
          sourceX: textRect.sourceX,
          sourceScaleX: textRect.sourceScaleX,
        },
      };
    }

    return {
      ...choiceRect,
      fontSize: textRect.fontSize,
      textRect: {
        left: textRect.left - choiceRect.left,
        top: textRect.top - choiceRect.top,
        width: textRect.width,
        height: textRect.height,
        baselineOffset: textRect.baselineOffset,
        sourceX: textRect.sourceX,
        sourceScaleX: textRect.sourceScaleX,
      },
    };
  }

  function choicePageRect(entry, canvas, canvasRect, graphics, content, scaleX, scaleY) {
    if (!Number.isInteger(entry.choiceIndex)) return null;
    if (entry.choiceSprite) {
      return displayObjectPageBounds(
        entry.choiceSprite,
        canvasRect,
        graphics.width || canvas.width,
        graphics.height || canvas.height,
      );
    }
    if (!entry.choiceLocalRect) return null;

    const clipped = intersectRects(entry.choiceLocalRect, {
      x: content.originX,
      y: content.originY,
      width: content.visibleWidth,
      height: content.visibleHeight,
    });
    if (!clipped) return null;
    return {
      left: roundCssPixel(canvasRect.left + (content.x - content.originX + clipped.x) * scaleX),
      top: roundCssPixel(canvasRect.top + (content.y - content.originY + clipped.y) * scaleY),
      width: roundCssPixel(clipped.width * scaleX),
      height: roundCssPixel(clipped.height * scaleY),
    };
  }
  return {
    entryIsVisible,
    ownerBelongsToScene,
    refreshRpgMakerFontMetrics,
    scheduleFlush,
  };
}
