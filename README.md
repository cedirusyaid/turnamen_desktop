# 🖥️ Turnamen Match Scorer (Desktop Edition)

Aplikasi Desktop berbasis **Electron** untuk pembaruan skor pertandingan secara *real-time* dan pengelolaan papan skor Videotron. Aplikasi ini merupakan bagian dari ekosistem **turnamen.info**.

---

## 🔗 Informasi Repository
Aplikasi ini dikembangkan di dalam monorepo utama, namun dipublikasikan secara mandiri ke:
*   **Source:** `git@github.com:cedirusyaid/turnamen_desktop.git`
*   **Main Project:** [turnamen.info](https://github.com/cedirusyaid/turnamen)

---

## 🚀 Fitur Utama
*   **Live Scoring:** Update skor babak demi babak dengan sinkronisasi ke server pusat.
*   **Videotron Support:** Dual-window display khusus untuk layar besar/videotron stadion.
*   **Offline Mode:** Dukungan penuh untuk tetap mencatat skor saat koneksi internet terputus (Local Backup).
*   **QR Auth:** Login operator praktis menggunakan pemindaian QR Code dari dashboard admin.

---

## 🛠️ Persyaratan Sistem
*   **Node.js** (LTS v18 atau v20)
*   **npm**

---

## 👨‍💻 Pengembangan (Development Mode)

1.  Masuk ke direktori:
    ```bash
    cd desktop-app
    ```
2.  Instal dependensi:
    ```bash
    npm install
    ```
3.  Jalankan aplikasi:
    ```bash
    npm start
    ```

---

## 📦 Membangun Aplikasi (Build/Dist)

Kami menggunakan `electron-builder` untuk mengemas aplikasi menjadi file instalasi mandiri.

### Perintah Build sesuai OS:

*   **Linux (.AppImage & .deb):**
    ```bash
    npm run dist -- --linux
    ```
*   **Windows (.exe):**
    ```bash
    npm run dist -- --win
    ```
*   **macOS (.dmg):**
    ```bash
    npm run dist -- --mac
    ```

File hasil build akan tersedia di folder `desktop-app/dist/`.

---

## 🌐 Alternatif PWA / Web Static
Jika tidak ingin menggunakan Electron, folder `public/` berisi aset web standar yang bisa dijalankan langsung:
1.  Buka `desktop-app/public/operator.html` di browser.
2.  Gunakan fitur browser *Install App* untuk menjadikannya PWA.

---
&copy; 2026 **turnamen.info** - *Precision in Every Second*
