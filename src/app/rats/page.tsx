'use client';

import dynamic from 'next/dynamic';

const RatsScene = dynamic(() => import('@/components/RatsScene'), { ssr: false });

export default function RatsPage() {
  return <RatsScene />;
}
