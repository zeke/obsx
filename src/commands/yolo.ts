import process from "node:process";

import Anthropic from "@anthropic-ai/sdk";
import type OBSWebSocket from "obs-websocket-js";
import { getObsConnectionOptionsFromEnv, withOBS } from "../lib/obs.js";

type ObsCall = {
  requestType: string;
  requestData?: Record<string, unknown>;
};

type CallResult = {
  call: ObsCall;
  error?: string;
};

const MAX_ATTEMPTS = 3;

const SYSTEM_PROMPT = `You are an OBS Studio automation assistant. You receive a user's natural language request and the current state of their OBS instance, and you respond with a JSON array of OBS WebSocket v5 API calls to fulfill the request.

Each call is an object with "requestType" (string) and optional "requestData" (object).

Available request types (most common ones):

Scenes: GetSceneList, GetCurrentProgramScene, SetCurrentProgramScene (sceneName), CreateScene (sceneName), RemoveScene (sceneName), SetSceneName (sceneName, newSceneName)

Inputs: GetInputList, CreateInput (sceneName, inputName, inputKind, inputSettings?, sceneItemEnabled?), RemoveInput (inputName), SetInputName (inputName, newInputName), GetInputSettings (inputName), SetInputSettings (inputName, inputSettings, overlay?), SetInputMute (inputName, inputMuted), ToggleInputMute (inputName), SetInputVolume (inputName, inputVolumeMul? or inputVolumeDb?), GetInputKindList

Scene Items: GetSceneItemList (sceneName), GetSceneItemId (sceneName, sourceName), SetSceneItemEnabled (sceneName, sceneItemId, sceneItemEnabled), SetSceneItemTransform (sceneName, sceneItemId, sceneItemTransform), SetSceneItemIndex (sceneName, sceneItemId, sceneItemIndex), SetSceneItemLocked (sceneName, sceneItemId, sceneItemLocked), RemoveSceneItem (sceneName, sceneItemId), SetSceneItemBlendMode (sceneName, sceneItemId, sceneItemBlendMode)

Filters: GetSourceFilterList (sourceName), CreateSourceFilter (sourceName, filterName, filterKind, filterSettings?), RemoveSourceFilter (sourceName, filterName), SetSourceFilterEnabled (sourceName, filterName, filterEnabled), SetSourceFilterSettings (sourceName, filterName, filterSettings, overlay?)

Streaming/Recording: StartStream, StopStream, ToggleStream, StartRecord, StopRecord, ToggleRecord, PauseRecord, ResumeRecord, GetStreamStatus, GetRecordStatus

Transitions: GetSceneTransitionList, SetCurrentSceneTransition (transitionName), SetCurrentSceneTransitionDuration (transitionDuration)

General: GetVersion, GetStats, GetVideoSettings, SetVideoSettings (baseWidth, baseHeight, outputWidth, outputHeight, fpsNumerator, fpsDenominator)

Virtual Camera: StartVirtualCam, StopVirtualCam, ToggleVirtualCam

Studio Mode: GetStudioModeEnabled, SetStudioModeEnabled (studioModeEnabled), SetCurrentPreviewScene (sceneName)

Common input kinds (macOS): av_capture_input (video capture), coreaudio_input_capture (audio input), coreaudio_output_capture (audio output), image_source, color_source_v3, text_ft2_source_v2, browser_source, ffmpeg_source (media), window_capture, display_capture

Transform properties: positionX, positionY, scaleX, scaleY, rotation, boundsType (OBS_BOUNDS_NONE, OBS_BOUNDS_STRETCH, OBS_BOUNDS_SCALE_INNER, OBS_BOUNDS_SCALE_OUTER, OBS_BOUNDS_SCALE_TO_WIDTH, OBS_BOUNDS_SCALE_TO_HEIGHT, OBS_BOUNDS_MAX_ONLY), boundsWidth, boundsHeight, cropLeft, cropRight, cropTop, cropBottom, alignment

Rules:
- Respond with ONLY a JSON array. No explanation, no markdown fences, no extra text.
- Each element must have "requestType" and optionally "requestData".
- The calls will be executed sequentially in order.
- Use the current OBS state provided to reference correct scene names, input names, and scene item IDs.
- If you need to get information first (like a sceneItemId), you cannot do that in this single response. Use the state provided.
- Be practical: if asked to "hide" something, use SetSceneItemEnabled with false. If asked to "show", use true.
- For positioning, the canvas origin (0,0) is top-left.
- When creating new sources with CreateInput, the inputName MUST NOT conflict with any existing input name in OBS — not just in the current scene, but across ALL scenes. Check the provided Inputs list and all scene item lists carefully before choosing a name. If there is a conflict, append a suffix like "-2", "-3", etc.`;

