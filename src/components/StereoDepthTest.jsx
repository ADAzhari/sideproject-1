"use client";

import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, FaceLandmarker, PoseLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';
import * as Kalidokit from 'kalidokit';
import { VTuberStore, broadcastStoreUpdate } from '../lib/store';
import FloatingAvatarWindow from './FloatingAvatarWindow';

export default function StereoDepthTest() {
  // Device Selection States
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedCamA, setSelectedCamA] = useState('');
  const [selectedCamB, setSelectedCamB] = useState('');

  // Active Stream States
  const [isStreaming, setIsStreaming] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [modelStatus, setModelStatus] = useState('Memuat MediaPipe Vision WASM...');

  // Configuration & Calibration States
  const [baselineCm, setBaselineCm] = useState(12.0); // Baseline distance between 2 webcams in cm
  const [focalLengthPx, setFocalLengthPx] = useState(600); // Estimated focal length in pixels
  const [sensitivity, setSensitivity] = useState(0.015); // Sensitivity for VRM 3D Z offset conversion
  const [targetLandmark, setTargetLandmark] = useState('1'); // '1' = Nose tip, '33' = Left eye, '263' = Right eye

  // Real-time Metrics State
  const [metrics, setMetrics] = useState({
    camA_X: 0,
    camA_Y: 0,
    camB_X: 0,
    camB_Y: 0,
    disparityPx: 0,
    calculatedZCm: 0,
    neutralDisparity: null,
    neutralZCm: null,
    deltaZCm: 0,
    direction: 'NETRAL',
    fpsA: 0,
    fpsB: 0
  });

  // Store Bridge & Stereo Behavior States
  const [bridgeToStore, setBridgeToStore] = useState(true);
  const [showFloatingAvatar, setShowFloatingAvatar] = useState(true);
  const [stereoMode, setStereoMode] = useState('lean'); // 'lean' | 'hybrid' | 'translate'
  const [stereoLeanSensitivity, setStereoLeanSensitivity] = useState(0.03);
  const [invertStereoLean, setInvertStereoLean] = useState(false);

  // Full Tracking Toggles for Cam A (Master)
  const [enableArmTracking, setEnableArmTracking] = useState(false);
  const [enableFingerTracking, setEnableFingerTracking] = useState(false);

  // Auto-Idle Sleep / Pause States & Refs
  const [isIdlePaused, setIsIdlePaused] = useState(false);
  const [enableAutoIdle, setEnableAutoIdle] = useState(true);
  const isIdlePausedRef = useRef(false);
  const lastActivityTimeRef = useRef(Date.now());
  const lastFaceDetectedTimeRef = useRef(Date.now());

  // Refs
  const videoARef = useRef(null);
  const videoBRef = useRef(null);
  const canvasARef = useRef(null);
  const canvasBRef = useRef(null);

  const landmarkerARef = useRef(null);
  const landmarkerBRef = useRef(null);
  const poseLandmarkerRef = useRef(null);
  const handLandmarkerRef = useRef(null);

  const requestAnimRef = useRef(null);
  const neutralDisparityRef = useRef(null);
  const neutralZRef = useRef(null);

  const frameCountARef = useRef(0);
  const frameCountBRef = useRef(0);
  const lastFpsCalcRef = useRef(performance.now());

  useEffect(() => {
    isIdlePausedRef.current = isIdlePaused;
  }, [isIdlePaused]);

  // Idle Activity Event Listeners (Wake-on-Input)
  useEffect(() => {
    if (!isStreaming || !enableAutoIdle) return;

    const resumeTracking = () => {
      lastActivityTimeRef.current = Date.now();
      if (isIdlePausedRef.current) {
        setIsIdlePaused(false);
        isIdlePausedRef.current = false;
        requestAnimRef.current = requestAnimationFrame(processFrameRef.current);
      }
    };

    const handleUserActivity = () => {
      resumeTracking();
    };

    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('touchstart', handleUserActivity);

    const idleCheckInterval = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityTimeRef.current;
      const timeSinceFace = Date.now() - lastFaceDetectedTimeRef.current;

      if (
        !isIdlePausedRef.current &&
        ((timeSinceActivity > 15000 && timeSinceFace > 15000) || timeSinceActivity > 30000)
      ) {
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
  }, [isStreaming, enableAutoIdle]);

  // 1. Enumerate available video devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        // Request temporary stream to get full labels on browsers
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }).catch(() => null);
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (tempStream) {
          tempStream.getTracks().forEach(track => track.stop());
        }

        const videoInputs = devices.filter(device => device.kind === 'videoinput');
        setVideoDevices(videoInputs);

        if (videoInputs.length >= 2) {
          setSelectedCamA(videoInputs[0].deviceId);
          setSelectedCamB(videoInputs[1].deviceId);
        } else if (videoInputs.length === 1) {
          setSelectedCamA(videoInputs[0].deviceId);
          setSelectedCamB(videoInputs[0].deviceId); // Fallback for single cam testing
        }
      } catch (err) {
        console.error("Gagal mendapatkan daftar webcam:", err);
      }
    };

    getDevices();
  }, []);

  // 2. Initialize MediaPipe Face, Pose & Hand Landmarkers for Dual Camera Processing
  useEffect(() => {
    let isMounted = true;

    const initMediaPipe = async () => {
      try {
        setModelStatus("Merapikan WASM & memuat model MediaPipe Face, Pose & Hand Landmarkers...");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        const createFaceLandmarker = async (outputBlendshapes = false) => {
          return await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
              delegate: "GPU"
            },
            outputFaceBlendshapes: outputBlendshapes,
            outputFacialTransformationMatrixes: outputBlendshapes,
            runningMode: "VIDEO",
            numFaces: 1
          });
        };

        const createPoseLandmarker = async () => {
          return await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
              delegate: "GPU"
            },
            runningMode: "VIDEO",
            numPoses: 1
          });
        };

        const createHandLandmarker = async () => {
          return await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
              delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 2
          });
        };

        const [lmA, lmB, poseLm, handLm] = await Promise.all([
          createFaceLandmarker(true), // Cam A: full facial expressions & tracking!
          createFaceLandmarker(false), // Cam B: disparity landmark tip tracking
          createPoseLandmarker(),
          createHandLandmarker()
        ]);

        if (isMounted) {
          landmarkerARef.current = lmA;
          landmarkerBRef.current = lmB;
          poseLandmarkerRef.current = poseLm;
          handLandmarkerRef.current = handLm;
          setIsModelLoading(false);
          setModelStatus("MediaPipe Face, Pose & Hand Siap untuk Dual Stereo Testing!");
        }
      } catch (err) {
        console.error("Gagal menginisialisasi MediaPipe Landmarker:", err);
        if (isMounted) {
          setModelStatus("Error memuat MediaPipe: " + err.message);
        }
      }
    };

    initMediaPipe();

    return () => {
      isMounted = false;
      if (landmarkerARef.current) landmarkerARef.current.close();
      if (landmarkerBRef.current) landmarkerBRef.current.close();
      if (poseLandmarkerRef.current) poseLandmarkerRef.current.close();
      if (handLandmarkerRef.current) handLandmarkerRef.current.close();
    };
  }, []);

  // 3. Start Dual Camera Streams
  const startDualStreams = async () => {
    if (!selectedCamA || !selectedCamB) {
      alert("Harap pilih Kamera A dan Kamera B terlebih dahulu!");
      return;
    }

    try {
      const streamA = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: selectedCamA }, width: 640, height: 480 }
      });
      if (videoARef.current) {
        videoARef.current.srcObject = streamA;
        await videoARef.current.play();
      }

      const streamB = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: selectedCamB }, width: 640, height: 480 }
      });
      if (videoBRef.current) {
        videoBRef.current.srcObject = streamB;
        await videoBRef.current.play();
      }

      setIsStreaming(true);
    } catch (err) {
      console.error("Gagal membuka stream 2 webcam:", err);
      alert("Gagal membuka 2 webcam. Pastikan kedua webcam terhubung dan tidak dipakai aplikasi lain.");
    }
  };

  // 4. Stop Dual Camera Streams
  const stopDualStreams = () => {
    if (requestAnimRef.current) {
      cancelAnimationFrame(requestAnimRef.current);
    }
    if (videoARef.current && videoARef.current.srcObject) {
      videoARef.current.srcObject.getTracks().forEach(t => t.stop());
      videoARef.current.srcObject = null;
    }
    if (videoBRef.current && videoBRef.current.srcObject) {
      videoBRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoBRef.current.srcObject = null;
    }
    setIsStreaming(false);

    if (VTuberStore.enableStereoZ) {
      VTuberStore.enableStereoZ = false;
      VTuberStore.stereoZOffset = 0;
    }
  };

  // 5. Calibration Handler (Set Netral)
  const handleCalibrateNeutral = () => {
    if (metrics.disparityPx > 0) {
      neutralDisparityRef.current = metrics.disparityPx;
      neutralZRef.current = metrics.calculatedZCm;
      setMetrics(prev => ({
        ...prev,
        neutralDisparity: metrics.disparityPx,
        neutralZCm: metrics.calculatedZCm
      }));
      console.log(`[Stereo Calibration] Netral d0 = ${metrics.disparityPx.toFixed(2)}px, Z0 = ${metrics.calculatedZCm.toFixed(2)}cm`);
    } else {
      alert("Wajah belum terdeteksi secara sempurna di kedua kamera untuk kalibrasi.");
    }
  };

  // 6. Stereo Processing Animation Loop
  const processFrameRef = useRef(null);

  useEffect(() => {
    if (!isStreaming || isModelLoading) return;

    const landmarkIdx = parseInt(targetLandmark, 10);

    const processFrame = () => {
      if (isIdlePausedRef.current) return;

      const vidA = videoARef.current;
      const vidB = videoBRef.current;
      const lmA = landmarkerARef.current;
      const lmB = landmarkerBRef.current;

      const now = performance.now();

      if (vidA && vidB && lmA && lmB && vidA.readyState >= 2 && vidB.readyState >= 2) {
        // Process Cam A
        const resA = lmA.detectForVideo(vidA, now);
        frameCountARef.current += 1;

        // Process Cam B
        const resB = lmB.detectForVideo(vidB, now);
        frameCountBRef.current += 1;

        // Draw Canvas Overlays & Calculate Disparity
        const canvasA = canvasARef.current;
        const canvasB = canvasBRef.current;

        let ptA = null;
        let ptB = null;

        if (canvasA && vidA.videoWidth > 0) {
          canvasA.width = vidA.videoWidth;
          canvasA.height = vidA.videoHeight;
          const ctxA = canvasA.getContext('2d');
          ctxA.clearRect(0, 0, canvasA.width, canvasA.height);

          if (resA.faceLandmarks && resA.faceLandmarks.length > 0) {
            lastFaceDetectedTimeRef.current = Date.now();
            const landmarks = resA.faceLandmarks[0];
            const lm = landmarks[landmarkIdx] || landmarks[1];
            ptA = { x: lm.x * canvasA.width, y: lm.y * canvasA.height };

            // Draw target point
            ctxA.fillStyle = '#00ff88';
            ctxA.beginPath();
            ctxA.arc(ptA.x, ptA.y, 6, 0, 2 * Math.PI);
            ctxA.fill();
            ctxA.strokeStyle = '#ffffff';
            ctxA.lineWidth = 2;
            ctxA.stroke();

            // 1. Solve Facial Expressions & Head Tracking from Cam A (Master)
            try {
              const mockVideo = {
                width: vidA.videoWidth,
                height: vidA.videoHeight,
                clientWidth: vidA.videoWidth,
                clientHeight: vidA.videoHeight,
                videoWidth: vidA.videoWidth,
                videoHeight: vidA.videoHeight,
              };
              const riggedFace = Kalidokit.Face.solve(landmarks, {
                runtime: "mediapipe",
                video: mockVideo
              });
              if (riggedFace) {
                VTuberStore.riggedFace = riggedFace;
              }
            } catch (err) {
              // Ignore face solve errors
            }
          }
        }

        // 2. Solve Arm Pose Tracking from Cam A if enabled
        if (enableArmTracking && poseLandmarkerRef.current) {
          try {
            const poseResults = poseLandmarkerRef.current.detectForVideo(vidA, now);
            if (poseResults && poseResults.landmarks && poseResults.landmarks.length > 0) {
              const poseLandmarks = poseResults.landmarks[0];
              const poseWorldLandmarks = poseResults.worldLandmarks[0].map(lm => ({
                x: lm.x,
                y: lm.y,
                z: -lm.z,
                visibility: lm.visibility
              }));
              const riggedPose = Kalidokit.Pose.solve(poseWorldLandmarks, poseLandmarks, {
                runtime: "mediapipe",
                video: { width: vidA.videoWidth, height: vidA.videoHeight }
              });
              if (riggedPose) VTuberStore.riggedPose = riggedPose;
            }
          } catch (err) {}
        }

        // 3. Solve Finger Hand Tracking from Cam A if enabled
        if (enableFingerTracking && handLandmarkerRef.current) {
          try {
            const handResults = handLandmarkerRef.current.detectForVideo(vidA, now);
            if (handResults && handResults.landmarks && handResults.landmarks.length > 0) {
              VTuberStore.hands = {
                landmarks: handResults.landmarks,
                worldLandmarks: handResults.worldLandmarks,
                handedness: handResults.handednesses
              };
              const riggedHands = { Left: null, Right: null };
              for (let i = 0; i < handResults.landmarks.length; i++) {
                const lms = handResults.landmarks[i];
                const handedness = handResults.handednesses[i][0].categoryName;
                riggedHands[handedness] = Kalidokit.Hand.solve(lms, handedness);
              }
              VTuberStore.riggedHands = riggedHands;
            } else {
              VTuberStore.hands = null;
              VTuberStore.riggedHands = null;
            }
          } catch (err) {}
        }

        if (canvasB && vidB.videoWidth > 0) {
          canvasB.width = vidB.videoWidth;
          canvasB.height = vidB.videoHeight;
          const ctxB = canvasB.getContext('2d');
          ctxB.clearRect(0, 0, canvasB.width, canvasB.height);

          if (resB.faceLandmarks && resB.faceLandmarks.length > 0) {
            const landmarks = resB.faceLandmarks[0];
            const lm = landmarks[landmarkIdx] || landmarks[1];
            ptB = { x: lm.x * canvasB.width, y: lm.y * canvasB.height };

            // Draw target point
            ctxB.fillStyle = '#00e5ff';
            ctxB.beginPath();
            ctxB.arc(ptB.x, ptB.y, 6, 0, 2 * Math.PI);
            ctxB.fill();
            ctxB.strokeStyle = '#ffffff';
            ctxB.lineWidth = 2;
            ctxB.stroke();
          }
        }

        // Stereo Disparity Math Calculation
        if (ptA && ptB) {
          // Disparity in horizontal pixel space
          const disparityPx = Math.abs(ptA.x - ptB.x);

          // Metric Z calculation: Z = (f * B) / disparity
          const zCalculatedCm = disparityPx > 0 ? (focalLengthPx * baselineCm) / disparityPx : 0;

          // Neutral offset comparison
          let deltaZ = 0;
          let dir = 'NETRAL';

          if (neutralDisparityRef.current && neutralZRef.current) {
            // Delta Z in cm relative to neutral baseline calibration
            deltaZ = zCalculatedCm - neutralZRef.current;

            if (deltaZ < -2.0) {
              dir = 'MAJU (Lebih Dekat)';
            } else if (deltaZ > 2.0) {
              dir = 'MUNDUR (Lebih Jauh)';
            } else {
              dir = 'NETRAL';
            }
          }

          // Calculate FPS
          if (now - lastFpsCalcRef.current >= 1000) {
            const fpsA = Math.round((frameCountARef.current * 1000) / (now - lastFpsCalcRef.current));
            const fpsB = Math.round((frameCountBRef.current * 1000) / (now - lastFpsCalcRef.current));
            frameCountARef.current = 0;
            frameCountBRef.current = 0;
            lastFpsCalcRef.current = now;

            setMetrics(prev => ({
              ...prev,
              fpsA,
              fpsB
            }));
          }

          setMetrics(prev => ({
            ...prev,
            camA_X: Math.round(ptA.x),
            camA_Y: Math.round(ptA.y),
            camB_X: Math.round(ptB.x),
            camB_Y: Math.round(ptB.y),
            disparityPx: parseFloat(disparityPx.toFixed(2)),
            calculatedZCm: parseFloat(zCalculatedCm.toFixed(1)),
            deltaZCm: parseFloat(deltaZ.toFixed(1)),
            direction: dir
          }));

          // Bridge to VTuberStore if toggled
          if (bridgeToStore) {
            VTuberStore.enableStereoZ = true;
            // Suppress Z offset when turning head (yaw) to prevent false depth shifts
            const riggedFace = VTuberStore.riggedFace;
            const headYaw = riggedFace ? riggedFace.head.y : 0;
            const yawFactor = Math.max(0, Math.cos(headYaw * 1.3));

            // Negative deltaZ means moving forward (closer), positive means moving backward
            const vrmZOffset = -deltaZ * sensitivity * yawFactor;
            VTuberStore.stereoZOffset = vrmZOffset;
            VTuberStore.stereoMode = stereoMode;
            VTuberStore.stereoLeanSensitivity = stereoLeanSensitivity;
            VTuberStore.invertStereoLean = invertStereoLean;
            VTuberStore.disparityData = {
              disparityPx,
              calculatedZCm: zCalculatedCm,
              deltaZCm: deltaZ
            };
            broadcastStoreUpdate();
          }
        }
      }

      requestAnimRef.current = requestAnimationFrame(processFrame);
    };

    processFrameRef.current = processFrame;
    requestAnimRef.current = requestAnimationFrame(processFrame);

    return () => {
      if (requestAnimRef.current) cancelAnimationFrame(requestAnimRef.current);
    };
  }, [isStreaming, isModelLoading, focalLengthPx, baselineCm, sensitivity, targetLandmark, bridgeToStore, enableArmTracking, enableFingerTracking, stereoMode, stereoLeanSensitivity, invertStereoLean]);

  // Handle Bridge Checkbox
  const handleBridgeToggle = (e) => {
    const checked = e.target.checked;
    setBridgeToStore(checked);
    VTuberStore.enableStereoZ = checked;
    if (!checked) {
      VTuberStore.stereoZOffset = 0;
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-6 bg-gray-900 border border-emerald-500/30 rounded-xl shadow-2xl text-gray-100 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-gray-800">
        <div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-full text-xs font-semibold uppercase tracking-wider">
              Lab Testing Mode
            </span>
            <h2 className="text-2xl font-bold text-white tracking-wide">Stereo Vision 2-Webcam Depth Estimator</h2>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Uji coba estimasi kedalaman sumbu Z real-time dengan triangulasi disparity dari 2 webcam independen.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFloatingAvatar(!showFloatingAvatar)}
            className={`px-4 py-2.5 rounded-lg font-medium transition-all shadow-lg flex items-center gap-2 cursor-pointer border text-xs ${
              showFloatingAvatar
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500 hover:bg-emerald-900'
                : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
            }`}
          >
            🎭 {showFloatingAvatar ? 'Sembunyikan Avatar 3D' : '✨ Tampilkan 3D Avatar (Floating Window)'}
          </button>

          {!isStreaming ? (
            <button
              onClick={startDualStreams}
              disabled={isModelLoading || videoDevices.length === 0}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white font-medium rounded-lg transition-all shadow-lg hover:shadow-emerald-500/20 flex items-center gap-2 cursor-pointer text-xs"
            >
              ▶ Aktifkan 2 Webcam
            </button>
          ) : (
            <button
              onClick={stopDualStreams}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg transition-all shadow-lg hover:shadow-rose-500/20 cursor-pointer text-xs"
            >
              ⏹ Hentikan Stream
            </button>
          )}
        </div>
      </div>

      {/* Model Loader Banner */}
      {isModelLoading && (
        <div className="my-4 p-4 bg-blue-950/50 border border-blue-600/40 rounded-lg text-blue-300 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
          <span>{modelStatus}</span>
        </div>
      )}

      {/* Device Selection & Setup Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 my-6 bg-gray-950/70 p-4 rounded-lg border border-gray-800">
        <div>
          <label className="block text-xs font-semibold text-emerald-400 mb-1 uppercase tracking-wider">
            Kamera A (Master / Kiri)
          </label>
          <select
            value={selectedCamA}
            onChange={(e) => setSelectedCamA(e.target.value)}
            disabled={isStreaming}
            className="w-full bg-gray-800 border border-gray-700 text-white rounded p-2 text-sm focus:outline-none focus:border-emerald-500"
          >
            {videoDevices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Webcam ${i + 1}`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-cyan-400 mb-1 uppercase tracking-wider">
            Kamera B (Sekunder / Kanan)
          </label>
          <select
            value={selectedCamB}
            onChange={(e) => setSelectedCamB(e.target.value)}
            disabled={isStreaming}
            className="w-full bg-gray-800 border border-gray-700 text-white rounded p-2 text-sm focus:outline-none focus:border-cyan-500"
          >
            {videoDevices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Webcam ${i + 1}`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-300 mb-1 uppercase tracking-wider">
            Jarak Antar Webcam (Baseline)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.5"
              value={baselineCm}
              onChange={(e) => setBaselineCm(parseFloat(e.target.value) || 10)}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded p-2 text-sm focus:outline-none focus:border-emerald-500"
            />
            <span className="text-sm text-gray-400 font-semibold">cm</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-300 mb-1 uppercase tracking-wider">
            Target Landmark Point
          </label>
          <select
            value={targetLandmark}
            onChange={(e) => setTargetLandmark(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 text-white rounded p-2 text-sm focus:outline-none focus:border-emerald-500"
          >
            <option value="1">Hidung (Nose Tip #1)</option>
            <option value="33">Mata Kiri (Left Eye #33)</option>
            <option value="263">Mata Kanan (Right Eye #263)</option>
            <option value="152">Dagu (Chin #152)</option>
          </select>
        </div>
      </div>

      {/* Video Stream Feeds Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Cam A Box */}
        <div className="bg-gray-950 p-3 rounded-lg border border-emerald-500/40 relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-emerald-400 tracking-wider">
              FEED KAMERA A (MASTER)
            </span>
            <span className="text-xs bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800">
              {metrics.fpsA} FPS
            </span>
          </div>

          <div className="relative aspect-video bg-black rounded overflow-hidden flex items-center justify-center">
            <video
              ref={videoARef}
              className="w-full h-full object-cover transform -scale-x-100"
              playsInline
              muted
            />
            <canvas
              ref={canvasARef}
              className="absolute inset-0 w-full h-full pointer-events-none transform -scale-x-100"
            />
            {!isStreaming && (
              <span className="text-gray-500 text-sm">Stream Kamera A Mati</span>
            )}
          </div>

          <div className="mt-2 text-xs text-gray-400 flex justify-between">
            <span>Koordinat Point: ({metrics.camA_X}, {metrics.camA_Y}) px</span>
          </div>
        </div>

        {/* Cam B Box */}
        <div className="bg-gray-950 p-3 rounded-lg border border-cyan-500/40 relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-cyan-400 tracking-wider">
              FEED KAMERA B (DISPARITY TRACKER)
            </span>
            <span className="text-xs bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800">
              {metrics.fpsB} FPS
            </span>
          </div>

          <div className="relative aspect-video bg-black rounded overflow-hidden flex items-center justify-center">
            <video
              ref={videoBRef}
              className="w-full h-full object-cover transform -scale-x-100"
              playsInline
              muted
            />
            <canvas
              ref={canvasBRef}
              className="absolute inset-0 w-full h-full pointer-events-none transform -scale-x-100"
            />
            {!isStreaming && (
              <span className="text-gray-500 text-sm">Stream Kamera B Mati</span>
            )}
          </div>

          <div className="mt-2 text-xs text-gray-400 flex justify-between">
            <span>Koordinat Point: ({metrics.camB_X}, {metrics.camB_Y}) px</span>
          </div>
        </div>
      </div>

      {/* Real-time Analytics & Meter Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-gray-950 p-5 rounded-lg border border-gray-800 mb-6">
        {/* Metric Cards */}
        <div className="space-y-4">
          <div className="bg-gray-900 p-3 rounded border border-gray-800 flex justify-between items-center">
            <span className="text-xs text-gray-400">Disparity ($\Delta X$):</span>
            <span className="text-lg font-mono font-bold text-amber-400">
              {metrics.disparityPx} <span className="text-xs text-gray-500 font-normal">px</span>
            </span>
          </div>

          <div className="bg-gray-900 p-3 rounded border border-gray-800 flex justify-between items-center">
            <span className="text-xs text-gray-400">Estimasi Jarak Real (Z):</span>
            <span className="text-lg font-mono font-bold text-emerald-400">
              {metrics.calculatedZCm} <span className="text-xs text-gray-500 font-normal">cm</span>
            </span>
          </div>

          <div className="bg-gray-900 p-3 rounded border border-gray-800 flex justify-between items-center">
            <span className="text-xs text-gray-400">Pergeseran Z (Delta):</span>
            <span className={`text-lg font-mono font-bold ${metrics.deltaZCm < 0 ? 'text-blue-400' : metrics.deltaZCm > 0 ? 'text-amber-400' : 'text-gray-300'}`}>
              {metrics.deltaZCm > 0 ? `+${metrics.deltaZCm}` : metrics.deltaZCm} <span className="text-xs text-gray-500 font-normal">cm</span>
            </span>
          </div>
        </div>

        {/* Visual Gauge / Position Status */}
        <div className="flex flex-col justify-between bg-gray-900 p-4 rounded border border-gray-800">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">
              Status Pergerakan Z
            </span>
            <div className="text-xl font-extrabold text-white mb-3">
              {metrics.direction}
            </div>
          </div>

          {/* Z Shift Bar */}
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>◄ MAJU (Dekat)</span>
              <span>NETRAL (0 cm)</span>
              <span>MUNDUR (Jauh) ►</span>
            </div>
            <div className="w-full bg-gray-950 h-4 rounded-full overflow-hidden border border-gray-700 relative flex items-center">
              <div className="absolute left-1/2 w-0.5 h-full bg-gray-500 z-10"></div>
              <div
                className={`h-full transition-all duration-100 ${metrics.deltaZCm < 0 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{
                  width: `${Math.min(Math.abs(metrics.deltaZCm) * 2, 50)}%`,
                  marginLeft: metrics.deltaZCm < 0 ? `${50 - Math.min(Math.abs(metrics.deltaZCm) * 2, 50)}%` : '50%'
                }}
              />
            </div>
          </div>

          {/* Calibration Button */}
          <button
            onClick={handleCalibrateNeutral}
            disabled={!isStreaming || metrics.disparityPx === 0}
            className="mt-4 w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 text-white font-medium rounded text-xs transition-colors cursor-pointer"
          >
            🎯 Set Kalibrasi Netral (Set Z = 0)
          </button>
        </div>

        {/* Fine Tuning & VRM Bridge Options */}
        <div className="space-y-4 bg-gray-900 p-4 rounded border border-gray-800">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
            Pengaturan Sensitivitas & Mode Avatar Z
          </span>

          {/* Stereo Mode Selector */}
          <div>
            <label className="block text-xs text-gray-300 mb-1 font-semibold">
              Mode Pergerakan Avatar (Respon Z):
            </label>
            <select
              value={stereoMode}
              onChange={(e) => {
                setStereoMode(e.target.value);
                VTuberStore.stereoMode = e.target.value;
              }}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded p-1.5 text-xs focus:outline-none focus:border-emerald-500"
            >
              <option value="lean">🧘 Mode Lean (Miringkan Torso Badan Forward/Back)</option>
              <option value="hybrid">✨ Mode Hybrid (Miringkan Torso + Geser Posisi)</option>
              <option value="translate">🚶 Mode Translate (Geser Posisi Hips Saja)</option>
            </select>
          </div>

          {(stereoMode === 'lean' || stereoMode === 'hybrid') && (
            <div>
              <div className="flex justify-between text-xs text-gray-300 mb-1">
                <span>Sensitivitas Kemiringan Torso</span>
                <span className="font-mono text-cyan-400">{stereoLeanSensitivity}</span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.08"
                step="0.005"
                value={stereoLeanSensitivity}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setStereoLeanSensitivity(val);
                  VTuberStore.stereoLeanSensitivity = val;
                }}
                className="w-full accent-cyan-500"
              />
            </div>
          )}

          <div>
            <div className="flex justify-between text-xs text-gray-300 mb-1">
              <span>Focal Length Lens (Estimasi)</span>
              <span className="font-mono text-emerald-400">{focalLengthPx} px</span>
            </div>
            <input
              type="range"
              min="300"
              max="1200"
              step="10"
              value={focalLengthPx}
              onChange={(e) => setFocalLengthPx(parseInt(e.target.value, 10))}
              className="w-full accent-emerald-500"
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-gray-800">
            <label className="flex items-center gap-2 text-xs text-emerald-400 font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={bridgeToStore}
                onChange={handleBridgeToggle}
                className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
              />
              Hubungkan Nilai Z ke Avatar 3D (VTuberStore)
            </label>

            <label className="flex items-center gap-2 text-xs text-cyan-300 cursor-pointer">
              <input
                type="checkbox"
                checked={invertStereoLean}
                onChange={(e) => {
                  setInvertStereoLean(e.target.checked);
                  VTuberStore.invertStereoLean = e.target.checked;
                }}
                className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
              />
              Invert Arah Kemiringan (Balikkan Arah Maju/Mundur)
            </label>
          </div>

          {/* Full Tracking Options for Cam A */}
          <div className="pt-2 border-t border-gray-800 space-y-1.5">
            <span className="text-[11px] font-bold text-emerald-400 uppercase block">
              Tracking Tambahan Kamera A (Master):
            </span>
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={enableArmTracking}
                onChange={(e) => {
                  setEnableArmTracking(e.target.checked);
                  VTuberStore.enableArmTracking = e.target.checked;
                }}
                className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
              />
              Arm & Pose Tracking (Gerakan Lengan)
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={enableFingerTracking}
                onChange={(e) => {
                  setEnableFingerTracking(e.target.checked);
                  VTuberStore.enableFingerTracking = e.target.checked;
                }}
                className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
              />
              Hand & Finger Tracking (Gerakan Jari Tangan)
            </label>
          </div>
        </div>
      </div>

      {/* Floating Avatar 3D Window (Overlay) */}
      <FloatingAvatarWindow
        isOpen={showFloatingAvatar}
        onClose={() => setShowFloatingAvatar(false)}
      />
    </div>
  );
}
