"use client";
import React, { useRef, useEffect } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { VTuberStore } from '../lib/store';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, errorMsg: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="red" wireframe />
        </mesh>
      );
    }
    return this.props.children;
  }
}

const FINGER_BONES = [
  'leftThumbProximal', 'leftThumbIntermediate', 'leftThumbDistal',
  'leftIndexProximal', 'leftIndexIntermediate', 'leftIndexDistal',
  'leftMiddleProximal', 'leftMiddleIntermediate', 'leftMiddleDistal',
  'leftRingProximal', 'leftRingIntermediate', 'leftRingDistal',
  'leftLittleProximal', 'leftLittleIntermediate', 'leftLittleDistal',
  'rightThumbProximal', 'rightThumbIntermediate', 'rightThumbDistal',
  'rightIndexProximal', 'rightIndexIntermediate', 'rightIndexDistal',
  'rightMiddleProximal', 'rightMiddleIntermediate', 'rightMiddleDistal',
  'rightRingProximal', 'rightRingIntermediate', 'rightRingDistal',
  'rightLittleProximal', 'rightLittleIntermediate', 'rightLittleDistal'
];

const RELAXED_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
const GRABBING_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 1.2));

const AvatarModel = ({ url, customCameraPosition, customCameraTarget }) => {
  const vrmRef = useRef(null);
  const rollStateRef = useRef({ right: 0, left: 0 });
  const { camera, controls } = useThree();

  // Load VRM model with VRMLoaderPlugin
  const gltf = useLoader(GLTFLoader, url, (loader) => {
    loader.register((parser) => {
      return new VRMLoaderPlugin(parser);
    });
  });

  useEffect(() => {
    if (gltf.userData.vrm) {
      const vrm = gltf.userData.vrm;
      vrmRef.current = vrm;
      
      // Setup VRM (Optimizations)
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      
      // Reset position & rotate model to face camera (+Z direction)
      vrm.scene.position.set(0, 0, 0);
      vrm.scene.rotation.set(0, Math.PI, 0);

      // Relax arms from T-pose to a natural resting A-pose
      const leftUpperArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
      const rightUpperArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');

      if (leftUpperArm) leftUpperArm.rotation.z = 1.1;
      if (rightUpperArm) rightUpperArm.rotation.z = -1.1;

      // Force matrix update to accurately calculate head bone height
      vrm.scene.updateMatrixWorld(true);

      const headNode = vrm.humanoid?.getNormalizedBoneNode('head');
      let headY = 1.38;
      if (headNode) {
        const headWorldPos = new THREE.Vector3();
        headNode.getWorldPosition(headWorldPos);
        if (headWorldPos.y > 0.3) {
          headY = headWorldPos.y;
        }
      }

      // Offset model vertically so face/chin is centered exactly at origin (0, 0, 0)
      const faceCenterY = headY - 0.05;
      vrm.scene.position.y = -faceCenterY;
      vrm.scene.updateMatrixWorld(true);

      // Align camera and OrbitControls straight along Z axis at (0, 0, 0)
      const targetPos = customCameraTarget || [0, 0, 0];
      const camPos = customCameraPosition || [0, 0, 0.60];

      camera.position.set(...camPos);
      camera.lookAt(...targetPos);
      camera.updateProjectionMatrix();

      if (controls) {
        controls.target.set(...targetPos);
        controls.update();
      }

      console.log("VRM Model loaded & centered at (0,0,0) facing camera!", { headY, faceCenterY, targetPos, camPos });
    }
  }, [gltf, camera, controls, customCameraPosition, customCameraTarget]);

  useFrame((state, delta) => {
    const vrm = vrmRef.current;
    if (!vrm) return;

    // Update VRM physics/lookAt
    vrm.update(delta);

    // Dynamic delta-based lerp factors to ensure smooth, responsive, frame-rate independent tracking
    const bodyDamp = Math.min(1, delta * 15);   // ~0.22 at 60fps, higher at 30fps
    const armDamp = Math.min(1, delta * 12);    // ~0.18 at 60fps (up from fixed 0.05!)
    const fingerDamp = Math.min(1, delta * 18); // ~0.26 at 60fps
    const relaxDamp = Math.min(1, delta * 8);   // ~0.12 at 60fps
    const rollDamp = Math.min(1, delta * 10);   // ~0.15 at 60fps

    // Apply Kalidokit tracking data from global store
    const riggedFace = VTuberStore.riggedFace;
    const headYaw = riggedFace ? riggedFace.head.y : 0;
    // Head turn dampener: gradually drops from 1.0 (facing front) to 0.0 (facing side)
    // Prevents head yaw (nengok kiri/kanan) from triggering false forward/backward motion
    const headTurnDampener = Math.max(0, Math.cos(headYaw * 1.3));

    // Calculate Stereo Lean Pitch and Hips Z Translation
    let stereoLeanPitch = 0;
    let targetHipsZ = 0;

    if (VTuberStore.enableStereoZ && typeof VTuberStore.stereoZOffset === 'number') {
      const mode = VTuberStore.stereoMode || 'lean';
      const sensitivity = VTuberStore.stereoLeanSensitivity || 0.03;
      const invert = VTuberStore.invertStereoLean ? -1 : 1;

      // Positive stereoZOffset means user moved closer to camera
      // Pitch forward (positive pitch in VRM) to lean towards camera
      const leanFactor = VTuberStore.stereoZOffset * (sensitivity / 0.015) * invert * headTurnDampener;

      if (mode === 'lean' || mode === 'hybrid') {
        stereoLeanPitch = leanFactor;
      }
      
      if (mode === 'translate' || mode === 'hybrid') {
        targetHipsZ = VTuberStore.stereoZOffset * headTurnDampener;
      }

      const hipsBone = vrm.humanoid.getNormalizedBoneNode('hips');
      if (hipsBone) {
        hipsBone.position.z = THREE.MathUtils.lerp(hipsBone.position.z, targetHipsZ, bodyDamp);
      }
    }

    if (riggedFace) {
      // 1. HEAD ROTATION
      // Kalidokit gives head rotation in radians (Euler X, Y, Z)
      const headBone = vrm.humanoid.getNormalizedBoneNode('head');
      
      if (headBone) {
        let { x, y, z } = riggedFace.head;
        if (VTuberStore.vrm1Mode) {
          x *= -1;
          y *= -1;
          z *= -1;
        }
        const targetRotation = new THREE.Euler(x, y, z, 'XYZ');
        const targetQuaternion = new THREE.Quaternion().setFromEuler(targetRotation);
        
        // Smoothly interpolate head rotation using Slerp
        headBone.quaternion.slerp(targetQuaternion, bodyDamp);
      }

      // 2. FACIAL EXPRESSIONS (Blendshapes)
      if (vrm.expressionManager) {
        // Eyes (Blink)
        const blinkL = 1 - riggedFace.eye.l;
        const blinkR = 1 - riggedFace.eye.r;
        
        vrm.expressionManager.setValue('blinkLeft', blinkL);
        vrm.expressionManager.setValue('blinkRight', blinkR);
        vrm.expressionManager.setValue('blink_l', blinkL);
        vrm.expressionManager.setValue('blink_r', blinkR);

        // Mouth Shapes (A, I, U, E, O)
        const mouthA = riggedFace.mouth.shape.A;
        const mouthI = riggedFace.mouth.shape.I;
        const mouthU = riggedFace.mouth.shape.U;
        const mouthE = riggedFace.mouth.shape.E;
        const mouthO = riggedFace.mouth.shape.O;

        vrm.expressionManager.setValue('aa', mouthA);
        vrm.expressionManager.setValue('ih', mouthI);
        vrm.expressionManager.setValue('ou', mouthU);
        vrm.expressionManager.setValue('ee', mouthE);
        vrm.expressionManager.setValue('oh', mouthO);
        
        vrm.expressionManager.setValue('a', mouthA);
        vrm.expressionManager.setValue('i', mouthI);
        vrm.expressionManager.setValue('u', mouthU);
        vrm.expressionManager.setValue('e', mouthE);
        vrm.expressionManager.setValue('o', mouthO);
      }
    }

    const riggedPose = VTuberStore.riggedPose;
    const riggedHands = VTuberStore.riggedHands;
    const hands = VTuberStore.hands;

    // Apply Spine Tilt & Stereo Body Leaning (Lean Towards / Away From Camera)
    const spineBone = vrm.humanoid.getNormalizedBoneNode('spine');
    const chestBone = vrm.humanoid.getNormalizedBoneNode('chest');
    const upperChestBone = vrm.humanoid.getNormalizedBoneNode('upperChest');
    
    if (spineBone || chestBone) {
      let pitch = riggedFace ? riggedFace.head.x : 0;
      let yaw = riggedFace ? riggedFace.head.y : 0;
      let roll = riggedFace ? riggedFace.head.z : 0;
      
      if (VTuberStore.vrm1Mode) {
        pitch *= -1;
        yaw *= -1;
        roll *= -1;
      }
      
      // Dampen pitch when turning head left/right to avoid awkward leaning
      const spinePitch = (pitch * 0.2 * headTurnDampener) + (stereoLeanPitch * 0.5);
      const chestPitch = (pitch * 0.2 * headTurnDampener) + (stereoLeanPitch * 0.5);
      
      const spineEuler = new THREE.Euler(spinePitch, yaw * 0.2, roll * 0.2, 'XYZ');
      const chestEuler = new THREE.Euler(chestPitch, yaw * 0.2, roll * 0.2, 'XYZ');
      
      if (spineBone) spineBone.quaternion.slerp(new THREE.Quaternion().setFromEuler(spineEuler), bodyDamp);
      if (chestBone) chestBone.quaternion.slerp(new THREE.Quaternion().setFromEuler(chestEuler), bodyDamp);
      if (upperChestBone) upperChestBone.quaternion.slerp(new THREE.Quaternion().setFromEuler(chestEuler), bodyDamp);
    }

    const leftUpperArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
    const rightUpperArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
    const leftLowerArm = vrm.humanoid.getNormalizedBoneNode('leftLowerArm');
    const rightLowerArm = vrm.humanoid.getNormalizedBoneNode('rightLowerArm');

    const relaxArms = () => {
      const aPoseLeft = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 1.1));
      const aPoseRight = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -1.1));
      const relaxElbow = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
      
      if (leftUpperArm) leftUpperArm.quaternion.slerp(aPoseLeft, relaxDamp);
      if (rightUpperArm) rightUpperArm.quaternion.slerp(aPoseRight, relaxDamp);
      if (leftLowerArm) leftLowerArm.quaternion.slerp(relaxElbow, relaxDamp);
      if (rightLowerArm) rightLowerArm.quaternion.slerp(relaxElbow, relaxDamp);
    };

    if (riggedPose) {
      // MODE: Full Pose (Smoothed)
      const applyRotation = (boneName, rotationObj, slerpFactor, twistX = 0) => {
        const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
        if (!bone || !rotationObj) return;

        let { x, y, z } = rotationObj;
        
        // Invert X, Y, and Z axes if the VTuberStore vrm1Mode flag is enabled
        // This fixes VRM 1.0 models having inverted tracking compared to VRM 0.0
        if (VTuberStore.vrm1Mode) {
           x *= -1;
           y *= -1;
           z *= -1;
        }

        const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
        
        // Apply local twist to the forearm without breaking elbow bend
        if (twistX !== 0) {
           targetQuat.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(twistX, 0, 0)));
        }

        bone.quaternion.slerp(targetQuat, slerpFactor);
      };

      // SMOOTH CONTINUOUS ROLL (Thumb-to-Pinky X position logic)
      let targetRightRollX = null;
      let targetLeftRollX = null;

      if (hands && hands.landmarks && hands.handedness) {
        hands.handedness.forEach((hand, index) => {
          // MediaPipe's Left/Right is often inverted for front-facing cameras
          const isRight = hand[0].categoryName === "Left"; 
          const landmarks = hands.landmarks[index];
          
          if (landmarks && landmarks.length > 17) {
            const thumbTip = landmarks[4];
            const pinkyMcp = landmarks[17];
            
            // X goes from 0 (left) to 1 (right)
            const diffX = thumbTip.x - pinkyMcp.x;
            
            // Continuous smooth mapping between [-0.06, 0.06] and [0, Math.PI]
            const minDiff = -0.06;
            const maxDiff = 0.06;
            const norm = Math.min(1, Math.max(0, (diffX - minDiff) / (maxDiff - minDiff)));

            let rollX = 0;

            if (isRight) {
              rollX = norm * Math.PI;
              if (VTuberStore.vrm1Mode) rollX *= -1;
              targetRightRollX = rollX;
            } else {
              // Left hand logic
              rollX = (1 - norm) * Math.PI;
              if (VTuberStore.vrm1Mode) rollX *= -1;
              targetLeftRollX = rollX;
            }
          }
        });
      }

      // Stateful smoothing using delta
      let rightRollX = 0;
      let leftRollX = 0;

      if (targetRightRollX !== null) {
         rollStateRef.current.right += (targetRightRollX - rollStateRef.current.right) * rollDamp;
         rightRollX = rollStateRef.current.right;
      } else {
         // Smoothly return to relaxed pose if tracking is lost
         rollStateRef.current.right += (0 - rollStateRef.current.right) * relaxDamp;
         rightRollX = rollStateRef.current.right;
      }

      if (targetLeftRollX !== null) {
         rollStateRef.current.left += (targetLeftRollX - rollStateRef.current.left) * rollDamp;
         leftRollX = rollStateRef.current.left;
      } else {
         rollStateRef.current.left += (0 - rollStateRef.current.left) * relaxDamp;
         leftRollX = rollStateRef.current.left;
      }

      applyRotation('rightUpperArm', riggedPose.RightUpperArm, armDamp);
      // We apply 100% of the calculated twist to the lower arm
      applyRotation('rightLowerArm', riggedPose.RightLowerArm, armDamp, rightRollX);
      
      applyRotation('leftUpperArm', riggedPose.LeftUpperArm, armDamp);
      applyRotation('leftLowerArm', riggedPose.LeftLowerArm, armDamp, leftRollX);
      
      // Because we moved 100% of the twist to the lower arm (which is anatomically correct),
      // we can safely relax the wrist bone completely.
      const rightHandBone = vrm.humanoid.getNormalizedBoneNode('rightHand');
      const leftHandBone = vrm.humanoid.getNormalizedBoneNode('leftHand');
      
      if (rightHandBone) rightHandBone.quaternion.slerp(RELAXED_QUAT, relaxDamp);
      if (leftHandBone) leftHandBone.quaternion.slerp(RELAXED_QUAT, relaxDamp);
      
    } else {
      relaxArms();
    }

    // True 1:1 Finger Tracking using Kalidokit
    if (riggedHands && (riggedHands.Left || riggedHands.Right)) {
      FINGER_BONES.forEach(boneName => {
        const isLeft = boneName.startsWith('left');
        const handData = isLeft ? riggedHands.Left : riggedHands.Right;
        
        if (handData) {
          // Convert VRM camelCase 'leftThumbProximal' to Kalidokit PascalCase 'LeftThumbProximal'
          const kalidokitName = boneName.charAt(0).toUpperCase() + boneName.slice(1);
          const rotationObj = handData[kalidokitName];
          
          if (rotationObj) {
            const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
            if (bone) {
              let { x, y, z } = rotationObj;
              if (VTuberStore.vrm1Mode) {
                x *= -1;
                y *= -1;
                z *= -1;
              }
              const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
              bone.quaternion.slerp(targetQuat, fingerDamp);
            }
          }
        } else {
          // If this specific hand is lost but the other is tracked, relax the lost hand
          const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
          if (bone) bone.quaternion.slerp(RELAXED_QUAT, relaxDamp);
        }
      });
    } else {
      // Relax all fingers if tracking is completely disabled or lost
      FINGER_BONES.forEach(boneName => {
        const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
        if (bone) {
          bone.quaternion.slerp(RELAXED_QUAT, relaxDamp);
        }
      });
    }
  });

  return <primitive object={gltf.scene} />;
};

