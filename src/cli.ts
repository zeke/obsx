#!/usr/bin/env node
import { createRequire } from "node:module";
import process from "node:process";

import { addImages } from "./commands/add-images.js";
import { addWebcam } from "./commands/add-webcam.js";
import { yolo } from "./commands/yolo.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

type Command = "add-images" | "add-webcam" | "yolo";

function printHelp(): void {
  console.log(`obsx - A CLI for OBS

Usage:
  obsx <command> [options]

Environment:
  OBSX_URL       OBS websocket URL (default: ws://localhost:4455)
  OBSX_PASSWORD  OBS websocket password (optional)

Commands:
  add-images   Add image sources for images in a directory (default: cwd)
  add-webcam   Add a webcam input to the current scene
  yolo         Use AI to control OBS with natural language

Examples:
  obsx add-images
  obsx add-images --dir /path/to/images
  obsx add-webcam --interactive
  obsx yolo "switch to the Gaming scene"
`);
}

async function run(argv: string[]): Promise<void> {
  const [maybeCommand, ...rest] = argv;

  if (maybeCommand === "-v" || maybeCommand === "--version") {
    console.log(version);
    return;
  }

  if (!maybeCommand || maybeCommand === "-h" || maybeCommand === "--help") {
    printHelp();
    return;
  }

  const command = maybeCommand as Command;
  if (command === "add-images") {
    await addImages(rest);
    return;
  }

  if (command === "add-webcam") {
    await addWebcam(rest);
    return;
  }

  if (command === "yolo") {
    await yolo(rest);
    return;
  }

  console.error(`Unknown command: ${maybeCommand}`);
  printHelp();
  process.exitCode = 1;
}

run(process.argv.slice(2)).catch((err) => {
  console.error(err);
  process.exit(1);
});
