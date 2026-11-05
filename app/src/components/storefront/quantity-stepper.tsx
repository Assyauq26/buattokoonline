"use client";
import { useEffect, useRef } from "react";
import { Minus, Plus } from "lucide-react";
export function QuantityStepper({
  value,
  max,
  busy = false,
  onChange,
  minusId = "qty-minus",
  plusId = "qty-plus",
  valueId = "qty-value",
}: {
  value: number;
  max: number;
  busy?: boolean;
  onChange: (value: number) => void;
  minusId?: string;
  plusId?: string;
  valueId?: string;
}) {
  const current = useRef(value);
  useEffect(() => {
    current.current = value;
  }, [value]);
  function step(delta: number) {
    if (busy) return;
    const next = Math.max(
      1,
      Math.min(Math.max(1, max), current.current + delta),
    );
    if (next === current.current) return;
    current.current = next;
    onChange(next);
  }
  return (
    <div
      className="quantity-stepper"
      role="group"
      aria-label="Atur jumlah"
      onKeyDown={(event) => {
        if (
          ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(
            event.key,
          )
        ) {
          event.preventDefault();
          step(event.key === "ArrowUp" || event.key === "ArrowRight" ? 1 : -1);
        }
      }}
    >
      <button
        type="button"
        data-testid={minusId}
        aria-label="Kurangi jumlah"
        disabled={busy || value <= 1}
        onClick={() => step(-1)}
      >
        <Minus size={17} />
      </button>
      <output className="tabular-nums" data-testid={valueId} aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        data-testid={plusId}
        aria-label="Tambah jumlah"
        disabled={busy || value >= max}
        onClick={() => step(1)}
      >
        <Plus size={17} />
      </button>
    </div>
  );
}
