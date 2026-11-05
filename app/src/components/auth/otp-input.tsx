"use client";

import { forwardRef, useRef, useState, useImperativeHandle } from "react";

/** One real, selectable input preserves native keyboard, paste and one-time-code autofill. */
export const OtpInput = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    state: "idle" | "verifying" | "error" | "success";
  }
>(function OtpInput({ value, onChange, disabled, state }, forwardedRef) {
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(forwardedRef, () => input.current!);
  const [focused, setFocused] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const pointerStart = useRef<number | null>(null);
  const select = () =>
    setSelection({
      start: input.current?.selectionStart ?? 0,
      end: input.current?.selectionEnd ?? 0,
    });
  const accept = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length <= 6) onChange(digits);
  };
  return (
    <div
      className="auth-otp"
      data-state={state}
      data-focused={focused}
      data-testid="otp-slots"
    >
      <label htmlFor="register-otp" className="auth-sr-only">
        Kode OTP 6 angka
      </label>
      <div className="auth-otp-slots" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <span
            className="auth-otp-slot"
            key={index}
            data-active={focused && index === Math.min(selection.start, 5)}
            data-selected={
              focused && index >= selection.start && index < selection.end
            }
          >
            {value[index] || ""}
            {focused && index === value.length && !disabled && (
              <span className="auth-otp-caret" />
            )}
          </span>
        ))}
      </div>
      <input
        ref={input}
        id="register-otp"
        name="otp"
        type="text"
        value={value}
        className="auth-otp-input"
        autoComplete="one-time-code"
        inputMode="numeric"
        autoFocus
        required
        pattern="[0-9]{6}"
        maxLength={6}
        disabled={disabled}
        aria-invalid={state === "error"}
        aria-describedby="register-otp-note verify-registration-error otp-expiry"
        data-testid="register-otp"
        onChange={(event) => accept(event.target.value)}
        onPaste={(event) => {
          event.preventDefault();
          const digits = event.clipboardData.getData("text").replace(/\D/g, "");
          if (!digits || digits.length > 6) return;
          const start = input.current?.selectionStart ?? value.length;
          const end = input.current?.selectionEnd ?? value.length;
          const next =
            digits.length === 6
              ? digits
              : value.slice(0, start) + digits + value.slice(end);
          if (next.length > 6) return;
          onChange(next);
          const caret = digits.length === 6 ? 6 : start + digits.length;
          requestAnimationFrame(() => {
            input.current?.setSelectionRange(caret, caret);
            select();
          });
        }}
        onFocus={() => {
          setFocused(true);
          select();
        }}
        onBlur={() => setFocused(false)}
        onSelect={select}
        onKeyUp={select}
        onPointerDown={(event) => {
          pointerStart.current = event.clientX;
        }}
        onPointerUp={(event) => {
          if (
            pointerStart.current === null ||
            Math.abs(event.clientX - pointerStart.current) > 5
          )
            return;
          const box = event.currentTarget.getBoundingClientRect();
          const index = Math.max(
            0,
            Math.min(
              value.length,
              Math.floor(((event.clientX - box.left) / box.width) * 6),
            ),
          );
          requestAnimationFrame(() => {
            input.current?.setSelectionRange(
              index,
              Math.min(index + 1, value.length),
            );
            select();
          });
        }}
      />
    </div>
  );
});
