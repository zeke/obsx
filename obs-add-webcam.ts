// Adds a webcam input to the current OBS scene and applies default filters.
import OBSWebSocket from "obs-websocket-js";
import { createInterface, type Interface } from "node:readline/promises";
import process from "node:process";

type Options = {
  interactive: boolean;
  url: string;
  password?: string;
  baseName: string;
  inputKind?: string;
  deviceSelection?: string;
  addChromaKey: boolean;
  addColorCorrection: boolean;
  saturation: number;
  contrast: number;
};

const DEFAULTS: Options = {
  interactive: false,
  url: "ws://localhost:4455",
  password: undefined,
  baseName: "Video Capture Device",
  inputKind: undefined,
  deviceSelection: undefined,
  addChromaKey: true,
  addColorCorrection: true,
  saturation: -1.0,
  contrast: 0.7,
};

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

function parseArgs(argv: string[]): Partial<Options> {
  const out: Partial<Options> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    const next = argv[i + 1];

    if (arg === "-i" || arg === "--interactive") {
      out.interactive = true;
      continue;
    }

    if (arg === "--url" && typeof next === "string") {
      out.url = next;
      i += 1;
      continue;
    }

    if (arg === "--password" && typeof next === "string") {
      out.password = next;
      i += 1;
      continue;
    }

    if (arg === "--base-name" && typeof next === "string") {
      out.baseName = next;
      i += 1;
      continue;
    }

    if (arg === "--input-kind" && typeof next === "string") {
      out.inputKind = next;
      i += 1;
      continue;
    }

    if (arg === "--device" && typeof next === "string") {
      out.deviceSelection = next;
      i += 1;
      continue;
    }

    if (arg === "--no-chroma-key") {
      out.addChromaKey = false;
      continue;
    }

    if (arg === "--no-color-correction") {
      out.addColorCorrection = false;
      continue;
    }

    if (arg === "--saturation" && typeof next === "string") {
      out.saturation = Number(next);
      i += 1;
      continue;
    }

    if (arg === "--contrast" && typeof next === "string") {
      out.contrast = Number(next);
      i += 1;
      continue;
    }
  }

  return out;
}

function mergeOptions(overrides: Partial<Options>): Options {
  return {
    ...DEFAULTS,
    ...overrides,
  };
}

async function ask(
  rl: Interface,
  question: string,
  defaultValue: string
): Promise<string> {
  const suffix = defaultValue.length ? ` [${defaultValue}]` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer.length ? answer : defaultValue;
}

async function askYesNo(
  rl: Interface,
  question: string,
  defaultValue: boolean
): Promise<boolean> {
  const prompt = defaultValue ? "[Y/n]" : "[y/N]";
  const answer = (await rl.question(`${question} ${prompt}: `)).trim().toLowerCase();
  if (!answer) return defaultValue;
  if (["y", "yes"].includes(answer)) return true;
  if (["n", "no"].includes(answer)) return false;
  return defaultValue;
}

function pickDefaultIndexFromNeedles(
  labels: string[],
  needles: string[]
): number {
  for (const needle of needles) {
    const idx = labels.findIndex((l) => l.toLowerCase().includes(needle));
    if (idx !== -1) return idx;
  }
  return 0;
}

async function askChoice(
  rl: Interface,
  question: string,
  choices: { label: string; value: string }[],
  defaultIndex: number
): Promise<string> {
  console.log("\n" + question);
  for (let i = 0; i < choices.length; i += 1) {
    const n = String(i + 1).padStart(2, " ");
    console.log(`  ${n}) ${choices[i]!.label}`);
  }

  const defaultHuman = String(defaultIndex + 1);
  const answer = (await rl.question(`Select [${defaultHuman}]: `)).trim();

  if (!answer) return choices[defaultIndex]!.value;

  const num = Number(answer);
  if (Number.isInteger(num) && num >= 1 && num <= choices.length) {
    return choices[num - 1]!.value;
  }

  const exact = choices.find((c) => c.value === answer) ?? choices.find((c) => c.label === answer);
  if (exact) return exact.value;

  return choices[defaultIndex]!.value;
}

async function pickInputKind(obs: OBSWebSocket): Promise<string> {
  const list = await obs.call("GetInputKindList");
  const kinds = list.inputKinds ?? [];

  for (const preferred of INPUT_KIND_PREFERENCE) {
    if (kinds.includes(preferred)) return preferred;
  }

  const captureKind = kinds.find((kind) => kind.toLowerCase().includes("capture"));
  if (captureKind) return captureKind;

  throw new Error(`No supported capture input kinds found: ${kinds.join(", ")}`);
}

async function uniqueInputName(obs: OBSWebSocket, baseName: string): Promise<string> {
  const list = await obs.call("GetInputList");
  const names = new Set(list.inputs.map((input) => input.inputName));

  if (!names.has(baseName)) return baseName;

  let suffix = 2;
  while (names.has(`${baseName}-${suffix}`)) suffix += 1;
  return `${baseName}-${suffix}`;
}

type DeviceChoice = {
  propertyName: string;
  itemName: string;
  itemValue: string;
};

async function getDeviceChoices(
  obs: OBSWebSocket,
  inputName: string
): Promise<DeviceChoice[]> {
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
      const choices: DeviceChoice[] = items
        .map((item) => ({
          propertyName,
          itemName: String(item.itemName ?? ""),
          itemValue: String(item.itemValue ?? ""),
        }))
        .filter((c) => c.itemName.length || c.itemValue.length);

      if (choices.length) return choices;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("Unable to find a property")) throw err;
    }
  }

  const settings = await obs.call("GetInputSettings", { inputName });
  const settingKeys = Object.keys(settings.inputSettings ?? {});
  console.log("Available input settings keys:", settingKeys);

  return [];
}

