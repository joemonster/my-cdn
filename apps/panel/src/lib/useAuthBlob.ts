'use client';

import { useEffect, useState } from 'react';
import { api } from './api';

export function useAuthBlob(id: string | null, type?: 'thumbnail'): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    api.getFileBlobUrl(id, type)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        objectUrl = u;
        setUrl(u);
      })
      .catch(() => {
        // Silent failure — caller renders a placeholder when url is null
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, type]);

  return url;
}
