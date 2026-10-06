import { describe, expect, it } from "vitest";
import {
  adaptWolfGameIni,
  findWolfTextBounds,
  normalizeWolfMessage,
  readWolfRuntimeTextState,
} from "../player-runtime/wolfText";

describe("WOLF message capture", () => {
  it("enables main text capture in Game.ini", () => {
    const result = adaptWolfGameIni("WindowModeFlag=1\r\nClipBoard_Use=0\r\n");
    expect(result).toContain("ClipBoard_Use=1\r\n");
    expect(result).toContain("MainText_to_ClipBoard=1\r\n");
  });

  it("rejects loading percentages and control byte fragments", () => {
    expect(normalizeWolfMessage("8%\u000b")).toBeUndefined();
    expect(normalizeWolfMessage("8% ")).toBeUndefined();
    expect(normalizeWolfMessage("  ")).toBeUndefined();
    expect(normalizeWolfMessage("AO; aoTuV [20110424] (based on Xiph.Org's libVorbis)"))
      .toBeUndefined();
    expect(normalizeWolfMessage("game-GameCache/Data/SystemGraphic/notice"))
      .toBeUndefined();
  });

  it("keeps ordinary multilingual dialogue", () => {
    expect(normalizeWolfMessage(" Hello, traveler. ")).toBe("Hello, traveler.");
    expect(normalizeWolfMessage("\r\nこんにちは。\r\n")).toBe("こんにちは。");
    expect(normalizeWolfMessage("\\c[20]ポーション\\c[0]です。")).toBe("ポーションです。");
  });

  it("reads multiline messages and every choice from Browser Woditor runtime fields", () => {
    const heap = new Int8Array(5_000_000);
    const bytes = new Uint8Array(heap.buffer);
    const view = new DataView(heap.buffer);
    bytes.set(new TextEncoder().encode('message_text_json="'), 33_990);
    bytes.set(new TextEncoder().encode('choice_text_json="'), 34_010);
    const message = new TextEncoder().encode("一行目。\n二行目。\n三行目。");
    const choices = new TextEncoder().encode("はい\nいいえ\nあとで\n");
    bytes.set(message, 4_700_000);
    bytes.set(choices, 4_710_000);
    view.setUint32(4_591_800, 4_700_000, true);
    view.setUint32(4_591_804, message.byteLength, true);
    view.setUint32(4_591_808, 0x8000_0040, true);
    view.setUint32(4_591_836, 4_710_000, true);
    view.setUint32(4_591_840, choices.byteLength, true);
    view.setUint32(4_591_844, 0x8000_0040, true);
    view.setInt32(4_591_992, 1, true);

    expect(readWolfRuntimeTextState(heap)).toEqual({
      message: "一行目。\n二行目。\n三行目。",
      choices: ["はい", "いいえ", "あとで"],
      selectedChoice: 1,
    });
  });

  it("does not interpret unknown Browser Woditor memory layouts", () => {
    expect(readWolfRuntimeTextState(new Int8Array(5_000_000))).toBeUndefined();
  });

  it("locates choice text without mistaking a pale window or its border for text", () => {
    const width = 320;
    const height = 240;
    const pixels = new Uint8Array(width * height * 4);
    for (let offset = 0; offset < pixels.length; offset += 4) {
      pixels[offset] = 182;
      pixels[offset + 1] = 186;
      pixels[offset + 2] = 230;
      pixels[offset + 3] = 255;
    }
    const paint = (left: number, top: number, paintWidth: number, paintHeight: number) => {
      for (let y = top; y < top + paintHeight; y += 1) {
        for (let x = left; x < left + paintWidth; x += 1) {
          const offset = (y * width + x) * 4;
          pixels[offset] = 248;
          pixels[offset + 1] = 248;
          pixels[offset + 2] = 248;
          pixels[offset + 3] = 255;
        }
      }
    };
    paint(90, 96, 140, 2);
    paint(90, 188, 140, 2);
    paint(90, 96, 1, 94);
    paint(229, 96, 1, 94);
    const paintText = (left: number, top: number, textWidth: number) => {
      for (let y = top; y < top + 15; y += 1) {
        if ((y - top) % 3 === 2) continue;
        for (let x = left; x < left + textWidth; x += 1) {
          if ((x - left) % 4 < 2) paint(x, y, 1, 1);
        }
      }
    };
    paintText(136, 112, 48);
    paintText(112, 140, 96);
    paintText(124, 168, 72);
    paintText(82, 210, 160);

    const bounds = findWolfTextBounds(pixels, width, height, "PLAY\nCONTINUE\nCANCEL");
    expect(bounds).toBeDefined();
    expect(bounds?.top).toBe(112);
    expect(bounds?.left).toBeGreaterThanOrEqual(112);
    expect(bounds?.left).toBeLessThanOrEqual(114);
    expect(bounds?.width).toBeGreaterThanOrEqual(92);
    expect(bounds?.lineHeight).toBeCloseTo(28, 0);
    expect(bounds?.fontSize).toBeGreaterThan(14);
    expect(bounds?.fontSize).toBeLessThan(18);
    expect(bounds?.lines).toEqual([
      { height: 14, left: 136, top: 112, width: 46 },
      { height: 14, left: 112, top: 140, width: 94 },
      { height: 14, left: 124, top: 168, width: 70 },
    ]);

    const popupBounds = findWolfTextBounds(
      pixels,
      width,
      height,
      "最初からゲームを開始します",
    );
    expect(popupBounds?.top).toBe(210);
    expect(popupBounds?.lines).toHaveLength(1);
  });

});
