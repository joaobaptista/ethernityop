import { useEffect, useState } from 'react';
import guardianRepository from '../infrastructure/guardianRepository.js';
import { getStoredAuthToken } from '../../../core/api/apiUrl.js';

export function pickPrimaryGuardian(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list.find((g) => g.canTriggerDelivery && g.status === 'active') || list[0];
}

export default function usePrimaryGuardian() {
  const [guardian, setGuardian] = useState(null);

  useEffect(() => {
    const token = getStoredAuthToken();
    if (!token) return undefined;
    let active = true;
    guardianRepository
      .getGuardians(token)
      .then((list) => {
        if (active) setGuardian(pickPrimaryGuardian(list));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return guardian;
}
