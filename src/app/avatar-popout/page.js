"use client";

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { VTuberStore, subscribeToStoreBroadcast } from '@/lib/store';

const VTuber3D = dynamic(() => import('@/components/VTuber3D'), {
  ssr: false,
});

export default function AvatarPopoutPage() {
  const [vrmUrl, setVrmUrl] = useState(VTuberStore.vrmUrl || '/models/avatar.vrm');
  const [isMirrored, setIsMirrored] = useState(true);
  const [windowSize, setWindowSize] = useState({ width: 640, height: 480 });

  useEffect(() => {
    // Handle resizing window dynamically
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Subscribe to BroadcastChannel updates from the main window
    const unsubscribe = subscribeToStoreBroadcast((data) => {
      if (data.vrmUrl && data.vrmUrl !== vrmUrl) {
        setVrmUrl(data.vrmUrl);
      }
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      unsubscribe();
    };
  }, [vrmUrl]);

  return (
    <div className="w-screen h-screen bg-black overflow-hidden flex flex-col items-center justify-center relative select-none">
      {/* Background Status Overlay (Fade out) */}
      <div className="absolute top-2 left-2 z-10 bg-black/60 backdrop-blur border border-emerald-500/30 px-3 py-1 rounded text-emerald-400 text-xs font-mono flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        OBS Pop-out Source Mode (Synced)
      </div>

      <VTuber3D
        isMirrored={isMirrored}
        vrmUrl={vrmUrl}
        width={windowSize.width}
        height={windowSize.height}
      />
    </div>
  );
}
