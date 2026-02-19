import { describe, it, expect, afterEach } from "vitest";
import { getObsConnectionOptionsFromEnv, DEFAULT_OBS_URL } from "../src/lib/obs.js";

describe("getObsConnectionOptionsFromEnv", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns defaults when no env vars set", () => {
    delete process.env.OBSX_URL;
    delete process.env.OBSX_PASSWORD;
    const opts = getObsConnectionOptionsFromEnv();
    expect(opts.url).toBe(DEFAULT_OBS_URL);
    expect(opts.password).toBeUndefined();
  });

  it("uses OBSX_URL when set", () => {
    process.env.OBSX_URL = "ws://myhost:9999";
    const opts = getObsConnectionOptionsFromEnv();
    expect(opts.url).toBe("ws://myhost:9999");
  });

  it("trims whitespace from OBSX_URL", () => {
    process.env.OBSX_URL = "  ws://myhost:9999  ";
    const opts = getObsConnectionOptionsFromEnv();
    expect(opts.url).toBe("ws://myhost:9999");
  });

  it("falls back to default for empty OBSX_URL", () => {
    process.env.OBSX_URL = "   ";
    const opts = getObsConnectionOptionsFromEnv();
    expect(opts.url).toBe(DEFAULT_OBS_URL);
  });

  it("uses OBSX_PASSWORD when set", () => {
    process.env.OBSX_PASSWORD = "secret123";
    const opts = getObsConnectionOptionsFromEnv();
    expect(opts.password).toBe("secret123");
  });

  it("trims whitespace from OBSX_PASSWORD", () => {
    process.env.OBSX_PASSWORD = "  secret  ";
    const opts = getObsConnectionOptionsFromEnv();
    expect(opts.password).toBe("secret");
  });

  it("returns undefined password for empty OBSX_PASSWORD", () => {
    process.env.OBSX_PASSWORD = "   ";
    const opts = getObsConnectionOptionsFromEnv();
    expect(opts.password).toBeUndefined();
  });
});

describe("DEFAULT_OBS_URL", () => {
  it("is the expected default", () => {
    expect(DEFAULT_OBS_URL).toBe("ws://localhost:4455");
  });
});
