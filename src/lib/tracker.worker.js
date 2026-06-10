import { FaceLandmarker, PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import * as Kalidokit from 'kalidokit';

let faceLandmarker = null;
let poseLandmarker = null;

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  if (type === 'INIT') {
    try {
      console.log("Worker: Memuat MediaPipe WASM dan Model...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU"
        },
        outputFaceBlendshapes: true, 
        outputFacialTransformationMatrixes: true,
        runningMode: "VIDEO", 
        numFaces: 1 
      });
      
      poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numPoses: 1
      });
      console.log("Worker: MediaPipe Face & Pose Landmarkers siap!");
      self.postMessage({ type: 'INIT_DONE' });
    } catch (error) {
      console.error("Worker: Gagal memuat MediaPipe:", error);
      self.postMessage({ type: 'ERROR', payload: error.message });
    }
  } 
  
  else if (type === 'PROCESS') {
    if (!faceLandmarker) return;

    const { imageBitmap, timestamp, videoDimensions } = payload;
    
    try {
      // detectForVideo accepts ImageBitmap
      const faceResults = faceLandmarker.detectForVideo(imageBitmap, timestamp);
      const poseResults = poseLandmarker.detectForVideo(imageBitmap, timestamp);
      
      let riggedFace = null;
      let riggedPose = null;

      // Mock video object for Kalidokit
      const mockVideo = {
        width: videoDimensions.width,
        height: videoDimensions.height,
        clientWidth: videoDimensions.width,
        clientHeight: videoDimensions.height,
        videoWidth: videoDimensions.width,
        videoHeight: videoDimensions.height,
      };

      if (faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0) {
        const faceLandmarks = faceResults.faceLandmarks[0];
        riggedFace = Kalidokit.Face.solve(faceLandmarks, {
          runtime: "mediapipe",
          video: mockVideo
        });
      }
      
      if (poseResults.landmarks && poseResults.landmarks.length > 0) {
        const poseLandmarks = poseResults.landmarks[0];
        // Fix for MediaPipe Tasks Vision: invert Z axis to match legacy MediaPipe for Kalidokit
        const poseWorldLandmarks = poseResults.worldLandmarks[0].map(lm => ({
          x: lm.x,
          y: lm.y,
          z: -lm.z,
          visibility: lm.visibility
        }));
        riggedPose = Kalidokit.Pose.solve(poseWorldLandmarks, poseLandmarks, {
          runtime: "mediapipe",
          video: mockVideo
        });
      }
      
      // Sangat penting: Tutup ImageBitmap untuk membebaskan memori dengan cepat (garbage collection)
      if (imageBitmap && typeof imageBitmap.close === 'function') {
        imageBitmap.close();
      }

      self.postMessage({ 
        type: 'PROCESS_DONE', 
        payload: { riggedFace, riggedPose } 
      });

    } catch (error) {
      console.error("Worker process error:", error);
      if (imageBitmap && typeof imageBitmap.close === 'function') {
        imageBitmap.close();
      }
      self.postMessage({ 
        type: 'ERROR', 
        payload: error.message 
      });
    }
  }
};
