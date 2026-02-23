/**
 * queryKeyGuard.js - DEV Guard for Primitive Query Key Enforcement
 * 
 * ARCHITECTURAL RULE (PERMANENT):
 * - All React Query keys must contain ONLY primitive segments.
 * - Filters must be serialized inside factories.
 * - Hooks must NEVER stringify filters.
 * - Dev guard enforces this permanently.
 * 
 * ALLOWED TYPES:
 * - string
 * - number
 * - boolean
 * - null
 * 
 * FORBIDDEN TYPES:
 * - object (including arrays)
 * - function
 * - undefined
 * - symbol
 */

export function assertPrimitiveQueryKey(key) {
  if (process.env.NODE_ENV !== "development") return;

  key.forEach((segment, index) => {
    const type = typeof segment;
    
    // Explicitly check for forbidden types
    const isForbidden =
      type === "object" && segment !== null || // objects and arrays (but not null)
      type === "function" ||
      type === "undefined" ||
      type === "symbol";

    if (isForbidden) {
      console.error(
        "[QUERY KEY VIOLATION] Non-primitive segment detected:",
        { index, segment, type, isArray: Array.isArray(segment) }
      );
      throw new Error(
        `Query key contains non-primitive segment at index ${index} (type: ${type}). ` +
        `Factories must serialize filters. Hooks must pass raw objects only.`
      );
    }
  });
}