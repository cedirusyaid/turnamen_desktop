# Panduan Menjalankan & Build Aplikasi Desktop Turnamen

Aplikasi desktop ini dikembangkan berbasis **Electron** sehingga dapat dijalankan dan dikompilasi (packaging) ke berbagai OS (Linux, Windows, macOS).

---

## 1. Kebutuhan Sistem (Prerequisites)
Sebelum memulai, pastikan perangkat Anda sudah terinstal:
*   **Node.js** (Rekomendasi versi LTS 18 atau 20)
*   **npm** (Bawaan dari Node.js)

---

## 2. Cara Menjalankan untuk Pengembangan (Development Mode)
Untuk menguji coba aplikasi secara langsung di PC lokal:

1.  Buka terminal/command prompt.
2.  Masuk ke direktori aplikasi desktop:
    ```bash
    cd desktop-app
    ```
3.  Instal seluruh library dependensi (termasuk Electron):
    ```bash
    npm install
    ```
4.  Jalankan aplikasi desktop:
    ```bash
    npm start
    ```
    *Aplikasi desktop akan langsung terbuka menampilkan setup modal.*

---

## 3. Cara Build ke Aplikasi Mandiri (Standalone Executable)

Untuk mengemas (package) aplikasi menjadi file instalasi siap pakai tanpa memerlukan Node.js terinstal di PC klien, kita akan menggunakan tool populer **`electron-builder`**.

### Langkah A: Tambah Dependensi Build
Instal library `electron-builder` secara global atau lokal di project:
```bash
cd desktop-app
npm install electron-builder --save-dev
```

### Langkah B: Update Konfigurasi `package.json`
Tambahkan konfigurasi build di file `desktop-app/package.json`. File `package.json` Anda akan terlihat seperti ini:

```json
{
  "name": "turnamen-match-updater",
  "version": "1.0.0",
  "description": "Desktop Match Scorer & Videotron Scoreboard",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dist": "electron-builder"
  },
  "build": {
    "appId": "info.turnamen.scorer",
    "productName": "TurnamenScorer",
    "files": [
      "main.js",
      "public/**/*"
    ],
    "linux": {
      "target": ["AppImage", "deb"],
      "category": "Sports"
    },
    "win": {
      "target": ["nsis"]
    },
    "mac": {
      "target": ["dmg"]
    }
  },
  "devDependencies": {
    "electron": "^30.0.0",
    "electron-builder": "^24.13.3"
  }
}
```

### Langkah C: Eksekusi Perintah Build

Jalankan perintah build sesuai dengan sistem operasi target:

#### 🐧 Untuk Linux (Menghasilkan `.AppImage` dan `.deb`):
```bash
npm run dist -- --linux
```
*   File output `.deb` (Debian/Ubuntu Installer) dan `.AppImage` (Portable Linux app) akan tersimpan di dalam folder `desktop-app/dist/`.
*   Untuk menginstalnya di Debian/Ubuntu, cukup jalankan:
    ```bash
    sudo dpkg -i dist/TurnamenScorer_1.0.0_amd64.deb
    ```

#### 🪟 Untuk Windows (Menghasilkan `.exe` installer):
Jika Anda melakukan build dari sistem operasi Windows:
```bash
npm run dist -- --win
```
*   Akan menghasilkan Windows Installer `.exe` di dalam folder `desktop-app/dist/`.

#### 🍏 Untuk macOS (Menghasilkan `.dmg`):
Jika Anda melakukan build dari perangkat macOS:
```bash
npm run dist -- --mac
```
*   Akan menghasilkan file `.dmg` di folder `desktop-app/dist/`.

---

## 4. Cara PWA / Non-Electron (Alternatif Tanpa Install)
Jika Anda tidak ingin mengompilasi sebagai aplikasi desktop, Anda dapat langsung menggunakannya sebagai **web static offline**:
1.  Buka folder `desktop-app/public/`.
2.  Buka file `operator.html` di web browser apa saja.
3.  Simpan sebagai bookmark atau instal via menu browser (*Install / Add to Home Screen*).
