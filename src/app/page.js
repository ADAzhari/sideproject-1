"use client";

import dynamic from 'next/dynamic';

// Gunakan dynamic import dengan ssr: false karena MediaPipe membutuhkan navigator (Browser API)
const VTuberEngine = dynamic(() => import('@/components/VTuberEngine'), {
  ssr: false,
});

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-2 text-emerald-400">Side Project #1 by Azu ^_^ </h1>
      <a
        href="https://forms.gle/fDiVdCZt3vN8nqBX7"
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 hover:text-blue-300 underline mb-6 transition-colors"
      >
        Berikan Feedback (Form Kuesioner)
      </a>
      <VTuberEngine />
    </main>
  );
}
