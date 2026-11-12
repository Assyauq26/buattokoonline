import { expect } from "vitest";
import { databaseTestTarget } from "./database-target";

if (process.env.STORE_DATABASE_TEST_ROUTING === "yes") {
  const file = expect.getState().testPath;
  if (!file) throw new Error("Cannot identify database test profile");
  const target = databaseTestTarget(file.replaceAll("\\", "/"), process.env);
  process.env.DATABASE_URL = target;
  process.env.DIRECT_URL = target;
}
