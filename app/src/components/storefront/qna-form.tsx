"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { askQuestionAction } from "@/modules/reviews/reviews.actions";

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} data-testid="qna-submit">
      {pending ? "Mengirim..." : "Kirim Pertanyaan"}
    </Button>
  );
}

export function QnaForm({ productId, slug }: { productId: string; slug: string }) {
  const [state, action] = useFormState(askQuestionAction, { ok: false } as any);
  return (
    <form action={action} className="space-y-2" data-testid="qna-form">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="slug" value={slug} />
      <Textarea name="body" placeholder="Punya pertanyaan tentang produk ini?" required />
      {state?.ok === false && state?.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state?.ok && <p className="text-sm text-success">Pertanyaan terkirim!</p>}
      <SubmitBtn />
    </form>
  );
}
