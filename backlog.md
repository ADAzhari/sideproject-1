# Project Backlog

## VTuber 3D Engine

### VRM 1.0 Tracking Adjustments
- **Deskripsi**: Logika pelacakan pergelangan tangan (wrist roll snap 3-state) dan tracking lainnya saat ini sudah bekerja sempurna untuk model VRM 0.0. Namun, model VRM 1.0 memiliki sistem koordinat yang berbeda (sumbu seringkali terbalik).
- **Tugas**: 
  - Uji coba rotasi lengan dan pergelangan tangan secara khusus pada model berformat VRM 1.0.
  - Verifikasi arah sumbu rotasi (X/Y/Z) pada `rightLowerArm` dan `leftLowerArm` untuk VRM 1.0.
  - Lakukan penyesuaian (*inversion* atau perubahan sumbu) pada `rollX` jika orientasinya terpelintir secara tidak wajar saat "Fix VRM 1.0 Tracking Inversion" dinyalakan.
