// State global sederhana menggunakan objek biasa (Mutable Store).
// Kita tidak menggunakan React State (useState) agar pembaruan data pada 60 FPS
// tidak memicu re-render ulang seluruh aplikasi yang akan membuat ngelag.

export const VTuberStore = {
  riggedFace: null,
  matrix: null,
  headRotation: { x: 0, y: 0, z: 0 } // Cadangan untuk rotasi kepala nanti
};
