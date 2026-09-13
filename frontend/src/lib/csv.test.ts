import { describe, expect, it } from "vitest";

import { toCsv } from "./csv";

describe("toCsv", () => {
  it("writes a header row from the given columns, in order", () => {
    const csv = toCsv([{ a: 1, b: 2 }], ["b", "a"]);
    expect(csv.split("\r\n")[0]).toBe("b,a");
  });

  it("quotes and escapes values containing commas, quotes, or newlines", () => {
    const csv = toCsv([{ name: 'Kisumu, "the lake city"\nnote' }], ["name"]);
    const [, row] = csv.split("\r\n");
    expect(row).toBe('"Kisumu, ""the lake city""\nnote"');
  });

  it("leaves plain values unquoted", () => {
    const csv = toCsv([{ name: "Kisumu" }], ["name"]);
    expect(csv.split("\r\n")[1]).toBe("Kisumu");
  });

  it("renders null/undefined as an empty cell, not the literal string", () => {
    const csv = toCsv([{ a: null, b: undefined }], ["a", "b"]);
    expect(csv.split("\r\n")[1]).toBe(",");
  });
});
