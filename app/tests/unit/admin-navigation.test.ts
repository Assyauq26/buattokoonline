// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ path: "/admin" }));
vi.mock("next/navigation", () => ({
  usePathname: () => state.path,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ui/navigation", () => ({
  default: ({ children, prefetch: _, ...props }: any) =>
    createElement(
      "a",
      { ...props, onClick: (event: Event) => event.preventDefault() },
      children,
    ),
}));
import { AdminMobileBottomNav, AdminNav } from "@/components/admin/admin-nav";
import { ALL_PERMISSIONS } from "@/lib/auth/permissions";
afterEach(() => {
  cleanup();
  state.path = "/admin";
});
const nav = () =>
  createElement(AdminMobileBottomNav, { permissions: ALL_PERMISSIONS });
it("has one decoration entry and no standalone hero entry", () => {
  render(createElement(AdminNav, { permissions: ALL_PERMISSIONS }));
  expect(screen.queryByText("Banner Hero")).toBeNull();
  expect(
    screen.getByText("Dekorasi Toko").closest("a")?.getAttribute("href"),
  ).toBe("/admin/customize");
});
it("toggles, dismisses outside, preserves inner scroll, restores focus on Escape", () => {
  render(nav());
  const trigger = screen.getByRole("button", { name: "Lainnya" });
  fireEvent.click(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Tutup menu lainnya" }),
  );
  fireEvent.scroll(screen.getByText("Menu lainnya"));
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  fireEvent.click(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(trigger);
  fireEvent.pointerDown(document.body);
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});
it("closes on menu selection and pathname changes without trapping Tab focus", () => {
  const view = render(nav());
  const trigger = screen.getByRole("button", { name: "Lainnya" });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByText("Dekorasi Toko"));
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(trigger);
  state.path = "/admin/products";
  view.rerender(nav());
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(trigger);
  fireEvent.focusIn(document.body);
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});

it("groups configuration under settings and categories under products without duplicate root links", () => {
  render(createElement(AdminNav, { permissions: ALL_PERMISSIONS }));
  expect(
    screen.getByRole("link", { name: /Pengaturan/ }).getAttribute("href"),
  ).toBe("/admin/settings");
  for (const href of [
    "/admin/shipping",
    "/admin/audit",
    "/admin/updates",
    "/admin/bank-accounts",
  ])
    expect(document.querySelector(`a[href="${href}"]`)).toBeNull();
  expect(
    document.querySelector('a[href="/admin/products/categories"]'),
  ).not.toBeNull();
});
it("closes More with X and restores its trigger", () => {
  render(nav());
  const trigger = screen.getByRole("button", { name: "Lainnya" });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("button", { name: "Tutup menu lainnya" }));
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
});
