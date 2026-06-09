# Web VTuber Application 🎥

https://sideproject-1-weld.vercel.app/

[English](#english) | [Bahasa Indonesia](#bahasa-indonesia)

---

<h2 id="english">🇬🇧 English</h2>

A highly optimized, web-based VTuber application built with **Next.js**, **React Three Fiber**, **MediaPipe**, and **Kalidokit**. This application captures your webcam feed, runs real-time facial tracking, and animates a 3D VRM avatar directly in your browser.

### ✨ Features
- **Real-Time Facial Tracking**: Utilizes Google's MediaPipe for highly accurate facial landmarks.
- **3D Avatar Rendering**: Loads and renders standard `.vrm` models using React Three Fiber.
- **Low-End Device Friendly**: Heavy AI and mathematical computations are offloaded to a **Web Worker**, ensuring the 3D rendering stays at a smooth 60 FPS without stuttering the main UI thread.
- **GPU Accelerated**: Uses `float16` AI models and WebGPU/WebGL delegation for maximum performance.

### 🚀 Getting Started
1. Open https://sideproject-1-weld.vercel.app/

#### OR

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Place your VRM model:**
   Drop your `.vrm` avatar model into the `public/models/` directory and rename it to `avatar.vrm` (or update the path in `VTuber3D.jsx`).
3. **Run the development server:**
   ```bash
   npm run dev
   ```
4. **Open the app:**
   Navigate to [http://localhost:3000](http://localhost:3000) and grant camera permissions to start tracking!

### 🛠️ Tech Stack
- **Frontend Framework**: Next.js (App Router)
- **3D Rendering**: React Three Fiber, Three.js, `@pixiv/three-vrm`
- **AI Tracking**: `@mediapipe/tasks-vision`
- **Kinematic Solver**: `kalidokit`

---

<h2 id="bahasa-indonesia">🇮🇩 Bahasa Indonesia</h2>

Aplikasi VTuber berbasis web yang sangat dioptimalkan, dibangun menggunakan **Next.js**, **React Three Fiber**, **MediaPipe**, dan **Kalidokit**. Aplikasi ini menangkap kamera (webcam) Anda, menjalankan pelacakan wajah secara real-time, dan menganimasikan avatar 3D VRM langsung di browser Anda.

### ✨ Fitur
- **Pelacakan Wajah Real-Time**: Menggunakan MediaPipe dari Google untuk mendeteksi titik wajah (landmarks) dengan sangat akurat.
- **Render Avatar 3D**: Memuat dan menampilkan model standar `.vrm` menggunakan React Three Fiber.
- **Ramah HP/PC Kentang**: Komputasi AI dan matematika yang berat dipindahkan sepenuhnya ke **Web Worker**. Ini memastikan render 3D tetap berjalan mulus di 60 FPS tanpa membuat aplikasi ngelag.
- **Akselerasi GPU**: Menggunakan model AI `float16` dan hardware acceleration (WebGPU/WebGL) untuk performa maksimal.

### 🚀 Cara Memulai


1. Buka https://sideproject-1-weld.vercel.app/

#### ATAU 

1. **Instal dependensi:**
   ```bash
   npm install
   ```
2. **Siapkan model VRM Anda:**
   Masukkan model avatar `.vrm` Anda ke dalam folder `public/models/` dan ubah namanya menjadi `avatar.vrm` (atau ubah path-nya di `VTuber3D.jsx`).
3. **Jalankan server pengembangan:**
   ```bash
   npm run dev
   ```
4. **Buka aplikasi:**
   Buka [http://localhost:3000](http://localhost:3000) di browser Anda dan berikan izin akses kamera untuk memulai!

### 🛠️ Teknologi yang Digunakan
- **Framework Frontend**: Next.js (App Router)
- **Render 3D**: React Three Fiber, Three.js, `@pixiv/three-vrm`
- **Pelacak AI**: `@mediapipe/tasks-vision`
- **Penghitung Rotasi Tulang**: `kalidokit`
