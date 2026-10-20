import { useMemo } from "react";
import { getGetRadarReferenceQueryKey, useGetRadarReference, type RadarReference } from "@workspace/api-client-react";
import { exposureRubric, groups, roles, skills, snapshot, version } from "@workspace/radar-data";

/** Public reference data bundled with the app; used when the API is unavailable. */
export const bundledReference: RadarReference = { version, groups, roles, skills, snapshot, exposureRubric };

/** Loads public reference data only (never CV text). Falls back to the bundled copy. */
export function useRadarReference() {
  const query = useGetRadarReference({
    query: { queryKey: getGetRadarReferenceQueryKey(), retry: 1, staleTime: Infinity, refetchOnWindowFocus: false },
  });
  // Matching taxonomy is bundled/versioned; never pair evidence with a newer API taxonomy.
  const compatible = query.data?.version === version;
  const reference = compatible ? query.data! : bundledReference;
  const source: "api" | "bundled" | "loading" = compatible ? "api" : query.isLoading ? "loading" : "bundled";
  const lookups = useMemo(() => ({
    skill: new Map(reference.skills.map((s) => [s.id, s])),
    group: new Map(reference.groups.map((g) => [g.id, g])),
  }), [reference]);
  return { reference, source, ...lookups };
}
