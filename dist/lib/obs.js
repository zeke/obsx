import OBSWebSocket from "obs-websocket-js";
import process from "node:process";
export const DEFAULT_OBS_URL = "ws://localhost:4455";
export function getObsConnectionOptionsFromEnv() {
    const url = (process.env.OBSX_URL ?? "").trim() || DEFAULT_OBS_URL;
    const passwordRaw = (process.env.OBSX_PASSWORD ?? "").trim();
    return {
        url,
        password: passwordRaw.length ? passwordRaw : undefined,
    };
}
export async function withOBS(options, fn) {
    const obs = new OBSWebSocket();
    await obs.connect(options.url, options.password);
    try {
        return await fn(obs);
    }
    finally {
        try {
            await obs.disconnect();
        }
        catch {
            // ignore disconnect errors
        }
    }
}
