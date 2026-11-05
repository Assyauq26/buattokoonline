import { HttpError } from "./response";
import { storeOrigin } from "./store-config";
export function assertSameOrigin(req: Request) {
  if (req.headers.get("origin") !== storeOrigin()) throw new HttpError("Origin tidak diizinkan", 403);
}
export function assertMutationOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== storeOrigin()) throw new HttpError("Origin tidak diizinkan", 403);
}
