/** A successful HTTP request alone must never clear an offline dataset edit. */
export function confirmDatasetContent(
  saved: { id: string | number; name: string; description?: string | null; deletedAt?: string | null } | null | undefined,
  expected: { name: string; description?: string | null },
  id?: string,
) {
  if (!saved || (id !== undefined && String(saved.id) !== id) ||
      saved.name !== expected.name || (saved.description ?? "") !== (expected.description ?? "")) {
    throw new Error("Cloud did not confirm all dataset changes. The complete edit remains saved on this device.");
  }
}
