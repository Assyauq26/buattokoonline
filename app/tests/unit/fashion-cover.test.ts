// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Cover } from "@/components/fashion/cover";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("reveals a previously mounted photo on reversal and ignores an obsolete decode", async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const pending: (() => void)[] = [];
  const previous = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "decode");
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: () => new Promise<void>((done) => pending.push(done)),
  });
  try {
    const show = (photo: string) => React.createElement(Cover, { photo, fallback: photo });
    const view = render(show("/a.png"));
    const finish = (index: number) => act(async () => pending[index]());
    const front = () => Array.from(view.container.querySelectorAll(".fashion-scene:not(.waiting) img")).at(-1);
    await finish(0);
    view.rerender(show("/b.png"));
    await finish(1);
    const reused = front();
    view.rerender(show("/a.png"));
    view.rerender(show("/b.png"));
    await finish(3);
    await finish(2);
    expect(front()).toBe(reused);
    view.rerender(show("/a.png"));
    await finish(4);
    expect(front()?.getAttribute("src")).toBe("/a.png");
    expect(front()?.parentElement?.classList.contains("revealed")).toBe(true);
    expect(view.container.querySelector(".waiting")).toBeNull();
  } finally {
    if (previous) Object.defineProperty(HTMLImageElement.prototype, "decode", previous);
    else Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
  }
});
