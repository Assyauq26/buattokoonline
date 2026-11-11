"use client";

export async function shippingRequest<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const json = await response.json();
  if (!response.ok || !json.success)
    throw new Error(json.error?.message || "Permintaan pengiriman gagal");
  return json.data as T;
}
export function shippingJson(method: "POST" | "PUT", input: unknown) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  };
}

export type ShippingStatus = {
  manualFlat: number | null;
  activeEnvironment: string | null;
  activeMappingVersion: string | null;
  checks: { label: string; ready: boolean; reason?: string }[];
};
