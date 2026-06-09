import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import * as Kalidokit from 'kalidokit';

let faceLandmarker = null;

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
      console.log("Worker: MediaPipe Face Landmarker siap!");
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
      const results = faceLandmarker.detectForVideo(imageBitmap, timestamp);
      
      let riggedFace = null;

      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        const faceLandmarks = results.faceLandmarks[0];
        
        // Mock video object for Kalidokit
        const mockVideo = {
          width: videoDimensions.width,
          height: videoDimensions.height,
          clientWidth: videoDimensions.width,
          clientHeight: videoDimensions.height,
          videoWidth: videoDimensions.width,
          videoHeight: videoDimensions.height,
        };

        riggedFace = Kalidokit.Face.solve(faceLandmarks, {
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
        payload: { riggedFace } 
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
