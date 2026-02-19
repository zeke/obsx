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
  obsx <prompt>              AI-control OBS with natural language
  obsx <command> [options]   Run a specific command

Environment:
  OBSX_URL       OBS websocket URL (default: ws://localhost:4455)
  OBSX_PASSWORD  OBS websocket password (optional)

Commands:
  add-images   Add image sources for images in a directory (default: cwd)
  add-webcam   Add a webcam input to the current scene
  yolo         Use AI to control OBS with natural language

Examples:
  obsx "switch to the Gaming scene"
  obsx "hide the webcam and start recording"
  obsx add-images
  obsx add-images --dir /path/to/images
  obsx add-webcam --interactive
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

  // Treat unrecognized commands as yolo prompts,
  // so `obsx "do something"` works like `obsx yolo "do something"`
  await yolo(argv);
}

run(process.argv.slice(2)).catch((err) => {
  console.error(err);
  process.exit(1);
});
