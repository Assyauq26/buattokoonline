import type { Region } from "./region.validation";

export interface RegionSearchResult {
  path: Region[];
  updatedAt: string;
}

export function matchingRegionPaths(paths: Region[][], query: string, updatedAt: string): RegionSearchResult[] {
  const term = query.trim().toLocaleLowerCase("id");
  const found = new Map<string, RegionSearchResult>();
  for (const path of paths) {
    for (let index = 0; index < path.length; index++) {
      if (!path[index].name.toLocaleLowerCase("id").includes(term)) continue;
      const selected = path.slice(0, index + 1);
      const key = JSON.stringify(selected.map(region => region.code));
      found.set(key, { path: selected, updatedAt });
    }
  }
  return [...found.values()].sort((a, b) =>
    a.path.length - b.path.length || a.path.at(-1)!.name.localeCompare(b.path.at(-1)!.name, "id")
  ).slice(0, 50);
}
