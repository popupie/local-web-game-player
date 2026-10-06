const decoder = new TextDecoder("utf-8", { fatal: true });

export function adaptWolfGameIni(text: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  let result = text;
  for (const [key, value] of [
    ["ClipBoard_Use", "1"],
    ["MainText_to_ClipBoard", "1"],
  ]) {
    const pattern = new RegExp(`^(\\s*${key}\\s*=).*$`, "im");
    if (pattern.test(result)) {
      result = result.replace(pattern, `$1${value}`);
    } else {
      if (result && !result.endsWith("\n")) result += eol;
      result += `${key}=${value}${eol}`;
    }
  }
  return result;
}

export function adaptWolfGameIniBytes(data: Uint8Array): Uint8Array {
  const source = new TextDecoder().decode(data);
  const result = adaptWolfGameIni(source);
  return result === source ? data : new TextEncoder().encode(result);
}

export type WolfRuntimeTextState = {
  message: string;
  choices: string[];
  selectedChoice: number;
};

export type WolfTextBounds = {
  fontSize: number;
  height: number;
  left: number;
  lines: Array<{
    height: number;
    left: number;
    top: number;
    width: number;
  }>;
  lineHeight: number;
  score: number;
  top: number;
  width: number;
};

const WOLF_RUNTIME_PROFILE = {
  messageAddress: 4_591_800,
  choiceAddress: 4_591_836,
  choicePositionAddress: 4_591_992,
  messageSignatureAddress: 33_990,
  choiceSignatureAddress: 34_010,
  messageSignature: 'message_text_json="',
  choiceSignature: 'choice_text_json="',
};

function hasAscii(heap: Uint8Array, address: number, value: string) {
  if (address < 0 || address + value.length > heap.byteLength) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (heap[address + index] !== value.charCodeAt(index)) return false;
  }
  return true;
}

function readWolfRuntimeString(
  heap: Uint8Array,
  view: DataView,
  address: number,
  maximumBytes: number,
) {
  if (address < 0 || address + 12 > heap.byteLength) return undefined;
  const pointer = view.getUint32(address, true);
  const byteLength = view.getUint32(address + 4, true);
  const capacity = view.getUint32(address + 8, true) & 0x7fff_ffff;
  if (byteLength === 0) return "";
  if (
    pointer < 64 * 1024
    || byteLength > maximumBytes
    || capacity < byteLength
    || pointer + byteLength > heap.byteLength
  ) return undefined;
  try {
    return decoder.decode(heap.subarray(pointer, pointer + byteLength));
  } catch {
    return undefined;
  }
}

function normalizeWolfRuntimeField(value: string, maximumLines: number) {
  const text = value
    .replace(/\\(?:c|cdb|font|i|s|size)\[[^\]]*\]/giu, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "")
    .trim();
  if (!text || text.split("\n").length > maximumLines) return "";
  return text;
}

export function readWolfRuntimeTextState(
  signedHeap: Int8Array | undefined,
): WolfRuntimeTextState | undefined {
  if (!signedHeap || signedHeap.byteLength <= WOLF_RUNTIME_PROFILE.choicePositionAddress + 4) {
    return undefined;
  }
  const heap = new Uint8Array(signedHeap.buffer, signedHeap.byteOffset, signedHeap.byteLength);
  if (
    !hasAscii(heap, WOLF_RUNTIME_PROFILE.messageSignatureAddress, WOLF_RUNTIME_PROFILE.messageSignature)
    || !hasAscii(heap, WOLF_RUNTIME_PROFILE.choiceSignatureAddress, WOLF_RUNTIME_PROFILE.choiceSignature)
  ) return undefined;
  const view = new DataView(heap.buffer, heap.byteOffset, heap.byteLength);
  const rawMessage = readWolfRuntimeString(
    heap,
    view,
    WOLF_RUNTIME_PROFILE.messageAddress,
    4_000,
  );
  const rawChoices = readWolfRuntimeString(
    heap,
    view,
    WOLF_RUNTIME_PROFILE.choiceAddress,
    2_000,
  );
  if (rawMessage === undefined || rawChoices === undefined) return undefined;
  const message = normalizeWolfRuntimeField(rawMessage, 12);
  const choices = normalizeWolfRuntimeField(rawChoices, 64)
    .split("\n")
    .map((choice) => choice.trim())
    .filter(Boolean);
  const selectedChoice = view.getInt32(WOLF_RUNTIME_PROFILE.choicePositionAddress, true);
  return {
    message,
    choices,
    selectedChoice: selectedChoice >= 0 && selectedChoice < choices.length ? selectedChoice : -1,
  };
}

