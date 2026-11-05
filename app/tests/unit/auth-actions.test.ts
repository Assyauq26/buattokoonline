import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  createSession: vi.fn(),
  destroySession: vi.fn(),
  authenticate: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => auth);
vi.mock("@/modules/auth/auth.service", () => ({
  authenticate: auth.authenticate,
  registerCustomer: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: auth.redirect }));

import { loginAction, logoutAction } from "@/modules/auth/auth.actions";
import { POST as logoutRoute } from "@/app/api/v1/auth/logout/route";

beforeEach(() => {
  vi.resetAllMocks();
  auth.authenticate.mockResolvedValue({ id: "customer", email: "customer@example.test" });
  auth.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
});

describe("login redirect boundary", () => {
  it.each([
    ["/orders?status=PAID#recent", "/orders?status=PAID#recent"],
    ["/", "/"],
    ["", "/account"],
    ["https://example.test", "/account"],
    ["//example.test", "/account"],
    ["/\\example.test", "/account"],
    ["/\t/example.test", "/account"],
    ["/\n/example.test", "/account"],
  ])("redirects %j to %j", async (target, expected) => {
    const form = new FormData();
    form.set("identifier", "customer@example.test");
    form.set("password", "test-password");
    form.set("redirectTo", target);
    await expect(loginAction(null, form)).rejects.toThrow(`redirect:${expected}`);
    expect(auth.redirect).toHaveBeenCalledWith(expected);
  });
});

describe("logout completion", () => {
  it("waits for session deletion before the Server Action redirects", async () => {
    let finish!: () => void;
    auth.destroySession.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const result = logoutAction();
    const assertion = expect(result).rejects.toThrow("redirect:/");
    await Promise.resolve();
    expect(auth.redirect).not.toHaveBeenCalled();
    finish();
    await assertion;
  });

  it("waits for session deletion before the REST route reports success", async () => {
    let finish!: () => void;
    auth.destroySession.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    let completed = false;
    const result = logoutRoute().then((response) => { completed = true; return response; });
    await Promise.resolve();
    await Promise.resolve();
    expect(completed).toBe(false);
    finish();
    expect(await (await result).json()).toEqual({ success: true, data: { loggedOut: true } });
  });
});
