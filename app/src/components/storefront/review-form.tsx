"use client";
import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action";
import { createReviewAction } from "@/modules/reviews/reviews.actions";
function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="purchase-submit"
      disabled={pending}
      data-testid="review-submit"
    >
      {pending ? "Mengirim…" : "Kirim Ulasan"}
    </Button>
  );
}
export function ReviewForm({ orderItemId }: { orderItemId: string }) {
  const [state, action] = useFormState(createReviewAction, {
    ok: false,
  } as ActionResult<{ id: string }>);
  const [rating, setRating] = useState(5);
  const prefix = useId(),
    error = useRef<HTMLParagraphElement>(null),
    submitting = useRef(false);
  useEffect(() => {
    submitting.current = false;
    if (state.error) error.current?.focus();
  }, [state]);
  if (state.ok)
    return (
      <p role="status" data-testid="review-success">
        Ulasan berhasil dikirim. Terima kasih atas ulasan Anda.
      </p>
    );
  return (
    <form
      action={action}
      className="space-y-4"
      data-testid="review-form"
      onSubmit={(event) => {
        if (submitting.current) event.preventDefault();
        else submitting.current = true;
      }}
    >
      <input type="hidden" name="orderItemId" value={orderItemId} />
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Rating</legend>
        <div className="review-rating flex flex-wrap gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className="grid h-11 w-11 cursor-pointer place-items-center rounded-lg"
              aria-label={`${n} bintang`}
            >
              <input
                type="radio"
                aria-label={`${n} bintang`}
                name="rating"
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                className="sr-only"
                required
              />
              <Star
                size={24}
                aria-hidden="true"
                className={n <= rating ? "review-star-filled" : ""}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <Label htmlFor={`${prefix}-title`}>Judul (opsional)</Label>
        <Input id={`${prefix}-title`} name="title" maxLength={120} />
      </div>
      <div>
        <Label htmlFor={`${prefix}-body`}>Ulasan</Label>
        <Textarea
          id={`${prefix}-body`}
          name="body"
          minLength={3}
          maxLength={2000}
          required
          placeholder="Bagikan pengalaman Anda setelah menerima produk"
        />
      </div>
      {state.error && (
        <p
          role="alert"
          ref={error}
          tabIndex={-1}
          className="text-sm text-destructive"
        >
          {state.error}
        </p>
      )}
      <SubmitBtn />
    </form>
  );
}
