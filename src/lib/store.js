// State global sederhana menggunakan objek biasa (Mutable Store).
// Kita tidak menggunakan React State (useState) agar pembaruan data pada 60 FPS
// tidak memicu re-render ulang seluruh aplikasi yang akan membuat ngelag.

export const VTuberStore = {
  riggedFace: null,
  riggedPose: null,
  hands: null,
  riggedHands: null,
  enableArmTracking: false,
  enableFingerTracking: false,
  isGrabbing: false,
  matrix: null,
  headRotation: { x: 0, y: 0, z: 0 },
  vrm1Mode: false,

  // Stereo Vision & Depth Settings
  enableStereoZ: true,
  stereoZOffset: 0,
  disparityData: null,
  vrmUrl: '/models/avatar.vrm',

  // Stereo Depth Behavior Mode:
  // 'lean': Miringkan badan (Spine/Chest pitch) ke arah / menjauhi kamera
  // 'translate': Pergeseran seluruh posisi badan (Hips Z translation)
  // 'hybrid': Kombinasi miringkan badan + pergeseran posisi
  stereoMode: 'lean', 
  stereoLeanSensitivity: 0.03, // Sensitivitas kemiringan badan dalam radian per cm
  invertStereoLean: false
};

// Cross-window BroadcastChannel for OBS Popout Window Sync
let broadcastChannel = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel('vtuber_store_channel');
  } catch (e) {
    console.warn("BroadcastChannel initialization warning:", e);
  }
}

export function broadcastStoreUpdate() {
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({
        riggedFace: VTuberStore.riggedFace,
        riggedPose: VTuberStore.riggedPose,
        hands: VTuberStore.hands,
        riggedHands: VTuberStore.riggedHands,
        vrm1Mode: VTuberStore.vrm1Mode,
        enableStereoZ: VTuberStore.enableStereoZ,
        stereoZOffset: VTuberStore.stereoZOffset,
        disparityData: VTuberStore.disparityData,
        vrmUrl: VTuberStore.vrmUrl,
        stereoMode: VTuberStore.stereoMode,
        stereoLeanSensitivity: VTuberStore.stereoLeanSensitivity,
        invertStereoLean: VTuberStore.invertStereoLean
      });
    } catch (err) {
      // Ignore non-serializable data
    }
  }
}

export function subscribeToStoreBroadcast(onUpdate) {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    const channel = new BroadcastChannel('vtuber_store_channel');
    channel.onmessage = (event) => {
      if (event.data) {
        if (event.data.riggedFace !== undefined) VTuberStore.riggedFace = event.data.riggedFace;
        if (event.data.riggedPose !== undefined) VTuberStore.riggedPose = event.data.riggedPose;
        if (event.data.hands !== undefined) VTuberStore.hands = event.data.hands;
        if (event.data.riggedHands !== undefined) VTuberStore.riggedHands = event.data.riggedHands;
        if (event.data.vrm1Mode !== undefined) VTuberStore.vrm1Mode = event.data.vrm1Mode;
        if (event.data.enableStereoZ !== undefined) VTuberStore.enableStereoZ = event.data.enableStereoZ;
        if (event.data.stereoZOffset !== undefined) VTuberStore.stereoZOffset = event.data.stereoZOffset;
        if (event.data.disparityData !== undefined) VTuberStore.disparityData = event.data.disparityData;
        if (event.data.vrmUrl !== undefined) VTuberStore.vrmUrl = event.data.vrmUrl;
        if (event.data.stereoMode !== undefined) VTuberStore.stereoMode = event.data.stereoMode;
        if (event.data.stereoLeanSensitivity !== undefined) VTuberStore.stereoLeanSensitivity = event.data.stereoLeanSensitivity;
        if (event.data.invertStereoLean !== undefined) VTuberStore.invertStereoLean = event.data.invertStereoLean;

        if (onUpdate) onUpdate(event.data);
      }
    };
    return () => channel.close();
  }
  return () => {};
}
