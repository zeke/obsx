import OBSWebSocket from "obs-websocket-js";
import process from "node:process";

export type ObsConnectionOptions = {
  url: string;
  password?: string;
};

export const DEFAULT_OBS_URL = "ws://localhost:4455";

export function getObsConnectionOptionsFromEnv(): ObsConnectionOptions {
  const url = (process.env.OBSX_URL ?? "").trim() || DEFAULT_OBS_URL;
  const passwordRaw = (process.env.OBSX_PASSWORD ?? "").trim();
  return {
    url,
    password: passwordRaw.length ? passwordRaw : undefined,
  };
}

export async function withOBS<T>(
  options: ObsConnectionOptions,
  fn: (obs: OBSWebSocket) => Promise<T>
): Promise<T> {
  const obs = new OBSWebSocket();
  await obs.connect(options.url, options.password);
  try {
    return await fn(obs);
  } finally {
    try {
      await obs.disconnect();
    } catch {
      // ignore disconnect errors
    }
  }
}
