"use client";
import React, { useRef, useEffect } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
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

const AvatarModel = ({ url }) => {
  const vrmRef = useRef(null);

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
      VRMUtils.combineSkeletons(gltf.scene); // Replaced deprecated removeUnnecessaryJoints
      
      // Rotate model to face camera
      vrm.scene.rotation.y = Math.PI;

      // Relax arms from T-pose to a natural resting A-pose
      const leftUpperArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
      const rightUpperArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');

      // 1.1 radians is roughly 63 degrees down
      if (leftUpperArm) {
        leftUpperArm.rotation.z = 1.1;
      }
      if (rightUpperArm) {
        rightUpperArm.rotation.z = -1.1;
      }

      console.log("VRM Model loaded successfully!");
    }
  }, [gltf]);

  useFrame((state, delta) => {
    const vrm = vrmRef.current;
    if (!vrm) return;

    // Update VRM physics/lookAt
    vrm.update(delta);

    // Apply Kalidokit tracking data from global store
    const riggedFace = VTuberStore.riggedFace;
    if (riggedFace) {
      // 1. HEAD ROTATION
      // Kalidokit gives head rotation in radians (Euler X, Y, Z)
      const headBone = vrm.humanoid.getNormalizedBoneNode('head');
      const neckBone = vrm.humanoid.getNormalizedBoneNode('neck');
      
      if (headBone) {
        // Kalidokit sometimes uses different coordinate systems, standard is X, Y, Z
        let { x, y, z } = riggedFace.head;
        if (VTuberStore.vrm1Mode) {
          x *= -1;
          y *= -1;
          z *= -1;
        }
        const targetRotation = new THREE.Euler(x, y, z, 'XYZ');
        const targetQuaternion = new THREE.Quaternion().setFromEuler(targetRotation);
        
        // Smoothly interpolate head rotation using Slerp
        headBone.quaternion.slerp(targetQuaternion, 0.2);
      }

      // 2. FACIAL EXPRESSIONS (Blendshapes)
      if (vrm.expressionManager) {
        // Eyes (Blink)
        // Convert to standard VRM 1.0 or 0.0 expression names
        // Kalidokit outputs eye openness (1 = open, 0 = closed)
        // VRM blink expects blink amount (1 = blinking/closed, 0 = open)
        const blinkL = 1 - riggedFace.eye.l;
        const blinkR = 1 - riggedFace.eye.r;
        
        // Try VRM 1.0 standard names first, fallback to 0.0
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
        
        // Fallback to VRM 0.0 names
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

    // Apply Fake Spine Tilt from Head Rotation
    if (riggedFace) {
      const spineBone = vrm.humanoid.getNormalizedBoneNode('spine');
      const chestBone = vrm.humanoid.getNormalizedBoneNode('chest');
      
      if (spineBone && chestBone) {
        let pitch = riggedFace.head.x;
        let yaw = riggedFace.head.y;
        let roll = riggedFace.head.z;
        
        if (VTuberStore.vrm1Mode) {
          pitch *= -1;
          yaw *= -1;
          roll *= -1;
        }
        
        const spineEuler = new THREE.Euler(pitch * 0.2, yaw * 0.2, roll * 0.2, 'XYZ');
        const chestEuler = new THREE.Euler(pitch * 0.2, yaw * 0.2, roll * 0.2, 'XYZ');
        
        spineBone.quaternion.slerp(new THREE.Quaternion().setFromEuler(spineEuler), 0.2);
        chestBone.quaternion.slerp(new THREE.Quaternion().setFromEuler(chestEuler), 0.2);
      }
    }

    const leftUpperArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
    const rightUpperArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
    const leftLowerArm = vrm.humanoid.getNormalizedBoneNode('leftLowerArm');
    const rightLowerArm = vrm.humanoid.getNormalizedBoneNode('rightLowerArm');

    const relaxArms = () => {
      const aPoseLeft = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 1.1));
      const aPoseRight = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -1.1));
      const relaxElbow = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
      
      if (leftUpperArm) leftUpperArm.quaternion.slerp(aPoseLeft, 0.1);
      if (rightUpperArm) rightUpperArm.quaternion.slerp(aPoseRight, 0.1);
      if (leftLowerArm) leftLowerArm.quaternion.slerp(relaxElbow, 0.1);
      if (rightLowerArm) rightLowerArm.quaternion.slerp(relaxElbow, 0.1);
    };

    if (riggedPose) {
      // MODE: Full Pose (Smoothed)
      const applyRotation = (boneName, rotationObj, slerpFactor) => {
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
        bone.quaternion.slerp(targetQuat, slerpFactor);
      };

      // Heavy mathematical Low-Pass Filter (0.05) to reduce glitching and snapping
      const smoothing = 0.05;
      applyRotation('rightUpperArm', riggedPose.RightUpperArm, smoothing);
      applyRotation('rightLowerArm', riggedPose.RightLowerArm, smoothing);
      
      applyRotation('leftUpperArm', riggedPose.LeftUpperArm, smoothing);
      applyRotation('leftLowerArm', riggedPose.LeftLowerArm, smoothing);
      
      // WRIST FUSION FIX:
      // By NOT applying riggedPose.RightHand/LeftHand, the wrist bone simply inherits
      // the rotation of the forearm. This keeps the wrist perfectly straight and prevents 
      // the horrific backward-bending contortion when the AI guesses the wrist angle wrong.
      const rightHand = vrm.humanoid.getNormalizedBoneNode('rightHand');
      const leftHand = vrm.humanoid.getNormalizedBoneNode('leftHand');
      if (rightHand) rightHand.quaternion.slerp(RELAXED_QUAT, 0.1);
      if (leftHand) leftHand.quaternion.slerp(RELAXED_QUAT, 0.1);
      
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
              bone.quaternion.slerp(targetQuat, 0.15); // Snappier smoothing for fingers
            }
          }
        } else {
          // If this specific hand is lost but the other is tracked, relax the lost hand
          const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
          if (bone) bone.quaternion.slerp(RELAXED_QUAT, 0.1);
        }
      });
    } else {
      // Relax all fingers if tracking is completely disabled or lost
      FINGER_BONES.forEach(boneName => {
        const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
        if (bone) {
          bone.quaternion.slerp(RELAXED_QUAT, 0.1);
        }
      });
    }
  });

  return <primitive object={gltf.scene} />;
};

