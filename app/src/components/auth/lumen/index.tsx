"use client";
// Registry-derived Lumen 4.1.0 primitives; React18 ref adaptation. See PROVENANCE.md and LICENSE.
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import {
  UserRound,
  LockKeyhole,
  Eye,
  EyeOff,
  Mail,
  Phone,
  ArrowRight,
  LoaderCircle,
} from "lucide-react";
const classes = (...values: (string | false | undefined)[]) =>
  values.filter(Boolean).join(" ");
type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  loading?: boolean;
  variant?:
    | "default"
    | "secondary"
    | "outline"
    | "ghost"
    | "link"
    | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
};
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      children,
      disabled,
      loading = false,
      variant = "default",
      size = "default",
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        data-slot="button"
        className={classes(
          "ui-button",
          `ui-button--${variant}`,
          size === "default" ? "ui-button--default-size" : `ui-button--${size}`,
          (disabled || loading) && "ui-button--disabled",
          loading && "ui-button--loading",
          className,
        )}
      >
        {loading && <span className="ui-spinner" aria-hidden="true" />}
        <span className="ui-button__content">{children}</span>
      </button>
    );
  },
);
export const Input = forwardRef<
  HTMLInputElement,
  ComponentPropsWithoutRef<"input">
>(function Input({ className, type = "text", ...props }, ref) {
  return (
    <input
      {...props}
      ref={ref}
      type={type}
      className={classes("ui-input", className)}
    />
  );
});
export function Label({
  className,
  ...props
}: ComponentPropsWithoutRef<"label">) {
  return <label {...props} className={classes("ui-label", className)} />;
}
export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<ComponentPropsWithoutRef<"input">, "type">
>(function Checkbox({ className, ...props }, ref) {
  return (
    <input
      {...props}
      ref={ref}
      type="checkbox"
      className={classes("ui-checkbox", className)}
    />
  );
});
const icons = {
  "user-round": UserRound,
  "lock-keyhole": LockKeyhole,
  eye: Eye,
  "eye-off": EyeOff,
  mail: Mail,
  phone: Phone,
  "arrow-right": ArrowRight,
  "loader-circle": LoaderCircle,
};
export function Icon({
  name,
  className,
}: {
  name: keyof typeof icons;
  className?: string;
}) {
  const Graphic = icons[name];
  return (
    <span className={classes("ui-icon", className)} aria-hidden="true">
      <Graphic size={20} strokeWidth={1.6} />
    </span>
  );
}
