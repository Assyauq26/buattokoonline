import type { Prisma } from "@prisma/client";
import { parseAppearance, type StoreAppearanceV1 } from "./schema";

export function assetIds(config: StoreAppearanceV1) {
  return [
    ...new Set(
      [
        config.identity.logoAssetId,
        ...(config.collections ?? []).flatMap((c) => [
          c.backgroundId,
          c.cutoutId,
        ]),
      ].filter((id): id is string => !!id),
    ),
  ];
}
export function usesAsset(value: unknown, id: string) {
  return !!value && assetIds(parseAppearance(value)).includes(id);
}
export function revisionUsing(
  id: string,
): Prisma.StoreAppearanceRevisionWhereInput {
  return {
    OR: [
      { config: { path: ["identity", "logoAssetId"], equals: id } },
      {
        config: {
          path: ["collections"],
          array_contains: [{ backgroundId: id }],
        },
      },
      { config: { path: ["collections"], array_contains: [{ cutoutId: id }] } },
    ],
  };
}
