import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useServiceBrandingImages } from '../lib/media';
import { buildCatalog, type CatalogItem } from '../lib/serviceCatalog';
import type { Service } from '../types';
import { useDisplayCurrency } from './useDisplayCurrency';

export function useServiceCatalog() {
  const { images } = useServiceBrandingImages();
  const { format } = useDisplayCurrency();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const { data, error: err } = await supabase
      .from('services')
      .select('*')
      .eq('is_active', true)
      .eq('is_internal', false)
      .order('created_at');
    if (err) {
      setError(err.message || 'Could not load services.');
      setServices([]);
    } else {
      setServices((data as Service[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const catalog: CatalogItem[] = useMemo(
    () => buildCatalog(services, images, (n) => format(n, { compact: true })),
    [services, images, format],
  );

  return { services, catalog, loading, error, reload: load };
}
