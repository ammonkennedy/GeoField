const SCOPED_COLLECTIONS = new Set([
  "geofield_offline_queue", "geofield_local_datasets", "geofield_strike_dip",
  "geofield_cloud_samples", "geofield_recently_deleted", "geofield_trips",
]);

export function getStorageAccountId(): string | null {
  const configuredKey = localStorage.getItem("geofield-active-account-profile");
  const candidates: string[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key?.startsWith("geofield-account:")) candidates.push(key);
  }
  // Never select an arbitrary test/staging account when multiple pools exist.
  const key = configuredKey ?? (candidates.length === 1 ? candidates[0] : null);
  if (!key) return null;
  try {
    const profile = JSON.parse(localStorage.getItem(key) || "null");
    if (profile?.signedOut) return null;
    if (typeof profile?.user?.id === "string" && profile.user.id) return profile.user.id;
  } catch { /* An unreadable profile cannot authorize account access. */ }

  return null;
}

export function assertStorageAccount(expectedAccountId: string | null | undefined): void {
  if (!expectedAccountId || getStorageAccountId() !== expectedAccountId) {
    throw new Error("Your account changed while saving. Sign back into the original account before saving this draft.");
  }
}

export function accountCollectionKey(key: string): string {
  if (!SCOPED_COLLECTIONS.has(key)) return key;
  const accountId = getStorageAccountId();
  const scoped = `${key}:account:${accountId ?? "signed-out"}`;
  if (!accountId) return scoped;
  // Legacy collections had no owner. Preserve their original bytes and assign
  // them once to the remembered account during upgrade, never to later logins.
  const ownerKey = "geofield_legacy_data_owner";
  let owner = localStorage.getItem(ownerKey);
  if (!owner) { localStorage.setItem(ownerKey, accountId); owner = accountId; }
  if (owner === accountId && localStorage.getItem(scoped) === null && localStorage.getItem(`${scoped}__backup`) === null) {
    for (const suffix of ["__backup", ""]) {
      const value = localStorage.getItem(`${key}${suffix}`);
      if (value !== null) localStorage.setItem(`${scoped}${suffix}`, value);
    }
  }
  return scoped;
}

export function removeAccountLocalData(accountId: string) {
  const keys = [...SCOPED_COLLECTIONS].map((key) => `${key}:account:${accountId}`);
  keys.push(`geofield_field_notes:${accountId}`);
  if (localStorage.getItem("geofield_legacy_data_owner") === accountId) keys.push(...SCOPED_COLLECTIONS);
  for (const key of keys) {
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}__backup`);
  }
  // The photo database is shared. Never erase another account's attachments.
}