export function normalizeWolfMessage(value: string): string | undefined {
  const text = value
    .replace(/\\(?:c|cdb|font|i|s|size)\[[^\]]*\]/giu, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!text || text.length > 4096) return undefined;
  if (text.split("\n").length > 12) return undefined;
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(text)) return undefined;
  if (/^\d+(?:[.,]\d+)?%$/u.test(text)) return undefined;
  if (/(?:GameCache|[\\/]Data[\\/]|[\\/]Save[\\/])/iu.test(text)) return undefined;
  if (/[\\/].*\.(?:dat|ini|json|mps|png|jpe?g|webp|ogg|mp3|wav|mid|ttf|wolfx?)$/iu.test(text)) return undefined;
  if (/^[A-Za-z]{2,8}\.\d+$/u.test(text) || /^\.?[A-Za-z0-9_]{1,8}\.(?:png|dat|ini|json)$/iu.test(text)) return undefined;
  if (/\b(?:aoTuV|Emscripten|libogg|libvorbis|OpenAL|SDL|WebGL|Xiph\.Org)\b/iu.test(text)) return undefined;
  if (!/[\p{L}\p{N}\p{P}\p{S}]/u.test(text)) return undefined;
  return text;
}

function approximateTextWidth(text: string) {
  let width = 0;
  for (const character of text) {
    if (/[ぁ-んァ-ヶ一-龠々가-힣]/u.test(character)) width += 1;
    else if (/\s/u.test(character)) width += 0.38;
    else if (/[A-Z0-9]/u.test(character)) width += 0.64;
    else if (/[a-z]/u.test(character)) width += 0.54;
    else if (/\p{P}/u.test(character)) width += 0.48;
    else width += 0.75;
  }
  return Math.max(1, width);
}

