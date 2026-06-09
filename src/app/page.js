"use client";

import dynamic from 'next/dynamic';

// Gunakan dynamic import dengan ssr: false karena MediaPipe membutuhkan navigator (Browser API)
const VTuberEngine = dynamic(() => import('@/components/VTuberEngine'), {
  ssr: false,
});

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-6 text-emerald-400">Phase 2: Live Face Tracking</h1>
      <VTuberEngine />
    </main>
  );
}
