// @vitest-environment jsdom
import React from "react";
import { afterEach, it, expect } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { Controls, TABS } from "@/components/appearance/controls";
import { makeDefault } from "@/modules/appearance/schema";
afterEach(cleanup);
it("identity select has a stable accessible label independent of option text", () => {
  render(
    React.createElement(Controls, {
      tab: TABS[0],
      draft: makeDefault(),
      change: () => {},
      upload: () => {},
      busy: false,
    }),
  );
  const select = screen.getByLabelText("Mode logo", {
    exact: true,
  }) as HTMLSelectElement;
  expect(select.tagName).toBe("SELECT");
  expect(Array.from(select.options).map((o) => o.value)).toEqual([
    "text",
    "image",
    "both",
  ]);
});
it("mobile navigation style remains accessible by its exact label", () => {
  render(
    React.createElement(Controls, {
      tab: TABS[5],
      draft: makeDefault(),
      change: () => {},
      upload: () => {},
      busy: false,
    }),
  );
  expect(
    screen.getByLabelText("Navigasi mobile", { exact: true }).tagName,
  ).toBe("SELECT");
});
