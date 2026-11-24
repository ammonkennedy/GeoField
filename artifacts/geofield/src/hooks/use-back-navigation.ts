import { useLocation } from 'wouter';
import { goBackInApp } from '@/lib/app-navigation';

export function useBackNavigation() {
  const [, navigate] = useLocation();
  return (fallback = '/') => {
    if (!goBackInApp()) navigate(fallback, { replace: true });
  };
}
