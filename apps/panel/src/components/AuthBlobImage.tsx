'use client';

import { useAuthBlob } from '@/lib/useAuthBlob';

interface AuthBlobImageProps {
  id: string;
  type?: 'thumbnail';
  alt?: string;
  className?: string;
}

export function AuthBlobImage({ id, type, alt, className }: AuthBlobImageProps) {
  const url = useAuthBlob(id, type);

  if (!url) {
    return <div className={`${className ?? ''} bg-dark-700 animate-pulse`} />;
  }

  return <img src={url} alt={alt ?? ''} loading="lazy" className={className} />;
}
