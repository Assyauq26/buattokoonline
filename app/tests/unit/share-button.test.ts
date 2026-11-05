// @vitest-environment jsdom
import { createElement } from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ShareButton } from "@/components/storefront/share-button";
let copy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
});
afterEach(cleanup);
it("copies the actual page URL when native sharing is unavailable", async () => {
  render(createElement(ShareButton, { title: "Dummy", iconOnly: true }));
  fireEvent.click(screen.getByRole("button", { name: "Bagikan produk" }));
  await screen.findByRole("button", { name: "Tautan produk tersalin" });
  expect(copy).toHaveBeenCalledWith(window.location.href);
});
it("successful native sharing does not also write the clipboard", async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "share", { value: share });
  render(createElement(ShareButton, { title: "Dummy" }));
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false));
  expect(share).toHaveBeenCalledWith({ title: "Dummy", url: window.location.href });
  expect(copy).not.toHaveBeenCalled();
});
it("native cancellation neither copies nor shows a false error", async () => {
  Object.defineProperty(navigator, "share", { value: vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError")) });
  render(createElement(ShareButton, { title: "Dummy" }));
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false));
  expect(copy).not.toHaveBeenCalled();
  expect(screen.queryByRole("status")).toBeNull();
});
it("native failure can fall back to clipboard", async () => {
  Object.defineProperty(navigator, "share", { value: vi.fn().mockRejectedValue(new Error("Unavailable")) });
  render(createElement(ShareButton, { title: "Dummy" }));
  fireEvent.click(screen.getByRole("button"));
  await screen.findByRole("button", { name: "Tautan produk tersalin" });
});
it.each(["denied", "missing"])("%s clipboard gives accessible feedback without false success or an unhandled rejection", async mode => {
  if (mode === "missing") Object.defineProperty(navigator, "clipboard", { value: undefined });
  else copy.mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"));
  render(createElement(ShareButton, { title: "Dummy", iconOnly: true }));
  fireEvent.click(screen.getByRole("button"));
  expect((await screen.findByRole("status")).textContent).toContain("Gunakan menu Bagikan");
  expect(screen.queryByRole("button", { name: "Tautan produk tersalin" })).toBeNull();
});