const VTuber3D = ({ isMirrored = true, vrmUrl }) => {
  return (
    <div style={{ position: 'relative' }}>
      <Canvas
        camera={{ position: [0, 1.3, 1], fov: 40 }}
        dpr={[1, 2]}
        style={{
          width: '640px',
          height: '480px',
          backgroundColor: '#222',
          borderRadius: '8px',
          border: '2px solid #00ff88',
          transform: isMirrored ? 'scaleX(-1)' : 'none'
        }}
      >
        <ambientLight intensity={1.0} />
        <directionalLight position={[0, 2, 5]} intensity={1.5} />
        
        <React.Suspense fallback={
          <mesh position={[0, 1.5, 0]}>
            <sphereGeometry args={[0.2]} />
            <meshBasicMaterial color="yellow" />
          </mesh>
        }>
          <ErrorBoundary>
            {vrmUrl ? (
              <AvatarModel key={vrmUrl} url={vrmUrl} />
            ) : (
              <mesh position={[0, 1.3, 0]}>
                <boxGeometry args={[0.3, 0.3, 0.3]} />
                <meshBasicMaterial color="#555" wireframe />
              </mesh>
            )}
          </ErrorBoundary>
        </React.Suspense>
        
        <OrbitControls target={[0, 1.3, 0]} />
      </Canvas>
      <div id="error-overlay" style={{ position: 'absolute', top: 10, left: 10, color: 'red', zIndex: 10 }}></div>
    </div>
  );
};

export default VTuber3D;
