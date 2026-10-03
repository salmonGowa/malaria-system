import { describe, expect, it } from "vitest";

import { SIM_DICTIONARIES } from "./simulations";

const { en, sw } = SIM_DICTIONARIES;
const vars = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();

describe("Simulations dictionaries", () => {
  it("sw has exactly the same keys as en", () => {
    expect(Object.keys(sw).sort()).toEqual(Object.keys(en).sort());
  });

  it("every sw string is filled in and keeps the same {{placeholders}}", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(sw[key].trim(), key).not.toBe("");
      expect(vars(sw[key]), key).toEqual(vars(en[key]));
    }
  });
});
