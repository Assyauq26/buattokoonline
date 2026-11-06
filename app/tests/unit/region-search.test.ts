import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { matchingRegionPaths } from "@/modules/regions/region-search";
import { searchRegions } from "@/modules/regions/region.service";

describe("direct region search", () => {
  const paths = [
    [{ code: "A", name: "Province A" }, { code: "A1", name: "City A" }, { code: "JNT-1", name: "Sukamaju" }],
    [{ code: "B", name: "Province B" }, { code: "B1", name: "City B" }, { code: "JNT-2", name: "Sukamaju" }],
  ];
  it("retains the full hierarchy for same-name districts", () => {
    expect(matchingRegionPaths(paths, "sUKamaju", "version").map(result => result.path)).toEqual(paths);
  });
  it("selects the matching level and deduplicates repeated parents", () => {
    expect(matchingRegionPaths([...paths, paths[0]], "Province A", "version")).toEqual([
      { path: [paths[0][0]], updatedAt: "version" },
    ]);
    expect(matchingRegionPaths(paths, "City B", "version")[0].path).toEqual(paths[1].slice(0, 2));
  });
  it("finds a district without first selecting its parents", () => {
    const result = searchRegions("Gambir").find(result => result.path.at(-1)?.code === "31.71.01");
    expect(result?.path.map(region => region.code)).toEqual(["31", "31.71", "31.71.01"]);
    expect(searchRegions("no-such-region-test")).toEqual([]);
  });
});
