import { describe, expect, it } from "vitest";

import {
  FIELD_CLASS,
  FIELD_ERROR_CLASS,
  FIELD_HINT_CLASS,
  FIELD_INPUT_CLASS,
  FIELD_LABEL_CLASS,
  FIELD_ROW_CLASS,
  FIELD_ROW_FIELD_CLASS,
} from "./fieldClasses";

describe("fieldClasses", () => {
  it("FIELD_INPUT_CLASS includes focus and disabled states", () => {
    expect(FIELD_INPUT_CLASS).toContain("focus-visible:border-accent");
    expect(FIELD_INPUT_CLASS).toContain("disabled:cursor-not-allowed");
  });

  it("FIELD_ROW_FIELD_CLASS extends FIELD_CLASS with flex sizing", () => {
    expect(FIELD_ROW_FIELD_CLASS).toContain(FIELD_CLASS);
    expect(FIELD_ROW_FIELD_CLASS).toContain("min-w-[150px]");
  });

  it("every exported class string is non-empty", () => {
    for (const cls of [FIELD_CLASS, FIELD_LABEL_CLASS, FIELD_ERROR_CLASS, FIELD_HINT_CLASS, FIELD_ROW_CLASS]) {
      expect(cls.length).toBeGreaterThan(0);
    }
  });
});
