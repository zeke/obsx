import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, "..", "src", "cli.ts");

function run(...args: string[]) {
  return exec("npx", ["tsx", CLI, ...args], {
    timeout: 10_000,
    env: { ...process.env, ANTHROPIC_API_KEY: "" },
  });
}

describe("cli", () => {
  it("prints version with -v", async () => {
    const { stdout } = await run("-v");
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("prints version with --version", async () => {
    const { stdout } = await run("--version");
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("prints help with no args", async () => {
    const { stdout } = await run();
    expect(stdout).toContain("obsx - A CLI for OBS");
    expect(stdout).toContain("Commands:");
  });

  it("prints help with -h", async () => {
    const { stdout } = await run("-h");
    expect(stdout).toContain("obsx - A CLI for OBS");
  });

  it("prints help with --help", async () => {
    const { stdout } = await run("--help");
    expect(stdout).toContain("obsx - A CLI for OBS");
  });
});
