'use client';

import dynamic from 'next/dynamic';

const PerchScene = dynamic(() => import('@/components/PerchScene'), { ssr: false });

export default function PerchPage() {
  return <PerchScene />;
}
