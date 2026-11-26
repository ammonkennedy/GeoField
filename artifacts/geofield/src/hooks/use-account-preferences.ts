import { useEffect, useState } from 'react';
import { ACCOUNT_PREFERENCES_UPDATED } from '@/lib/account-preferences';
export function useAccountPreferencesRevision() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(ACCOUNT_PREFERENCES_UPDATED, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(ACCOUNT_PREFERENCES_UPDATED, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  return revision;
}
