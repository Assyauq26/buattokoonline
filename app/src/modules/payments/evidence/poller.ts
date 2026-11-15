import "server-only";
import type { Observation } from "./policy";

export interface EvidencePage {
  observations: Observation[];
  next?: string;
}
export interface PollTransport {
  page(input: {
    since: Date;
    cursor?: string;
    signal: AbortSignal;
  }): Promise<EvidencePage>;
}
/** A merchant/mailbox poll, never a buyer-tab poll. Persist each page before moving
 * forward. Caller commits cursor only after complete success under a live lease.
 * Replays after failure rely on permanent DB deduplication. */
export async function pollEvidence(
  transport: PollTransport,
  input: { since: Date; cursor?: string },
  persist: (o: Observation) => Promise<void>,
  maxPages = 5,
) {
  if (
    !Number.isInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 10 ||
    !Number.isFinite(input.since.getTime())
  )
    throw new Error("Batas polling tidak valid");
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 60_000);
  const seen = new Set<string>();
  const deadline = new Promise<never>((_, reject) =>
    controller.signal.addEventListener(
      "abort",
      () => reject(new Error("Polling timeout")),
      { once: true },
    ),
  );
  let cursor = input.cursor,
    count = 0;
  try {
    for (let page = 0; page < maxPages; page++) {
      if (controller.signal.aborted) throw new Error("Polling timeout");
      // Overlap protects delayed observations. Transport must preserve stable IDs.
      const result = await Promise.race([
        deadline,
        transport.page({
          since: new Date(input.since.getTime() - 7 * 86400_000),
          cursor,
          signal: controller.signal,
        }),
      ]);
      if (result.observations.length > 100)
        throw new Error("Halaman mutasi terlalu besar");
      for (const o of result.observations) {
        await Promise.race([deadline, persist(o)]);
        count++;
      }
      if (!result.next) return { count, complete: true as const };
      if (seen.has(result.next)) throw new Error("Paginasi berulang");
      seen.add(result.next);
      cursor = result.next;
    }
    // Caller must not mark caught-up or move its time watermark on a partial scan.
    return { count, complete: false as const, resumeCursor: cursor };
  } finally {
    clearTimeout(timer);
  }
}
