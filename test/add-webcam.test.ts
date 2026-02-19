import { describe, it, expect } from "vitest";
import {
  parseArgs,
  mergeOptions,
  pickDefaultIndexFromNeedles,
  findDeviceIndexBySelection,
} from "../src/commands/add-webcam.js";

describe("parseArgs", () => {
  it("returns empty object for no args", () => {
    expect(parseArgs([])).toEqual({});
  });

  it("parses --interactive / -i", () => {
    expect(parseArgs(["--interactive"])).toEqual({ interactive: true });
    expect(parseArgs(["-i"])).toEqual({ interactive: true });
  });

  it("parses --base-name", () => {
    expect(parseArgs(["--base-name", "My Cam"])).toEqual({
      baseName: "My Cam",
      baseNameExplicit: true,
    });
  });

  it("parses --input-kind", () => {
    expect(parseArgs(["--input-kind", "av_capture_input"])).toEqual({
      inputKind: "av_capture_input",
    });
  });

  it("parses --device", () => {
    expect(parseArgs(["--device", "iphone"])).toEqual({
      deviceSelection: "iphone",
    });
  });

  it("parses --no-chroma-key", () => {
    expect(parseArgs(["--no-chroma-key"])).toEqual({ addChromaKey: false });
  });

  it("parses --no-color-correction", () => {
    expect(parseArgs(["--no-color-correction"])).toEqual({ addColorCorrection: false });
  });

  it("parses --saturation and --contrast", () => {
    const result = parseArgs(["--saturation", "-0.5", "--contrast", "0.8"]);
    expect(result.saturation).toBe(-0.5);
    expect(result.contrast).toBe(0.8);
  });

  it("parses multiple flags together", () => {
    const result = parseArgs(["-i", "--device", "studio", "--no-chroma-key"]);
    expect(result.interactive).toBe(true);
    expect(result.deviceSelection).toBe("studio");
    expect(result.addChromaKey).toBe(false);
  });
});

describe("mergeOptions", () => {
  it("uses defaults when no overrides", () => {
    const opts = mergeOptions({});
    expect(opts.interactive).toBe(false);
    expect(opts.baseName).toBe("Video Capture Device");
    expect(opts.baseNameExplicit).toBe(false);
    expect(opts.addChromaKey).toBe(true);
    expect(opts.addColorCorrection).toBe(true);
    expect(opts.saturation).toBe(-1.0);
    expect(opts.contrast).toBe(0.7);
  });

  it("overrides specific fields", () => {
    const opts = mergeOptions({ interactive: true, addChromaKey: false });
    expect(opts.interactive).toBe(true);
    expect(opts.addChromaKey).toBe(false);
    expect(opts.addColorCorrection).toBe(true); // still default
  });
});

describe("pickDefaultIndexFromNeedles", () => {
  const labels = ["FaceTime HD Camera", "iPhone Camera", "Studio Display Camera"];

  it("returns index of first matching needle", () => {
    expect(pickDefaultIndexFromNeedles(labels, ["iphone camera"])).toBe(1);
  });

  it("respects needle priority order", () => {
    expect(
      pickDefaultIndexFromNeedles(labels, [
        "iphone camera",
        "studio display camera",
        "facetime hd camera",
      ])
    ).toBe(1);
  });

  it("falls through to lower-priority needles", () => {
    expect(pickDefaultIndexFromNeedles(labels, ["nonexistent", "studio display"])).toBe(2);
  });

  it("returns 0 when no needles match", () => {
    expect(pickDefaultIndexFromNeedles(labels, ["nonexistent"])).toBe(0);
  });
});

describe("findDeviceIndexBySelection", () => {
  const choices = [
    { propertyName: "device_id", itemName: "FaceTime HD Camera", itemValue: "abc123" },
    { propertyName: "device_id", itemName: "iPhone Camera", itemValue: "def456" },
    { propertyName: "device_id", itemName: "Studio Display Camera", itemValue: "ghi789" },
  ];

  it("matches by device name substring", () => {
    expect(findDeviceIndexBySelection(choices, "iphone")).toBe(1);
  });

  it("matches case-insensitively", () => {
    expect(findDeviceIndexBySelection(choices, "STUDIO")).toBe(2);
  });

  it("matches by device value", () => {
    expect(findDeviceIndexBySelection(choices, "abc123")).toBe(0);
  });

  it("returns -1 for no match", () => {
    expect(findDeviceIndexBySelection(choices, "nonexistent")).toBe(-1);
  });

  it("returns -1 for empty selection", () => {
    expect(findDeviceIndexBySelection(choices, "")).toBe(-1);
  });
});
