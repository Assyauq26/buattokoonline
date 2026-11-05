// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { QuantityStepper } from "@/components/storefront/quantity-stepper";
vi.stubGlobal("React", React);
afterEach(cleanup);
describe("shared quantity controls", () => {
  it("bounds rapid events and supports arrows without exceeding stock", () => {
    const change = vi.fn(),
      view = render(React.createElement(QuantityStepper, {value:1, max:3, onChange:change}));
    expect(view.getByLabelText("Kurangi jumlah")).toBeDisabled();
    const plus = view.getByLabelText("Tambah jumlah");
    fireEvent.click(plus);
    fireEvent.click(plus);
    fireEvent.click(plus);
    expect(change.mock.calls.map((call) => call[0])).toEqual([2, 3]);
    fireEvent.keyDown(plus, { key: "ArrowLeft" });
    expect(change).toHaveBeenLastCalledWith(2);
  });
  it("busy controls cannot submit changes, including keyboard input", () => {
    const change = vi.fn(),
      view = render(
        React.createElement(QuantityStepper, {value:2, max:5, busy:true, onChange:change}),
      );
    expect(view.getByLabelText("Tambah jumlah")).toBeDisabled();
    fireEvent.keyDown(view.getByLabelText("Tambah jumlah"), {
      key: "ArrowRight",
    });
    expect(change).not.toHaveBeenCalled();
  });
  it("reconciles server quantities and keeps a single accessible group", () => {
    const change = vi.fn(),
      view = render(React.createElement(QuantityStepper, {value:2, max:4, onChange:change}));
    view.rerender(React.createElement(QuantityStepper, {value:3, max:4, onChange:change}));
    fireEvent.click(view.getByLabelText("Tambah jumlah"));
    expect(change).toHaveBeenLastCalledWith(4);
    expect(view.getByRole("group", { name: "Atur jumlah" })).toBeVisible();
  });
});
