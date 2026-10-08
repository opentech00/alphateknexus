import { useEffect, useState } from 'react';
import { isCompactViewport, subscribeCompactViewport } from '../lib/viewport';

export function useCompactViewport() {
  const [compact, setCompact] = useState(isCompactViewport);
  useEffect(() => subscribeCompactViewport(() => setCompact(isCompactViewport())), []);
  return compact;
}
