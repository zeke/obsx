// Adds a webcam input to the current OBS scene and applies default filters.
import OBSWebSocket from "obs-websocket-js";

const WS_URL = "ws://localhost:4455";
const BASE_NAME = "Video Capture Device";

const DEVICE_PRIORITY = [
  "iphone camera",
  "studio display camera",
  "facetime hd camera",
];

const INPUT_KIND_PREFERENCE = [
  "av_capture_input",
  "macos-avcapture",
  "avf_capture_input",
  "avfoundation_input",
  "video_capture_device",
];

async function pickInputKind(obs: OBSWebSocket): Promise<string> {
  const list = await obs.call("GetInputKindList");
  const kinds = list.inputKinds ?? [];

  for (const preferred of INPUT_KIND_PREFERENCE) {
    if (kinds.includes(preferred)) return preferred;
  }

  const captureKind = kinds.find((kind) =>
    kind.toLowerCase().includes("capture")
  );
  if (captureKind) return captureKind;

  throw new Error(`No supported capture input kinds found: ${kinds.join(", ")}`);
}

async function pickDeviceId(
  obs: OBSWebSocket,
  inputName: string
): Promise<{ deviceId: string | null; propertyName: string | null }> {
  const propertyCandidates = [
    "device_id",
    "device",
    "device_name",
    "video_device",
    "source",
    "input",
  ];

  for (const propertyName of propertyCandidates) {
    try {
      const props = await obs.call("GetInputPropertiesListPropertyItems", {
        inputName,
        propertyName,
      });

      const items = props.propertyItems ?? [];
      const normalized = items.map((item) => ({
        name: String(item.itemName ?? ""),
        value: String(item.itemValue ?? ""),
      }));

      if (!normalized.length) continue;

      for (const needle of DEVICE_PRIORITY) {
        const match = normalized.find((item) =>
          item.name.toLowerCase().includes(needle)
        );
        if (match) return { deviceId: match.value || null, propertyName };
      }

      return { deviceId: normalized[0]?.value ?? null, propertyName };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("Unable to find a property")) {
        throw err;
      }
    }
  }

  const settings = await obs.call("GetInputSettings", { inputName });
  const settingKeys = Object.keys(settings.inputSettings ?? {});
  console.log("Available input settings keys:", settingKeys);

  return { deviceId: null, propertyName: null };
}

async function uniqueInputName(obs: OBSWebSocket): Promise<string> {
  const list = await obs.call("GetInputList");
  const names = new Set(list.inputs.map((input) => input.inputName));

  if (!names.has(BASE_NAME)) return BASE_NAME;

  let suffix = 2;
  while (names.has(`${BASE_NAME}-${suffix}`)) suffix += 1;
  return `${BASE_NAME}-${suffix}`;
}

async function run(): Promise<void> {
  const obs = new OBSWebSocket();
  await obs.connect(WS_URL);

  const currentScene = await obs.call("GetCurrentProgramScene");
  const sceneName = currentScene.currentProgramSceneName;

  const inputKind = await pickInputKind(obs);
  const inputName = await uniqueInputName(obs);

  await obs.call("CreateInput", {
    sceneName,
    inputName,
    inputKind,
    inputSettings: {},
    sceneItemEnabled: true,
  });

  const { deviceId, propertyName } = await pickDeviceId(obs, inputName);
  if (!deviceId || !propertyName) {
    throw new Error(`No capture devices found for ${inputKind}.`);
  }

  await obs.call("SetInputSettings", {
    inputName,
    inputSettings: {
      [propertyName]: deviceId,
    },
    overlay: true,
  });

  await obs.call("CreateSourceFilter", {
    sourceName: inputName,
    filterName: "Chroma Key",
    filterKind: "chroma_key_filter",
    filterSettings: {},
  });

  await obs.call("CreateSourceFilter", {
    sourceName: inputName,
    filterName: "Color Correction",
    filterKind: "color_filter",
    filterSettings: {
      saturation: -1.0,
      contrast: 0.7,
    },
  });

  const filters = await obs.call("GetSourceFilterList", {
    sourceName: inputName,
  });
  const filterSummaries = filters.filters.map((filter) => ({
    name: filter.filterName,
    kind: filter.filterKind,
    enabled: filter.filterEnabled,
  }));
  console.log("Filters:", filterSummaries);

  console.log("Created input:", inputName);
  console.log("Scene:", sceneName);
  console.log("Device:", deviceId);

  await obs.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
