"use client";
import React, { useEffect, useRef, useState } from 'react';
import { VTuberStore } from '../lib/store';
import VTuber3D from './VTuber3D';

const VTuberEngine = () => {
  const videoRef = useRef(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isWorkerReady, setIsWorkerReady] = useState(false);
  
  const workerRef = useRef(null);
  const requestRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const isWorkerBusy = useRef(false);

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
        }
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

  const predictWebcam = async () => {
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
            }
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
      
      <button 
        onClick={handleStart} 
        disabled={isCameraActive || !isWorkerReady}
        style={{ 
          padding: '10px 20px', 
          fontSize: '16px', 
          marginBottom: '20px',
          cursor: (isCameraActive || !isWorkerReady) ? 'not-allowed' : 'pointer',
          backgroundColor: isCameraActive ? '#333' : (!isWorkerReady ? '#888' : '#4CAF50'),
          color: 'white',
          border: 'none',
          borderRadius: '4px'
        }}
      >
        {isCameraActive ? 'Tracking Active' : (!isWorkerReady ? 'Memuat AI Model...' : 'START CAMERA')}
      </button>

      {/* Container untuk 2 Kolom (Kiri dan Kanan) */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
        
        {/* Kolom Kiri: Video Feed */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h3 style={{ marginBottom: '10px', color: '#ccc' }}>Kamera Asli</h3>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            style={{ 
              width: '640px', 
              height: '480px', 
              backgroundColor: '#111',
              transform: 'scaleX(-1)', // Mirror
              borderRadius: '8px',
              border: '2px solid #333'
            }} 
          />
        </div>

        {/* Kolom Kanan: Avatar 3D */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h3 style={{ marginBottom: '10px', color: '#00ff88' }}>Avatar 3D (React Three Fiber)</h3>
          {/* Render Komponen 3D kita */}
          <VTuber3D />
        </div>

      </div>
      
    </div>
  );
};

export default VTuberEngine;