// The text itself comes from Browser Woditor's verified runtime fields. Pixel
// inspection is used only to place that known text over its canvas glyphs.
export function findWolfTextBounds(
  pixels: Uint8Array,
  width: number,
  height: number,
  text: string,
): WolfTextBounds | undefined {
  if (width <= 0 || height <= 0 || pixels.byteLength < width * height * 4) return undefined;
  const expectedLines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (expectedLines.length === 0 || expectedLines.length > 32) return undefined;
  const minimumRowPixels = Math.max(3, Math.floor(width / 320));
  const rows: Array<{ y: number; count: number; minX: number; maxX: number }> = [];
  for (let screenY = 0; screenY < height; screenY += 1) {
    let count = 0;
    let minX = width;
    let maxX = -1;
    for (let x = 0; x < width; x += 1) {
      const offset = (screenY * width + x) * 4;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const alpha = pixels[offset + 3];
      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      // Browser Woditor renders its default text close to white. Requiring a
      // bright, nearly neutral pixel avoids treating pale window backgrounds
      // as text, which made the old detector select most of the canvas.
      if (alpha > 80 && minimum >= 190 && maximum - minimum <= 64) {
        count += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
    if (count >= minimumRowPixels) rows.push({ y: screenY, count, minX, maxX });
  }

  const rawGroups: Array<{
    top: number;
    bottom: number;
    left: number;
    right: number;
    pixels: number;
  }> = [];
  for (const row of rows) {
    const previous = rawGroups.at(-1);
    if (previous && row.y - previous.bottom <= 2) {
      previous.bottom = row.y;
      previous.left = Math.min(previous.left, row.minX);
      previous.right = Math.max(previous.right, row.maxX);
      previous.pixels += row.count;
    } else {
      rawGroups.push({
        top: row.y,
        bottom: row.y,
        left: row.minX,
        right: row.maxX,
        pixels: row.count,
      });
    }
  }
  const groups = rawGroups.map((group) => {
    const groupHeight = group.bottom - group.top + 1;
    const columnCounts = new Uint16Array(group.right - group.left + 1);
    for (let y = group.top; y <= group.bottom; y += 1) {
      for (let x = group.left; x <= group.right; x += 1) {
        const offset = (y * width + x) * 4;
        const maximum = Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
        const minimum = Math.min(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
        if (pixels[offset + 3] > 80 && minimum >= 190 && maximum - minimum <= 64) {
          columnCounts[x - group.left] += 1;
        }
      }
    }
    const persistentLimit = Math.max(2, Math.ceil(groupHeight * 0.72));
    let left = width;
    let right = -1;
    let refinedPixels = 0;
    for (let index = 0; index < columnCounts.length; index += 1) {
      const count = columnCounts[index];
      // Ignore columns that run through almost the entire group. They are
      // normally the vertical sides of a WOLF message/choice window.
      if (count === 0 || count >= persistentLimit) continue;
      const x = group.left + index;
      left = Math.min(left, x);
      right = Math.max(right, x);
      refinedPixels += count;
    }
    if (right < left) return undefined;
    return { ...group, left, right, pixels: refinedPixels };
  }).filter((group): group is NonNullable<typeof group> => Boolean(group)).filter((group) => {
    const groupWidth = group.right - group.left + 1;
    const groupHeight = group.bottom - group.top + 1;
    const density = group.pixels / (groupWidth * groupHeight);
    return groupHeight >= 2
      && groupHeight <= Math.min(64, height * 0.12)
      && groupWidth >= 3
      && groupWidth <= width * 0.95
      && density >= 0.01
      && density <= 0.72;
  });
  if (groups.length === 0) return undefined;

  const expectedWidths = expectedLines.map(approximateTextWidth);
  const expectedMaximum = Math.max(...expectedWidths);
  let best: WolfTextBounds | undefined;
  for (let start = 0; start < groups.length; start += 1) {
    const selected = groups.slice(start, start + expectedLines.length);
    if (selected.length !== expectedLines.length) continue;
    const groupHeights = selected.map((group) => group.bottom - group.top + 1);
    const sortedHeights = [...groupHeights].sort((left, right) => left - right);
    const medianHeight = sortedHeights[Math.floor(sortedHeights.length / 2)];
    const gaps = selected.slice(1).map((group, index) => group.top - selected[index].top);
    if (gaps.some((gap) => gap < medianHeight * 0.65 || gap > medianHeight * 4.5)) continue;
    const top = selected[0].top;
    const bottom = selected.at(-1)!.bottom;
    if (bottom - top > height * 0.78) continue;
    const observedWidths = selected.map((group) => group.right - group.left + 1);
    const observedMaximum = Math.max(...observedWidths);
    const pixelsPerCharacter = observedMaximum / expectedMaximum;
    if (pixelsPerCharacter < medianHeight * 0.68 || pixelsPerCharacter > medianHeight * 1.65) {
      continue;
    }
    const widthError = observedWidths.reduce((total, observed, index) => {
      const expectedRatio = expectedWidths[index] / expectedMaximum;
      const observedRatio = observed / observedMaximum;
      return total + Math.abs(expectedRatio - observedRatio);
    }, 0) / selected.length;
    const averageGap = gaps.length > 0
      ? gaps.reduce((total, gap) => total + gap, 0) / gaps.length
      : medianHeight * 1.45;
    const gapError = gaps.length > 1
      ? gaps.reduce((total, gap) => total + Math.abs(gap - averageGap), 0)
        / gaps.length / medianHeight
      : 0;
    const heightError = groupHeights.reduce(
      (total, groupHeight) => total + Math.abs(groupHeight - medianHeight),
      0,
    ) / groupHeights.length / medianHeight;
    const score = 5_000
      - widthError * 2_000
      - gapError * 1_200
      - heightError * 1_200
      + Math.min(500, selected.reduce((total, group) => total + group.pixels, 0));
    if (best && score <= best.score) continue;
    const left = Math.min(...selected.map((group) => group.left));
    const right = Math.max(...selected.map((group) => group.right));
    const fontSize = Math.max(8, medianHeight * 1.08);
    best = {
      fontSize,
      height: bottom - top + 1,
      left,
      lines: selected.map((group) => ({
        height: group.bottom - group.top + 1,
        left: group.left,
        top: group.top,
        width: group.right - group.left + 1,
      })),
      lineHeight: Math.max(fontSize * 1.2, averageGap),
      score,
      top,
      width: right - left + 1,
    };
  }
  return best && best.score >= 2_400 ? best : undefined;
}
