"use client";
import React, { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import * as Kalidokit from 'kalidokit';
import { VTuberStore } from '../lib/store';
import VTuber3D from './VTuber3D';

const VTuberEngine = () => {
  const videoRef = useRef(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const faceLandmarkerRef = useRef(null);
  const requestRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);

  // Inisialisasi MediaPipe Face Landmarker
  useEffect(() => {
    const initMediaPipe = async () => {
      try {
        console.log("Memuat MediaPipe WASM dan Model...");
        
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        
        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU"
          },
          outputFaceBlendshapes: true, 
          outputFacialTransformationMatrixes: true,
          runningMode: "VIDEO", 
          numFaces: 1 
        });
        
        faceLandmarkerRef.current = faceLandmarker;
        console.log("MediaPipe Face Landmarker siap!");
      } catch (error) {
        console.error("Gagal memuat MediaPipe:", error);
      }
    };

    initMediaPipe();

    return () => {
      if (faceLandmarkerRef.current && typeof faceLandmarkerRef.current.close === 'function') {
        faceLandmarkerRef.current.close();
      }
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const predictWebcam = () => {
    const video = videoRef.current;
    if (!video || !faceLandmarkerRef.current) return;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      requestRef.current = requestAnimationFrame(predictWebcam);
      return;
    }

    const startTimeMs = performance.now();
    if (lastVideoTimeRef.current !== video.currentTime) {
      lastVideoTimeRef.current = video.currentTime;
      try {
        const results = faceLandmarkerRef.current.detectForVideo(video, startTimeMs);

        // --- PUSH DATA KE GLOBAL STORE MENGGUNAKAN KALIDOKIT ---
        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
          const faceLandmarks = results.faceLandmarks[0];
          
          // Kalidokit membutuhkan objek video untuk rasio dimensi
          const riggedFace = Kalidokit.Face.solve(faceLandmarks, {
            runtime: "mediapipe",
            video: video
          });

          // Simpan hasil rig Kalidokit ke global store
          VTuberStore.riggedFace = riggedFace;
        }

      } catch (err) {
        console.error("MediaPipe detection error:", err);
      }
    }

    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  const handleStart = async () => {
    if (!faceLandmarkerRef.current) {
      alert("MediaPipe masih memuat, tunggu sebentar dan coba lagi...");
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
        disabled={isCameraActive}
        style={{ 
          padding: '10px 20px', 
          fontSize: '16px', 
          marginBottom: '20px',
          cursor: isCameraActive ? 'not-allowed' : 'pointer',
          backgroundColor: isCameraActive ? '#333' : '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '4px'
        }}
      >
        {isCameraActive ? 'Tracking Active' : 'START CAMERA'}
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

