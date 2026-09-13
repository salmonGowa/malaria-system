import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import en from "./en";
import { LanguageProvider, useLanguage } from "./index";
import sw from "./sw";

describe("dictionaries", () => {
  it("sw has exactly the same keys as en (also enforced at compile time by sw.ts's Record<TranslationKey, string> type)", () => {
    expect(Object.keys(sw).sort()).toEqual(Object.keys(en).sort());
  });

  it("no sw value is empty", () => {
    for (const [key, value] of Object.entries(sw)) {
      expect(value.trim(), `sw["${key}"] is empty`).not.toBe("");
    }
  });
});

function Probe() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div>
      <span data-testid="lang">{language}</span>
      <span data-testid="label">{t("nav.analytics")}</span>
      <span data-testid="interpolated">{t("page.correctReport", { id: 42 })}</span>
      <button onClick={() => setLanguage("sw")}>switch</button>
    </div>
  );
}

describe("LanguageProvider / useLanguage", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to English", () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("lang")).toHaveTextContent("en");
    expect(screen.getByTestId("label")).toHaveTextContent("Analytics");
  });

  it("switches live and persists across a remount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    await user.click(screen.getByRole("button", { name: "switch" }));
    expect(screen.getByTestId("lang")).toHaveTextContent("sw");
    expect(screen.getByTestId("label")).toHaveTextContent("Uchambuzi");
    unmount();

    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("lang")).toHaveTextContent("sw");
  });

  it("interpolates {{vars}} into a translated string", () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("interpolated")).toHaveTextContent("Correct Report #42");
  });
});