async function gatherObsState(obs: OBSWebSocket): Promise<string> {
  const parts: string[] = [];

  try {
    const version = await obs.call("GetVersion");
    parts.push(`OBS Version: ${version.obsVersion}, Platform: ${version.platform}`);
  } catch {
    // ignore
  }

  try {
    const video = await obs.call("GetVideoSettings");
    parts.push(`Canvas: ${video.baseWidth}x${video.baseHeight}, Output: ${video.outputWidth}x${video.outputHeight}`);
  } catch {
    // ignore
  }

  try {
    const scenes = await obs.call("GetSceneList");
    parts.push(`Current scene: ${scenes.currentProgramSceneName}`);
    parts.push(`Scenes: ${JSON.stringify(scenes.scenes)}`);

    for (const scene of scenes.scenes) {
      const name = scene.sceneName as string;
      try {
        const items = await obs.call("GetSceneItemList", { sceneName: name });
        parts.push(`Scene items in "${name}": ${JSON.stringify(items.sceneItems)}`);
      } catch {
        // ignore individual scene errors
      }
    }
  } catch {
    // ignore
  }

  try {
    const inputs = await obs.call("GetInputList");
    parts.push(`Inputs: ${JSON.stringify(inputs.inputs)}`);
  } catch {
    // ignore
  }

  try {
    const stream = await obs.call("GetStreamStatus");
    parts.push(`Stream: active=${stream.outputActive}`);
  } catch {
    // ignore
  }

  try {
    const record = await obs.call("GetRecordStatus");
    parts.push(`Record: active=${record.outputActive}, paused=${record.outputPaused}`);
  } catch {
    // ignore
  }

  return parts.join("\n");
}

function parseCallsFromResponse(text: string): ObsCall[] {
  // Strip markdown fences if the model wrapped the response
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  const parsed: unknown = JSON.parse(cleaned);

  if (!Array.isArray(parsed)) {
    throw new Error("Expected a JSON array of OBS calls");
  }

  return parsed.map((item: unknown, i: number) => {
    if (typeof item !== "object" || item === null || !("requestType" in item)) {
      throw new Error(`Call at index ${i} is missing "requestType"`);
    }
    const obj = item as Record<string, unknown>;
    return {
      requestType: obj.requestType as string,
      requestData: (obj.requestData as Record<string, unknown>) ?? undefined,
    };
  });
}

export async function yolo(argv: string[]): Promise<void> {
  const prompt = argv.join(" ").trim();

  if (!prompt) {
    console.error("Usage: obsx yolo <prompt>");
    console.error('Example: obsx yolo "switch to the Gaming scene"');
    process.exitCode = 1;
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY environment variable is required for the yolo command.");
    process.exitCode = 1;
    return;
  }

  const anthropic = new Anthropic({ apiKey });

  await withOBS(getObsConnectionOptionsFromEnv(), async (obs) => {
    const messages: Anthropic.MessageParam[] = [];
    let failedResults: CallResult[] = [];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const state = await gatherObsState(obs);

      if (attempt === 1) {
        console.log("Asking Claude...");
        messages.push({
          role: "user",
          content: `Current OBS state:\n${state}\n\nRequest: ${prompt}`,
        });
      } else {
        // On retries, the previous assistant response is already in messages.
        // Add a user message with the errors and fresh state.
        messages.push({
          role: "user",
          content: `Some calls failed. Here are the errors:\n${failedResults.map((r) => `- ${r.call.requestType}${r.call.requestData ? " " + JSON.stringify(r.call.requestData) : ""}: ${r.error}`).join("\n")}\n\nUpdated OBS state:\n${state}\n\nPlease generate a corrected JSON array of OBS calls to complete the original request. Only include calls that still need to succeed — don't repeat calls that already worked.`,
        });
      }

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages,
      });

      const responseText =
        message.content[0]?.type === "text" ? message.content[0].text : "";

      // Keep conversation history for potential retries.
      messages.push({ role: "assistant", content: responseText });

      if (!responseText) {
        console.error("No response from Claude.");
        process.exitCode = 1;
        return;
      }

      let calls: ObsCall[];
      try {
        calls = parseCallsFromResponse(responseText);
      } catch (err) {
        console.error("Failed to parse Claude's response as OBS calls:");
        console.error(responseText);
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
        return;
      }

      if (!calls.length) {
        console.log("No OBS calls to execute.");
        return;
      }

      const label = attempt > 1 ? ` (attempt ${attempt}/${MAX_ATTEMPTS})` : "";
      console.log(`Executing ${calls.length} OBS call(s)${label}:\n`);

      failedResults = [];

      for (const call of calls) {
        const dataStr = call.requestData
          ? ` ${JSON.stringify(call.requestData)}`
          : "";
        console.log(`  ${call.requestType}${dataStr}`);

        try {
          const result = await obs.call(
            call.requestType as Parameters<typeof obs.call>[0],
            call.requestData as Parameters<typeof obs.call>[1]
          );
          if (result !== undefined && result !== null) {
            const resultStr = JSON.stringify(result);
            if (resultStr !== "{}" && resultStr !== "undefined") {
              console.log(`    -> ${resultStr}`);
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`    !! Error: ${msg}`);
          failedResults.push({ call, error: msg });
        }
      }

      if (!failedResults.length) {
        console.log("\nDone.");
        return;
      }

      if (attempt < MAX_ATTEMPTS) {
        console.log(
          `\n${failedResults.length} call(s) failed. Retrying with error feedback...`
        );
      } else {
        console.error(
          `\n${failedResults.length} call(s) still failing after ${MAX_ATTEMPTS} attempts.`
        );
        process.exitCode = 1;
      }
    }
  });
}
