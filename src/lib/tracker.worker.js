import { FaceLandmarker, PoseLandmarker, HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import * as Kalidokit from 'kalidokit';

let faceLandmarker = null;
let poseLandmarker = null;
let handLandmarker = null;

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
      
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2
      });
      console.log("Worker: MediaPipe Face, Pose & Hand Landmarkers siap!");
      self.postMessage({ type: 'INIT_DONE' });
    } catch (error) {
      console.error("Worker: Gagal memuat MediaPipe:", error);
      self.postMessage({ type: 'ERROR', payload: error.message });
    }
  } 
  
  else if (type === 'PROCESS') {
    if (!faceLandmarker || !poseLandmarker || !handLandmarker) return;

    const { imageBitmap, timestamp, videoDimensions, enableFingerTracking, enableArmTracking } = payload;
    
    try {
      const faceResults = faceLandmarker.detectForVideo(imageBitmap, timestamp);
      
      let poseResults = null;
      if (enableArmTracking) {
        poseResults = poseLandmarker.detectForVideo(imageBitmap, timestamp);
      }
      
      let handResults = null;
      if (enableFingerTracking) {
        handResults = handLandmarker.detectForVideo(imageBitmap, timestamp);
      }
      
      let riggedFace = null;
      let riggedPose = null;
      let hands = null;

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

      if (poseResults && poseResults.landmarks && poseResults.landmarks.length > 0) {
        const poseLandmarks = poseResults.landmarks[0];
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
      
      let riggedHands = { Left: null, Right: null };
      
      if (handResults && handResults.landmarks && handResults.landmarks.length > 0) {
        hands = {
          landmarks: handResults.landmarks,
          worldLandmarks: handResults.worldLandmarks,
          handedness: handResults.handednesses
        };
        
        for (let i = 0; i < handResults.landmarks.length; i++) {
          const landmarks = handResults.landmarks[i];
          const handedness = handResults.handednesses[i][0].categoryName;
          riggedHands[handedness] = Kalidokit.Hand.solve(landmarks, handedness);
        }
      }
      
      if (imageBitmap && typeof imageBitmap.close === 'function') {
        imageBitmap.close();
      }

      self.postMessage({ 
        type: 'PROCESS_DONE', 
        payload: { riggedFace, riggedPose, hands, riggedHands } 
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
