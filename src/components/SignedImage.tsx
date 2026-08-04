import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signedDocumentUrl } from '../lib/storageUrls';

interface SignedImageProps {
  source: string;
  alt: string;
  className?: string;
  client?: SupabaseClient;
}

/**
 * Renders an image held in the private documents bucket by resolving a
 * short-lived signed URL first.
 */
export function SignedImage({ source, alt, className, client }: SignedImageProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    signedDocumentUrl(source, 300, client).then((signed) => {
      if (active) setUrl(signed);
    });
    return () => {
      active = false;
    };
  }, [source, client]);

  if (!url) {
    return (
      <div
        className={className}
        style={{ minHeight: 80 }}
        aria-label={alt}
      />
    );
  }

  return <img src={url} alt={alt} className={className} />;
}
