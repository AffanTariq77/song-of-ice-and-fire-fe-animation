'use client';

import dynamic from 'next/dynamic';

const AmbientCreaturesScene = dynamic(() => import('@/components/AmbientCreaturesScene'), { ssr: false });

export default function Home() {
  return <AmbientCreaturesScene />;
}