function pickDeviceDefaultIndex(choices: DeviceChoice[]): number {
  const labels = choices.map((c) => c.itemName);
  return pickDefaultIndexFromNeedles(labels, DEVICE_PRIORITY);
}

function findDeviceIndexBySelection(choices: DeviceChoice[], selection: string): number {
  const needle = selection.trim().toLowerCase();
  if (!needle) return -1;
  return choices.findIndex((c) =>
    `${c.itemName} ${c.itemValue} ${c.propertyName}`.toLowerCase().includes(needle)
  );
}

async function resolveOptionsInteractive(initial: Options): Promise<Options> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive mode requires a TTY.");
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const url = await ask(rl, "OBS WebSocket URL", initial.url);
    const passwordRaw = await ask(rl, "Password (leave blank for none)", initial.password ?? "");
    const password = passwordRaw.trim().length ? passwordRaw : undefined;
    const baseName = await ask(rl, "Base source name", initial.baseName);

    const addChromaKey = await askYesNo(rl, "Add Chroma Key filter?", initial.addChromaKey);
    const addColorCorrection = await askYesNo(
      rl,
      "Add Color Correction filter?",
      initial.addColorCorrection
    );

    let saturation = initial.saturation;
    let contrast = initial.contrast;
    if (addColorCorrection) {
      const satRaw = await ask(rl, "Color Correction: saturation", String(initial.saturation));
      const conRaw = await ask(rl, "Color Correction: contrast", String(initial.contrast));
      saturation = Number(satRaw);
      contrast = Number(conRaw);
    }

    return {
      ...initial,
      url,
      password,
      baseName,
      addChromaKey,
      addColorCorrection,
      saturation,
      contrast,
    };
  } finally {
    rl.close();
  }
}

async function run(): Promise<void> {
  const argOverrides = parseArgs(process.argv.slice(2));
  let options = mergeOptions(argOverrides);

  if (options.interactive) {
    options = await resolveOptionsInteractive(options);
  }

  if (!Number.isFinite(options.saturation)) {
    throw new Error(`Invalid --saturation: ${options.saturation}`);
  }

  if (!Number.isFinite(options.contrast)) {
    throw new Error(`Invalid --contrast: ${options.contrast}`);
  }

  const obs = new OBSWebSocket();
  await obs.connect(options.url, options.password);

  const currentScene = await obs.call("GetCurrentProgramScene");
  const sceneName = currentScene.currentProgramSceneName;

  let inputKind = options.inputKind;
  if (!inputKind) inputKind = await pickInputKind(obs);

  if (options.interactive) {
    const list = await obs.call("GetInputKindList");
    const kinds = list.inputKinds ?? [];
    const preferredDefault = kinds.includes(inputKind) ? inputKind : await pickInputKind(obs);

    const captureKinds = kinds
      .filter((k) => k.toLowerCase().includes("capture") || INPUT_KIND_PREFERENCE.includes(k))
      .sort((a, b) => {
        const ai = INPUT_KIND_PREFERENCE.indexOf(a);
        const bi = INPUT_KIND_PREFERENCE.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });

    const choices = (captureKinds.length ? captureKinds : kinds).map((k) => ({
      label: k,
      value: k,
    }));

    const defaultIndex = Math.max(
      0,
      choices.findIndex((c) => c.value === preferredDefault)
    );

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      inputKind = await askChoice(rl, "Input kind", choices, defaultIndex);
    } finally {
      rl.close();
    }
  }

  const inputName = await uniqueInputName(obs, options.baseName);

  await obs.call("CreateInput", {
    sceneName,
    inputName,
    inputKind,
    inputSettings: {},
    sceneItemEnabled: true,
  });

  const deviceChoices = await getDeviceChoices(obs, inputName);
  if (!deviceChoices.length) {
    throw new Error(`No capture devices found for ${inputKind}.`);
  }

  let deviceIndex = pickDeviceDefaultIndex(deviceChoices);
  if (options.deviceSelection) {
    const idx = findDeviceIndexBySelection(deviceChoices, options.deviceSelection);
    if (idx !== -1) deviceIndex = idx;
  }

  if (options.interactive) {
    const labels = deviceChoices.map((c) => `${c.itemName} (${c.propertyName})`);
    const defaultIndex = pickDefaultIndexFromNeedles(labels, DEVICE_PRIORITY);
    const choices = deviceChoices.map((c) => ({
      label: `${c.itemName} (${c.propertyName})`,
      value: `${c.propertyName}::${c.itemValue}`,
    }));

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const picked = await askChoice(rl, "Device", choices, defaultIndex);
      const [propertyName, itemValue] = picked.split("::");
      const idx = deviceChoices.findIndex(
        (c) => c.propertyName === propertyName && c.itemValue === itemValue
      );
      if (idx !== -1) deviceIndex = idx;
    } finally {
      rl.close();
    }
  }

  const device = deviceChoices[deviceIndex]!;

  await obs.call("SetInputSettings", {
    inputName,
    inputSettings: {
      [device.propertyName]: device.itemValue,
    },
    overlay: true,
  });

  if (options.addChromaKey) {
    await obs.call("CreateSourceFilter", {
      sourceName: inputName,
      filterName: "Chroma Key",
      filterKind: "chroma_key_filter",
      filterSettings: {},
    });
  }

  if (options.addColorCorrection) {
    await obs.call("CreateSourceFilter", {
      sourceName: inputName,
      filterName: "Color Correction",
      filterKind: "color_filter",
      filterSettings: {
        saturation: options.saturation,
        contrast: options.contrast,
      },
    });
  }

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
  console.log("Input kind:", inputKind);
  console.log("Device:", device.itemName);

  await obs.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
