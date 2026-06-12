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

      {/* Explanation Section */}
      <div className="max-w-2xl text-center text-gray-300 mb-8 bg-gray-900/80 p-5 rounded-lg border border-gray-700 shadow-md backdrop-blur-sm">
        <p className="mb-3">
          <strong className="text-emerald-400">Catatan:</strong> Program ini saat ini hanyalah sebuah <strong>Proof of Concept (PoC)</strong>. Tujuan utamanya adalah untuk menguji kelayakan dan performa motion tracking AI berbasis browser, khususnya untuk perangkat dengan spesifikasi rendah (low-end).
        </p>
        <div className="border-t border-gray-700 pt-3 mt-3">
          <strong className="text-blue-400">Rencana Aplikasi Kedepannya:</strong>
          <p className="mt-2 text-gray-300">
            Nantinya, pengguna dapat mengunggah model avatar 3D (format <strong>.vrm</strong>) mereka sendiri. Jika belum punya, kalian bisa membuatnya dengan mudah menggunakan software gratis seperti <strong>VRoid Studio</strong>. Setelah fitur tracking dimulai, akan tersedia sebuah <em>window</em> khusus (tanpa UI kamera) yang siap untuk dimasukkan langsung sebagai <strong>Browser / Web Source di OBS</strong> untuk kebutuhan live streaming!
          </p>
        </div>
      </div>
      <VTuberEngine />
    </main>
  );
}