const VTuber3D = ({
  isMirrored = true,
  vrmUrl,
  width = '640px',
  height = '480px',
  cameraPosition = null,
  cameraTarget = null,
  fov = 38
}) => {
  const widthStyle = typeof width === 'number' ? `${width}px` : width;
  const heightStyle = typeof height === 'number' ? `${height}px` : height;

  const defaultPosition = cameraPosition || [0, 0, 0.60];
  const defaultTarget = cameraTarget || [0, 0, 0];

  return (
    <div style={{ position: 'relative' }}>
      <Canvas
        camera={{ position: defaultPosition, fov }}
        dpr={[1, 2]}
        style={{
          width: widthStyle,
          height: heightStyle,
          backgroundColor: '#222',
          borderRadius: '8px',
          border: '2px solid #00ff88',
          transform: isMirrored ? 'none' : 'scaleX(-1)'
        }}
      >
        <ambientLight intensity={1.0} />
        <directionalLight position={[0, 2, 5]} intensity={1.5} />
        
        <React.Suspense fallback={
          <mesh position={defaultTarget}>
            <sphereGeometry args={[0.2]} />
            <meshBasicMaterial color="yellow" />
          </mesh>
        }>
          <ErrorBoundary>
            {vrmUrl ? (
              <AvatarModel
                key={vrmUrl}
                url={vrmUrl}
                customCameraPosition={cameraPosition}
                customCameraTarget={cameraTarget}
              />
            ) : (
              <mesh position={defaultTarget}>
                <boxGeometry args={[0.3, 0.3, 0.3]} />
                <meshBasicMaterial color="#555" wireframe />
              </mesh>
            )}
          </ErrorBoundary>
        </React.Suspense>
        
        <OrbitControls target={defaultTarget} />
      </Canvas>
      <div id="error-overlay" style={{ position: 'absolute', top: 10, left: 10, color: 'red', zIndex: 10 }}></div>
    </div>
  );
};

export default VTuber3D;
