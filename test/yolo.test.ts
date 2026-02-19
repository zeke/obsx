import { describe, it, expect } from "vitest";
import { parseCallsFromResponse } from "../src/commands/yolo.js";

describe("parseCallsFromResponse", () => {
  it("parses a plain JSON array", () => {
    const input = JSON.stringify([
      { requestType: "SetCurrentProgramScene", requestData: { sceneName: "Main" } },
    ]);
    const calls = parseCallsFromResponse(input);
    expect(calls).toEqual([
      { requestType: "SetCurrentProgramScene", requestData: { sceneName: "Main" } },
    ]);
  });

  it("strips markdown fences", () => {
    const input = '```json\n[{"requestType":"StartRecord"}]\n```';
    const calls = parseCallsFromResponse(input);
    expect(calls).toEqual([{ requestType: "StartRecord", requestData: undefined }]);
  });

  it("strips fences without language tag", () => {
    const input = '```\n[{"requestType":"StopStream"}]\n```';
    const calls = parseCallsFromResponse(input);
    expect(calls).toEqual([{ requestType: "StopStream", requestData: undefined }]);
  });

  it("handles empty array", () => {
    const calls = parseCallsFromResponse("[]");
    expect(calls).toEqual([]);
  });

  it("handles multiple calls", () => {
    const input = JSON.stringify([
      { requestType: "SetInputMute", requestData: { inputName: "Mic", inputMuted: true } },
      { requestType: "StartRecord" },
    ]);
    const calls = parseCallsFromResponse(input);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.requestType).toBe("SetInputMute");
    expect(calls[1]!.requestType).toBe("StartRecord");
  });

  it("throws on non-array JSON", () => {
    expect(() => parseCallsFromResponse('{"requestType":"Foo"}')).toThrow(
      "Expected a JSON array"
    );
  });

  it("throws on invalid JSON", () => {
    expect(() => parseCallsFromResponse("not json")).toThrow();
  });

  it("throws when an element is missing requestType", () => {
    const input = JSON.stringify([{ requestData: { sceneName: "Main" } }]);
    expect(() => parseCallsFromResponse(input)).toThrow('missing "requestType"');
  });

  it("throws when an element is null", () => {
    const input = JSON.stringify([null]);
    expect(() => parseCallsFromResponse(input)).toThrow('missing "requestType"');
  });
});
