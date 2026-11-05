import { makeDefault } from "./schema";
export function initialPublishedAppearance(env: Readonly<Record<string, string | undefined>> = process.env) {
  const config = makeDefault();
  const name = env.STORE_NAME;
  if (name && name === name.trim() && name.length <= 100 && !/[\x00-\x1f\x7f]/.test(name)) config.identity.name = name;
  return config;
}
