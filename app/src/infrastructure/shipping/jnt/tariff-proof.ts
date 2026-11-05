import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "@/lib/http-error";
import type { JntConfig, JntEnvironment } from "./official-config";

function digest(expires: number, config: JntConfig, environment: JntEnvironment, releaseStamp: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new HttpError("Konfigurasi server untuk hasil uji J&T belum siap", 503);
  return createHmac("sha256", secret).update(JSON.stringify(["jnt-tariff-v1", expires, environment, releaseStamp, config])).digest();
}

export function issueTariffProof(config: JntConfig, environment: JntEnvironment, releaseStamp: string) {
  const expires = Date.now() + 24 * 60 * 60_000;
  return expires + "." + digest(expires, config, environment, releaseStamp).toString("hex");
}

export function validTariffProof(proof: string | null | undefined, config: JntConfig, environment: JntEnvironment, releaseStamp: string) {
  if (!proof || !/^\d{13}\.[a-f0-9]{64}$/.test(proof)) return false;
  const [expiry, signature] = proof.split(".");
  const expires = Number(expiry);
  return expires > Date.now() && timingSafeEqual(digest(expires, config, environment, releaseStamp), Buffer.from(signature, "hex"));
}
