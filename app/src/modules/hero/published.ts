
import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { readHeroPublishedUncached, HERO_TAG } from "./service";
import { emptyHero } from "./schema";
const cached = unstable_cache(readHeroPublishedUncached, [HERO_TAG], { tags: [HERO_TAG], revalidate: 60 });
export const getPublishedHero = cache(async () => {
  try { return await cached(); }
  catch { return { config: emptyHero(), version: 0 }; }
});
