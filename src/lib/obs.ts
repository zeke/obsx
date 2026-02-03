import OBSWebSocket from "obs-websocket-js";

export type ObsConnectionOptions = {
  url: string;
  password?: string;
};

export const DEFAULT_OBS_URL = "ws://localhost:4455";

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
