"use client";
import React, { useEffect, useRef, useState } from 'react';
import { VTuberStore, broadcastStoreUpdate } from '../lib/store';
import VTuber3D from './VTuber3D';
import FloatingAvatarWindow from './FloatingAvatarWindow';

const VTuberEngine = () => {
  const videoRef = useRef(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isWorkerReady, setIsWorkerReady] = useState(false);
  const [enableArmTracking, setEnableArmTracking] = useState(false);
  const [enableFingerTracking, setEnableFingerTracking] = useState(false);
  const [isMirrored, setIsMirrored] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  const [vrm1Mode, setVrm1Mode] = useState(false);
  const [vrmUrl, setVrmUrl] = useState(null);
  const [showFloatingWindow, setShowFloatingWindow] = useState(false);

  // Auto-Idle Sleep / Pause States & Refs
  const [isIdlePaused, setIsIdlePaused] = useState(false);
  const [enableAutoIdle, setEnableAutoIdle] = useState(true);
  const isIdlePausedRef = useRef(false);
  const lastActivityTimeRef = useRef(Date.now());
  const lastFaceDetectedTimeRef = useRef(Date.now());

  const workerRef = useRef(null);
  const requestRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const isWorkerBusy = useRef(false);

  useEffect(() => {
    isIdlePausedRef.current = isIdlePaused;
  }, [isIdlePaused]);

  useEffect(() => {
    console.log("Inisialisasi Web Worker...");
    // Initialize Web Worker
    workerRef.current = new Worker(new URL('../lib/tracker.worker.js', import.meta.url), { type: 'module' });

    workerRef.current.onmessage = (e) => {
      const { type, payload } = e.data;

      if (type === 'INIT_DONE') {
        setIsWorkerReady(true);
        console.log("Web Worker siap menerima frame!");
      } else if (type === 'PROCESS_DONE') {
        if (payload.riggedFace) {
          VTuberStore.riggedFace = payload.riggedFace;
          lastFaceDetectedTimeRef.current = Date.now();
        } else {
          VTuberStore.riggedFace = null;
        }

        if (payload.riggedPose) {
          VTuberStore.riggedPose = payload.riggedPose;
        } else {
          VTuberStore.riggedPose = null;
        }
        if (payload.hands) {
          VTuberStore.hands = payload.hands;
        } else {
          VTuberStore.hands = null;
        }
        if (payload.riggedHands) {
          VTuberStore.riggedHands = payload.riggedHands;
        } else {
          VTuberStore.riggedHands = null;
        }
        broadcastStoreUpdate();
        isWorkerBusy.current = false;
      } else if (type === 'ERROR') {
        console.error("Web Worker Error:", payload);
        isWorkerBusy.current = false;
      }
    };

    // Send init command
    workerRef.current.postMessage({ type: 'INIT' });

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // Idle Activity Event Listeners (Wake-on-Input)
  useEffect(() => {
    if (!isCameraActive || !enableAutoIdle) return;

    const resumeTracking = () => {
      lastActivityTimeRef.current = Date.now();
      if (isIdlePausedRef.current) {
        console.log("Wake-on-Input: Melanjutkan tracking!");
        setIsIdlePaused(false);
        isIdlePausedRef.current = false;
        requestRef.current = requestAnimationFrame(predictWebcam);
      }
    };

    const handleUserActivity = () => {
      resumeTracking();
    };

    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('touchstart', handleUserActivity);

    // Periodically check if idle (> 15s without face & input, or > 30s without input)
    const idleCheckInterval = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityTimeRef.current;
      const timeSinceFace = Date.now() - lastFaceDetectedTimeRef.current;

      if (
        !isIdlePausedRef.current &&
        ((timeSinceActivity > 15000 && timeSinceFace > 15000) || timeSinceActivity > 30000)
      ) {
        console.log("Idle Mode: Tracking diistirahatkan untuk menghemat CPU & GPU.");
        setIsIdlePaused(true);
        isIdlePausedRef.current = true;
      }
    }, 2000);

    return () => {
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      clearInterval(idleCheckInterval);
    };
  }, [isCameraActive, enableAutoIdle]);

  const predictWebcam = async () => {
    if (isIdlePausedRef.current) {
      // Pause loop completely to save CPU/GPU when idle
      return;
    }

    const video = videoRef.current;
    if (!video || !isWorkerReady) return;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      requestRef.current = requestAnimationFrame(predictWebcam);
      return;
    }

    if (lastVideoTimeRef.current !== video.currentTime && !isWorkerBusy.current) {
      lastVideoTimeRef.current = video.currentTime;
      isWorkerBusy.current = true;

      try {
        // Extract frame as ImageBitmap
        const imageBitmap = await createImageBitmap(video);

        // Send to worker and transfer ownership of imageBitmap
        workerRef.current.postMessage({
          type: 'PROCESS',
          payload: {
            imageBitmap: imageBitmap,
            timestamp: performance.now(),
            videoDimensions: {
              width: video.videoWidth,
              height: video.videoHeight
            },
            enableArmTracking: VTuberStore.enableArmTracking,
            enableFingerTracking: VTuberStore.enableFingerTracking
          }
        }, [imageBitmap]);

      } catch (err) {
        console.error("Gagal mengirim frame ke worker:", err);
        isWorkerBusy.current = false;
      }
    }

    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  const handleStart = async () => {
    if (!isWorkerReady) {
      alert("AI Model sedang dimuat di background, tunggu sebentar dan coba lagi...");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener("loadeddata", () => {
          setIsCameraActive(true);
          requestRef.current = requestAnimationFrame(predictWebcam);
        });
      }
    } catch (err) {
      console.error("Akses webcam ditolak atau terjadi error:", err);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', width: '100%' }}>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '20px' }}>
        <button
          onClick={handleStart}
          disabled={isCameraActive || !isWorkerReady}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            cursor: (isCameraActive || !isWorkerReady) ? 'not-allowed' : 'pointer',
            backgroundColor: isCameraActive ? '#333' : (!isWorkerReady ? '#888' : '#4CAF50'),
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          {isCameraActive ? 'Tracking Active' : (!isWorkerReady ? 'Memuat AI Model...' : 'START CAMERA')}
        </button>

        <button
          onClick={() => setShowFloatingWindow(!showFloatingWindow)}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            cursor: 'pointer',
            backgroundColor: showFloatingWindow ? '#006644' : '#111827',
            color: '#00ff88',
            border: '1px solid #00ff88',
            borderRadius: '4px'
          }}
        >
          🎭 {showFloatingWindow ? 'Sembunyikan Floating Window' : '✨ Buka Floating Avatar Window'}
        </button>
      </div>

      <div style={{ marginBottom: '20px', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
          <input
            type="checkbox"
            checked={enableArmTracking}
            onChange={(e) => {
              setEnableArmTracking(e.target.checked);
              VTuberStore.enableArmTracking = e.target.checked;
            }}
            style={{ width: '20px', height: '20px' }}
          />
          Arm Tracking
        </label>

        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
          <input
            type="checkbox"
            checked={enableFingerTracking}
            onChange={(e) => {
              setEnableFingerTracking(e.target.checked);
              VTuberStore.enableFingerTracking = e.target.checked;
            }}
            style={{ width: '20px', height: '20px' }}
          />
          Hand Tracking
        </label>

        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
          <input
            type="checkbox"
            checked={isMirrored}
            onChange={(e) => setIsMirrored(e.target.checked)}
            style={{ width: '20px', height: '20px' }}
          />
          Mirror
        </label>

        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
          <input
            type="checkbox"
            checked={enableAutoIdle}
            onChange={(e) => setEnableAutoIdle(e.target.checked)}
            style={{ width: '20px', height: '20px' }}
          />
          <span style={{ color: '#00ff88', fontWeight: 'bold' }}>
            ⚡ Auto-Pause saat Idle / Tidak Ada Pengguna (Hemat CPU & GPU)
          </span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
          <input
            type="checkbox"
            checked={showCamera}
            onChange={(e) => setShowCamera(e.target.checked)}
            style={{ width: '20px', height: '20px' }}
          />
          Tampilkan Kamera (Debug)
        </label>
      </div>

      {/* Idle Mode Banner Overlay */}
      {isIdlePaused && (
        <div style={{
          marginBottom: '20px',
          padding: '16px 20px',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid #10b981',
          borderRadius: '8px',
          color: '#34d399',
          display: 'flex',
          alignItems: 'center',
          justify: 'space-between',
          gap: '15px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>🌙</span>
            <div>
              <strong style={{ display: 'block', fontSize: '14px' }}>Idle Mode Aktif (Tracking Paused)</strong>
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                Tracking diistirahatkan untuk menghemat penggunaan CPU & GPU. Tekan tombol keyboard atau gerakkan mouse untuk membangunkan.
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              setIsIdlePaused(false);
              isIdlePausedRef.current = false;
              requestRef.current = requestAnimationFrame(predictWebcam);
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 'bold',
              fontSize: '12px',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            ⚡ Bangunkan (Resume)
          </button>
        </div>
      )}

      {/* Model Selection UI */}
      <div style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#1a1a1a', borderRadius: '8px', border: '1px solid #444', textAlign: 'center' }}>
        <h3 style={{ color: '#00ff88', marginBottom: '15px' }}>Pilih Model Avatar (Wajib)</h3>
        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', flexWrap: 'wrap' }}>

          {/* Use Default Button */}
          <button
            onClick={() => setVrmUrl('/models/avatar.vrm')}
            style={{
              padding: '10px 20px',
              backgroundColor: vrmUrl === '/models/avatar.vrm' ? '#00cc6a' : '#333',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Gunakan Model Default
          </button>

          {/* Upload Custom File */}
          <div style={{ position: 'relative' }}>
            <input
              type="file"
              accept=".vrm"
              onClick={(e) => { e.target.value = null; }}
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  // Create local blob URL for the uploaded file
                  const url = URL.createObjectURL(file);
                  setVrmUrl(url);
                }
              }}
              style={{ display: 'none' }}
              id="vrm-upload"
            />
            <label
              htmlFor="vrm-upload"
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                backgroundColor: vrmUrl && vrmUrl !== '/models/avatar.vrm' ? '#00cc6a' : '#333',
                color: 'white',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Upload Model Sendiri (.vrm)
            </label>
          </div>
        </div>
        {!vrmUrl && <p style={{ color: '#ff4444', marginTop: '10px', fontSize: '14px' }}>Belum ada model yang dipilih. Avatar tidak akan muncul.</p>}
      </div>

      {/* Container untuk 2 Kolom (Kiri dan Kanan) */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>

        {/* Kolom Kiri: Video Feed */}
        <div style={{ display: showCamera ? 'flex' : 'none', flexDirection: 'column', alignItems: 'center' }}>
          <h3 style={{ marginBottom: '10px', color: '#ccc' }}>Kamera Asli</h3>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            style={{
              width: '640px',
              height: '480px',
              backgroundColor: '#111',
              transform: isMirrored ? 'none' : 'scaleX(-1)',
              borderRadius: '8px',
              border: '2px solid #333'
            }}
          />
        </div>

        {/* Kolom Kanan: Avatar 3D */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h3 style={{ marginBottom: '10px', color: '#00ff88' }}>Avatar 3D (React Three Fiber)</h3>
          {/* Render Komponen 3D kita */}
          <VTuber3D isMirrored={isMirrored} vrmUrl={vrmUrl} />
        </div>

      </div>

      <FloatingAvatarWindow
        isOpen={showFloatingWindow}
        onClose={() => setShowFloatingWindow(false)}
        defaultVrmUrl={vrmUrl || '/models/avatar.vrm'}
      />
    </div>
  );
};

export default VTuberEngine;

