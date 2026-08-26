"use client";

import React, { useState, useRef, useEffect } from 'react';
import VTuber3D from './VTuber3D';
import { VTuberStore } from '../lib/store';

export default function FloatingAvatarWindow({ isOpen, onClose, defaultVrmUrl = '/models/avatar.vrm' }) {
  const [position, setPosition] = useState({ x: 20, y: 80 }); // Top-Right floating offset or default
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);
  const [sizePreset, setSizePreset] = useState('medium'); // 'small' | 'medium' | 'large'
  const [vrmUrl, setVrmUrl] = useState(defaultVrmUrl);
  const [isMirrored, setIsMirrored] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const windowRef = useRef(null);

  // Set default initial position to right side on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const windowWidth = window.innerWidth;
      setPosition({ x: Math.max(20, windowWidth - 520), y: 80 });
    }
  }, []);

  // Update VTuberStore when vrmUrl changes
  useEffect(() => {
    VTuberStore.vrmUrl = vrmUrl;
  }, [vrmUrl]);

  // Dragging logic
  const handleMouseDown = (e) => {
    if (e.target.closest('.no-drag')) return;
    setIsDragging(true);
    const rect = windowRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      let newX = e.clientX - dragOffset.x;
      let newY = e.clientY - dragOffset.y;

      // Keep within bounds
      newX = Math.max(10, Math.min(window.innerWidth - 100, newX));
      newY = Math.max(10, Math.min(window.innerHeight - 100, newY));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Handle open popout browser window (OBS / Multi-monitor mode)
  const handleOpenPopoutWindow = () => {
    const popoutUrl = `/avatar-popout`;
    const width = 640;
    const height = 520;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    window.open(
      popoutUrl,
      'VTuberAvatarPopoutWindow',
      `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=no,status=no`
    );
  };

  if (!isOpen) return null;

  // Dimensions based on preset
  const dimensions = {
    small: { width: 360, height: 270 },
    medium: { width: 480, height: 360 },
    large: { width: 640, height: 480 },
  }[sizePreset];

  return (
    <div
      ref={windowRef}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 9999,
        touchAction: 'none',
      }}
      className="shadow-2xl rounded-xl overflow-hidden border border-emerald-500/50 bg-gray-900/95 backdrop-blur-md transition-shadow duration-200"
    >
      {/* Header / Drag Bar */}
      <div
        onMouseDown={handleMouseDown}
        className="bg-gradient-to-r from-gray-950 via-gray-900 to-gray-950 px-3 py-2 flex items-center justify-between border-b border-gray-800 cursor-move select-none"
      >
        <div className="flex items-center gap-2">
          <span className="text-emerald-400 font-bold text-xs flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            🎭 3D Avatar (Floating)
          </span>
          <span className="text-[10px] text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">
            Drag me!
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 no-drag">
          {/* Settings Dropdown Toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            title="Pengaturan Model & Tampilan"
            className="p-1 text-gray-400 hover:text-emerald-400 hover:bg-gray-800 rounded transition-colors text-xs cursor-pointer"
          >
            ⚙️
          </button>

          {/* Size Preset Selector */}
          <div className="flex items-center bg-gray-950 p-0.5 rounded border border-gray-800 text-[10px]">
            <button
              onClick={() => setSizePreset('small')}
              className={`px-1.5 py-0.5 rounded cursor-pointer ${
                sizePreset === 'small' ? 'bg-emerald-600 text-white font-bold' : 'text-gray-400 hover:text-white'
              }`}
            >
              S
            </button>
            <button
              onClick={() => setSizePreset('medium')}
              className={`px-1.5 py-0.5 rounded cursor-pointer ${
                sizePreset === 'medium' ? 'bg-emerald-600 text-white font-bold' : 'text-gray-400 hover:text-white'
              }`}
            >
              M
            </button>
            <button
              onClick={() => setSizePreset('large')}
              className={`px-1.5 py-0.5 rounded cursor-pointer ${
                sizePreset === 'large' ? 'bg-emerald-600 text-white font-bold' : 'text-gray-400 hover:text-white'
              }`}
            >
              L
            </button>
          </div>

          {/* External Popout Window Button */}
          <button
            onClick={handleOpenPopoutWindow}
            title="Buka di Window Browser Terpisah (Pop-out untuk OBS / Dual Monitor)"
            className="px-2 py-0.5 bg-cyan-950 hover:bg-cyan-800 text-cyan-300 border border-cyan-700/60 rounded text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer"
          >
            ↗ Pop-out
          </button>

          {/* Minimize Button */}
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? 'Expand Window' : 'Minimize Window'}
            className="p-1 text-gray-400 hover:text-amber-400 hover:bg-gray-800 rounded transition-colors text-xs font-bold cursor-pointer"
          >
            {isMinimized ? '▢' : '—'}
          </button>

          {/* Close Button */}
          {onClose && (
            <button
              onClick={onClose}
              title="Tutup Floating Window"
              className="p-1 text-gray-400 hover:text-rose-400 hover:bg-gray-800 rounded transition-colors text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Settings Bar (Accordion Drawer) */}
      {showSettings && !isMinimized && (
        <div className="bg-gray-950 p-3 border-b border-gray-800 text-xs flex flex-wrap items-center justify-between gap-2 no-drag">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setVrmUrl('/models/avatar.vrm')}
              className={`px-2 py-1 rounded text-[11px] cursor-pointer ${
                vrmUrl === '/models/avatar.vrm' ? 'bg-emerald-600 text-white font-semibold' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              Model Default
            </button>

            <label className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-[11px] cursor-pointer border border-gray-700">
              Upload .VRM
              <input
                type="file"
                accept=".vrm"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const url = URL.createObjectURL(file);
                    setVrmUrl(url);
                  }
                }}
              />
            </label>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={VTuberStore.stereoMode || 'lean'}
              onChange={(e) => {
                VTuberStore.stereoMode = e.target.value;
              }}
              className="bg-gray-900 border border-gray-700 text-emerald-400 rounded px-1.5 py-0.5 text-[11px] focus:outline-none"
              title="Mode pergerakan Z avatar"
            >
              <option value="lean">Mode Lean (Miring)</option>
              <option value="hybrid">Mode Hybrid</option>
              <option value="translate">Mode Translate</option>
            </select>

            <label className="flex items-center gap-1.5 text-gray-300 cursor-pointer text-[11px]">
              <input
                type="checkbox"
                checked={isMirrored}
                onChange={(e) => setIsMirrored(e.target.checked)}
                className="accent-emerald-500 cursor-pointer"
              />
              Mirror
            </label>
          </div>
        </div>
      )}

      {/* Canvas Area / Render Avatar 3D */}
      {!isMinimized && (
        <div
          style={{
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
            position: 'relative',
          }}
          className="bg-black/90 flex items-center justify-center overflow-hidden"
        >
          <VTuber3DCustomContainer isMirrored={isMirrored} vrmUrl={vrmUrl} dimensions={dimensions} />
        </div>
      )}
    </div>
  );
}

// Wrapper for custom sizing of VTuber3D canvas
function VTuber3DCustomContainer({ isMirrored, vrmUrl, dimensions }) {
  return (
    <div
      style={{
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`,
        position: 'relative',
      }}
    >
      <VTuber3D isMirrored={isMirrored} vrmUrl={vrmUrl} width={dimensions.width} height={dimensions.height} />
    </div>
  );
}
