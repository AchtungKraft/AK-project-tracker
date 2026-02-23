/**
 * queryKeyGuard.js - DEV Guard for Primitive Query Key Enforcement
 * 
 * ARCHITECTURAL RULE:
 * - No query key may contain object literals
 * - All filters must be serialized inside factories only
 * - No hook may stringify filters
 */

export function assertPrimitiveQueryKey(key) {
  if (process.env.NODE_ENV !== "development") return;

  key.forEach((segment, index) => {
    const type = typeof segment;
    const isPrimitive =
      segment === null ||
      type === "string" ||
      type === "number" ||
      type === "boolean";

    if (!isPrimitive) {
      console.error(
        "[QUERY KEY VIOLATION]",
        { index, segment, type }
      );
      throw new Error(
        `Query key contains non-primitive segment at index ${index}. Factories must serialize filters.`
      );
    }
  });
}