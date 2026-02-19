import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  parseArgs,
  mergeOptions,
  expandHome,
  listImagesInDir,
  computeFitTransform,
  IMAGE_EXTS,
} from "../src/commands/add-images.js";

describe("parseArgs", () => {
  it("returns empty object for no args", () => {
    expect(parseArgs([])).toEqual({});
  });

  it("parses --scene", () => {
    expect(parseArgs(["--scene", "Gaming"])).toEqual({ scene: "Gaming" });
  });

  it("parses --dir", () => {
    expect(parseArgs(["--dir", "/tmp/imgs"])).toEqual({ dir: "/tmp/imgs" });
  });

  it("parses both --scene and --dir", () => {
    const result = parseArgs(["--scene", "Main", "--dir", "/tmp"]);
    expect(result).toEqual({ scene: "Main", dir: "/tmp" });
  });

  it("ignores unknown flags", () => {
    expect(parseArgs(["--foo", "bar"])).toEqual({});
  });
});

describe("mergeOptions", () => {
  it("uses cwd as default dir", () => {
    const opts = mergeOptions({}, "/home/user");
    expect(opts.dir).toBe("/home/user");
    expect(opts.scene).toBeUndefined();
  });

  it("overrides dir when provided", () => {
    const opts = mergeOptions({ dir: "/custom" }, "/home/user");
    expect(opts.dir).toBe("/custom");
  });

  it("passes scene through", () => {
    const opts = mergeOptions({ scene: "BRB" }, "/cwd");
    expect(opts.scene).toBe("BRB");
  });
});

describe("expandHome", () => {
  it("expands ~/path", () => {
    const result = expandHome("~/Documents");
    expect(result).toBe(path.join(os.homedir(), "Documents"));
  });

  it("leaves absolute paths alone", () => {
    expect(expandHome("/usr/local")).toBe("/usr/local");
  });

  it("leaves relative paths alone", () => {
    expect(expandHome("foo/bar")).toBe("foo/bar");
  });

  it("does not expand ~user paths", () => {
    expect(expandHome("~other/dir")).toBe("~other/dir");
  });
});

describe("IMAGE_EXTS", () => {
  it("contains common image extensions", () => {
    expect(IMAGE_EXTS.has(".png")).toBe(true);
    expect(IMAGE_EXTS.has(".jpg")).toBe(true);
    expect(IMAGE_EXTS.has(".jpeg")).toBe(true);
    expect(IMAGE_EXTS.has(".gif")).toBe(true);
    expect(IMAGE_EXTS.has(".webp")).toBe(true);
  });

  it("does not contain non-image extensions", () => {
    expect(IMAGE_EXTS.has(".txt")).toBe(false);
    expect(IMAGE_EXTS.has(".mp4")).toBe(false);
    expect(IMAGE_EXTS.has(".js")).toBe(false);
  });
});

describe("listImagesInDir", () => {
  it("lists image files sorted alphabetically", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "obsx-test-"));
    try {
      fs.writeFileSync(path.join(tmpDir, "b.png"), "");
      fs.writeFileSync(path.join(tmpDir, "a.jpg"), "");
      fs.writeFileSync(path.join(tmpDir, "c.txt"), "");
      fs.writeFileSync(path.join(tmpDir, "d.gif"), "");

      const images = listImagesInDir(tmpDir);
      expect(images.map((i) => i.fileName)).toEqual(["a.jpg", "b.png", "d.gif"]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("returns empty array for dir with no images", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "obsx-test-"));
    try {
      fs.writeFileSync(path.join(tmpDir, "readme.txt"), "");
      expect(listImagesInDir(tmpDir)).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("ignores subdirectories", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "obsx-test-"));
    try {
      fs.mkdirSync(path.join(tmpDir, "subdir.png"));
      fs.writeFileSync(path.join(tmpDir, "real.png"), "");

      const images = listImagesInDir(tmpDir);
      expect(images).toHaveLength(1);
      expect(images[0]!.fileName).toBe("real.png");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});

describe("computeFitTransform", () => {
  it("centers on canvas", () => {
    const t = computeFitTransform(1920, 1080);
    expect(t.positionX).toBe(960);
    expect(t.positionY).toBe(540);
    expect(t.boundsWidth).toBe(1920);
    expect(t.boundsHeight).toBe(1080);
    expect(t.boundsType).toBe("OBS_BOUNDS_SCALE_INNER");
    expect(t.alignment).toBe(0);
  });

  it("works with different canvas sizes", () => {
    const t = computeFitTransform(3840, 2160);
    expect(t.positionX).toBe(1920);
    expect(t.positionY).toBe(1080);
    expect(t.boundsWidth).toBe(3840);
    expect(t.boundsHeight).toBe(2160);
  });
});
