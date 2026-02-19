import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import process from "node:process";

import type OBSWebSocket from "obs-websocket-js";
import { getObsConnectionOptionsFromEnv, withOBS } from "../lib/obs.js";

type Options = {
  scene?: string;
  dir: string;
};

export const IMAGE_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
  ".webp",
]);

export function parseArgs(argv: string[]): Partial<Options> {
  const out: Partial<Options> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    const next = argv[i + 1];

    if (arg === "--scene" && typeof next === "string") {
      out.scene = next;
      i += 1;
      continue;
    }

    if (arg === "--dir" && typeof next === "string") {
      out.dir = next;
      i += 1;
      continue;
    }
  }

  return out;
}

export function mergeOptions(overrides: Partial<Options>, cwd: string): Options {
  return {
    scene: overrides.scene,
    dir: overrides.dir ?? cwd,
  };
}

export function expandHome(p: string): string {
  if (!p.startsWith("~/")) return p;
  return path.join(os.homedir(), p.slice(2));
}

export function normalizeFilePath(p: string): string {
  const expanded = expandHome(p);
  const resolved = path.resolve(expanded);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

export function listImagesInDir(dir: string): { fileName: string; filePath: string }[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => IMAGE_EXTS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => ({
      fileName,
      filePath: normalizeFilePath(path.join(dir, fileName)),
    }));
}

async function pickImageInputKind(obs: OBSWebSocket): Promise<string> {
  const list = await obs.call("GetInputKindList");
  const kinds = list.inputKinds ?? [];

  if (kinds.includes("image_source")) return "image_source";
  const imageKind = kinds.find((k) => k.toLowerCase().includes("image"));
  if (imageKind) return imageKind;

  throw new Error(`No image input kind found. Available: ${kinds.join(", ")}`);
}

async function getSceneItemSourceNames(obs: OBSWebSocket, sceneName: string): Promise<string[]> {
  const res = await obs.call("GetSceneItemList", { sceneName });
  const items = (res.sceneItems ?? []) as unknown[];
  const names = items
    .map((item) => {
      const anyItem = item as Record<string, unknown>;
      return String(anyItem.sourceName ?? "");
    })
    .filter((n) => n.length);

  return [...new Set(names)];
}

async function getExistingImageFilesBySourceName(
  obs: OBSWebSocket,
  sourceNames: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  for (const sourceName of sourceNames) {
    try {
      const settings = await obs.call("GetInputSettings", { inputName: sourceName });
      const file = (settings.inputSettings as Record<string, unknown> | undefined)?.file;
      if (typeof file === "string" && file.trim().length) {
        out.set(sourceName, normalizeFilePath(file));
      }
    } catch {
      // Not an input with settings (e.g. a nested scene). Ignore.
    }
  }

  return out;
}

type SceneItemTransform = {
  positionX: number;
  positionY: number;
  alignment: number;
  boundsType: string;
  boundsAlignment: number;
  boundsWidth: number;
  boundsHeight: number;
};

export function computeFitTransform(canvasW: number, canvasH: number): SceneItemTransform {
  return {
    positionX: canvasW / 2,
    positionY: canvasH / 2,
    alignment: 0,
    boundsType: "OBS_BOUNDS_SCALE_INNER",
    boundsAlignment: 0,
    boundsWidth: canvasW,
    boundsHeight: canvasH,
  };
}

export async function addImages(argv: string[], cwd = process.cwd()): Promise<void> {
  const options = mergeOptions(parseArgs(argv), cwd);
  const dir = normalizeFilePath(options.dir);

  const images = listImagesInDir(dir);
  if (!images.length) {
    console.log(`No images found in: ${dir}`);
    return;
  }

  await withOBS(getObsConnectionOptionsFromEnv(), async (obs) => {
    const currentScene = await obs.call("GetCurrentProgramScene");
    const sceneName = options.scene ?? currentScene.currentProgramSceneName;

    const [video, inputKind, sourceNames, inputList] = await Promise.all([
      obs.call("GetVideoSettings"),
      pickImageInputKind(obs),
      getSceneItemSourceNames(obs, sceneName),
      obs.call("GetInputList"),
    ]);

    const canvasW = video.baseWidth;
    const canvasH = video.baseHeight;

    const existingNames = new Set(sourceNames);
    const allInputNames = new Set((inputList.inputs ?? []).map((i) => i.inputName));
    const existingFilesBySourceName = await getExistingImageFilesBySourceName(obs, sourceNames);
    const existingFiles = new Set(existingFilesBySourceName.values());

    let created = 0;
    let skipped = 0;

    for (const img of images) {
      const inputName = img.fileName;

      if (existingNames.has(inputName)) {
        skipped += 1;
        continue;
      }

      if (existingFiles.has(img.filePath)) {
        skipped += 1;
        continue;
      }

      if (allInputNames.has(inputName)) {
        let existingInputFile: string | undefined;
        try {
          const settings = await obs.call("GetInputSettings", { inputName });
          const file = (settings.inputSettings as Record<string, unknown> | undefined)?.file;
          if (typeof file === "string" && file.trim().length) {
            existingInputFile = normalizeFilePath(file);
          }
        } catch {
          existingInputFile = undefined;
        }

        if (!existingInputFile || existingInputFile !== img.filePath) {
          console.log(
            `Skipping ${img.fileName}: OBS input name already exists with a different file (${inputName})`
          );
          skipped += 1;
          continue;
        }

        const sceneItem = await obs.call("CreateSceneItem", {
          sceneName,
          sourceName: inputName,
          sceneItemEnabled: true,
        });

        await obs.call("SetSceneItemTransform", {
          sceneName,
          sceneItemId: sceneItem.sceneItemId,
          sceneItemTransform: computeFitTransform(canvasW, canvasH),
        });

        existingNames.add(inputName);
        existingFiles.add(img.filePath);
        created += 1;
        continue;
      }

      const createdInput = await obs.call("CreateInput", {
        sceneName,
        inputName,
        inputKind,
        inputSettings: {
          file: img.filePath,
        },
        sceneItemEnabled: true,
      });

      await obs.call("SetSceneItemTransform", {
        sceneName,
        sceneItemId: createdInput.sceneItemId,
        sceneItemTransform: computeFitTransform(canvasW, canvasH),
      });

      existingNames.add(inputName);
      existingFiles.add(img.filePath);
      created += 1;
    }

    console.log(`Scene: ${sceneName}`);
    console.log(`Dir: ${dir}`);
    console.log(`Created: ${created}`);
    console.log(`Skipped: ${skipped}`);
  });
}
