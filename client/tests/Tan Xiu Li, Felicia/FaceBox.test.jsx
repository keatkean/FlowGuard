// Frontend tests — face-box coordinate contract (constants/faceBox.js).
// FastAPI returns exactly [x, y, width, height] in captured-frame pixels; the
// helpers clamp to the frame and project onto the object-fit preview.
import { describe, test, expect } from "vitest";
import { clampBoxToFrame, mapBoxToContainer, faceBoxStyle } from "../../src/constants/faceBox";

describe("clampBoxToFrame", () => {
  test("passes a well-formed [x, y, width, height] box straight through", () => {
    expect(clampBoxToFrame([10, 20, 100, 120], 640, 480)).toEqual({
      x: 10, y: 20, width: 100, height: 120,
    });
  });

  test("clamps negative origins to the frame edge", () => {
    const { x, y } = clampBoxToFrame([-15, -5, 100, 100], 640, 480);
    expect(x).toBe(0);
    expect(y).toBe(0);
  });

  test("clamps boxes that overflow the right/bottom frame bounds", () => {
    const { x, y, width, height } = clampBoxToFrame([600, 440, 100, 100], 640, 480);
    expect(x + width).toBeLessThanOrEqual(640);
    expect(y + height).toBeLessThanOrEqual(480);
  });
});

describe("mapBoxToContainer — object-fit: contain", () => {
  // 640x480 frame shown in a 1280x720 container: contain scale = 1.5,
  // frame renders 960x720, letterboxed horizontally by (1280-960)/2 = 160.
  const frame = { width: 640, height: 480 };
  const container = { width: 1280, height: 720 };

  test("projects through the contain scale + letterbox offset", () => {
    const rect = mapBoxToContainer([100, 40, 200, 160], frame, container, "contain");
    expect(rect).toEqual({
      left: 160 + 100 * 1.5,
      top: 0 + 40 * 1.5,
      width: 200 * 1.5,
      height: 160 * 1.5,
    });
  });

  test("cover mode uses the larger scale and crops symmetrically", () => {
    // cover scale = max(1280/640, 720/480) = 2 → rendered 1280x960, offsetY = -120.
    const rect = mapBoxToContainer([100, 100, 50, 50], frame, container, "cover");
    expect(rect).toEqual({ left: 200, top: 100 * 2 - 120, width: 100, height: 100 });
  });

  test("returns null while either rect has no size yet", () => {
    expect(mapBoxToContainer([0, 0, 10, 10], { width: 0, height: 0 }, container)).toBeNull();
    expect(mapBoxToContainer([0, 0, 10, 10], frame, { width: 0, height: 0 })).toBeNull();
  });
});

describe("faceBoxStyle", () => {
  test("emits pixel CSS values ready for the overlay element", () => {
    const style = faceBoxStyle([0, 0, 640, 480], { width: 640, height: 480 }, { width: 640, height: 480 });
    expect(style).toEqual({ left: "0px", top: "0px", width: "640px", height: "480px" });
  });
});
