import { describe, expect, it } from "vitest";

import { sha256Hex } from "./hash";

describe("sha256Hex", () => {
  it("matches a known SHA-256 test vector", async () => {
    // echo -n "abc" | sha256sum
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("is deterministic", async () => {
    expect(await sha256Hex("same input")).toBe(await sha256Hex("same input"));
  });

  it("changes when the input changes by even one character", async () => {
    const a = await sha256Hex("confirmed_cases=10");
    const b = await sha256Hex("confirmed_cases=11");
    expect(a).not.toBe(b);
  });

  it("returns 64 lowercase hex characters", async () => {
    const hash = await sha256Hex("anything");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
