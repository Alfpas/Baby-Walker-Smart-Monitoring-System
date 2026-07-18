# Baby Walker Watch — Smart Braking System

Sistem pengereman otomatis untuk baby walker berbasis ESP32. Alat ini mendeteksi jarak ke halangan di depan dan kecepatan gerak baby walker secara real-time, lalu otomatis mengerem saat kondisi dianggap berbahaya. Data sensor dikirim ke cloud lewat MQTT dan bisa dipantau langsung dari dashboard web — mendukung beberapa unit alat sekaligus.

## Fitur

- Deteksi halangan di depan menggunakan sensor ultrasonic (HC-SR04)
- Pengukuran kecepatan roda menggunakan speed sensor HC-020K
- Pengereman otomatis via servo motor yang menjepit langsung ke roda
- Publish data sensor ke MQTT broker (EMQX Cloud) secara real-time, topic terpisah per alat
- Dashboard web dengan selector — satu tampilan, tinggal pindah tab untuk pantau alat lain
- Indikator online/offline dan status rem per alat, langsung dari daftar tab

## Cara Kerja

1. Tiap ESP32 membaca jarak dari sensor ultrasonic dan menghitung kecepatan dari pulsa encoder HC-020K.
2. Jika jarak ≤ 20 cm **atau** kecepatan ≥ 50 cm/detik, servo mengaktifkan rem.
3. Setiap 1 detik, ESP32 publish data (jarak, kecepatan, status rem) dalam format JSON ke topic MQTT sesuai `DEVICE_ID` alatnya, misal `baby_walker/esp1/status`.
4. Dashboard web subscribe ke pola wildcard `baby_walker/+/status` lewat MQTT over WebSocket, sehingga otomatis menerima data dari semua alat yang publish — tanpa perlu setup topic manual di broker.
5. User tinggal klik tab alat (Alat 1 / Alat 2 / Alat 3) di dashboard untuk melihat data alat tersebut.

## Hardware (per unit)

| Komponen | Fungsi |
|---|---|
| ESP32 | Microcontroller utama |
| Sensor ultrasonic (HC-SR04) | Deteksi jarak ke halangan di depan |
| Speed sensor HC-020K | Mengukur kecepatan roda |
| Servo motor (x2) | Mekanisme rem, menjepit roda |
| EMQX Cloud | MQTT broker untuk komunikasi data (dipakai bersama oleh semua alat) |

### Pin Mapping (ESP32)

| Pin ESP32 | Terhubung ke |
|---|---|
| GPIO 5 | TRIG ultrasonic |
| GPIO 18 | ECHO ultrasonic |
| GPIO 13 | Servo 1 |
| GPIO 12 | Servo 2 |
| GPIO 34 | Output digital HC-020K |

## Struktur Repo

```
├── baby_walker_mqtt.ino       # Firmware ESP32 (sensor + rem + MQTT publish)
├── baby_walker_dashboard.html # Dashboard web untuk monitoring live (multi-alat)
└── README.md
```

## Setup Firmware (untuk tiap unit alat)

1. Buka `baby_walker_mqtt.ino` di Arduino IDE.
2. Install library berikut lewat Library Manager:
   - `PubSubClient` (Nick O'Leary)
   - `ESP32Servo`
3. Isi kredensial WiFi:
   ```cpp
   const char* WIFI_SSID     = "GANTI_SSID_WIFI_KAMU";
   const char* WIFI_PASSWORD = "GANTI_PASSWORD_WIFI_KAMU";
   ```
4. Isi kredensial MQTT **khusus alat ini** (buat per alat di EMQX Cloud → Access Control → Authentication):
   ```cpp
   const char* MQTT_USER = "esp1";   // atau esp2 / esp3, sesuai alat
   const char* MQTT_PASS = "GANTI_MQTT_PASSWORD";
   ```
5. Isi ID alat — **ini yang membedakan tiap unit**:
   ```cpp
   const char* DEVICE_ID = "esp1";   // esp1 untuk alat 1, esp2 untuk alat 2, esp3 untuk alat 3
   ```
6. Upload ke ESP32.

Ulangi langkah 3–6 untuk tiap unit, cukup ganti `MQTT_USER` dan `DEVICE_ID`-nya saja — source code lainnya sama persis. Topic publish otomatis mengikuti `DEVICE_ID`, jadi tidak perlu dibuat manual di EMQX Cloud:

| Alat | DEVICE_ID | Topic publish |
|---|---|---|
| Alat 1 | `esp1` | `baby_walker/esp1/status` |
| Alat 2 | `esp2` | `baby_walker/esp2/status` |
| Alat 3 | `esp3` | `baby_walker/esp3/status` |

> Catatan: `secureClient.setInsecure()` dipakai supaya cepat terhubung tanpa validasi sertifikat CA. Untuk produksi, ganti dengan `setCACert()` menggunakan file CA Certificate yang bisa di-download dari dashboard EMQX Cloud.

## Setup Dashboard Web

Dashboard adalah file HTML statis (tidak butuh server backend).

1. Buka `baby_walker_dashboard.html` di editor, cari bagian ini di dalam `<script>`:
   ```js
   const MQTT_USER  = 'GANTI_MQTT_USERNAME_DASHBOARD';
   const MQTT_PASS  = 'GANTI_MQTT_PASSWORD_DASHBOARD';
   ```
2. **Jangan** pakai username `esp1`/`esp2`/`esp3` di sini. Buat 1 user MQTT terpisah khusus dashboard, misal `dashboard-viewer`, lalu isi kredensialnya di sini.
3. Di EMQX Cloud → **Access Control → Authorization/ACL**, pastikan user `dashboard-viewer` diizinkan **subscribe** ke `baby_walker/#` (atau `baby_walker/+/status`). Tanpa izin ini, koneksi tetap berhasil tapi data tidak akan pernah masuk ke dashboard.
4. Kalau nanti nambah alat baru, tambahkan entrinya di daftar `DEVICES` supaya muncul tab-nya:
   ```js
   const DEVICES = [
     { id: 'esp1', label: 'Alat 1' },
     { id: 'esp2', label: 'Alat 2' },
     { id: 'esp3', label: 'Alat 3' },
   ];
   ```

### Jalankan secara lokal

Cukup double-click file `baby_walker_dashboard.html` untuk dibuka di browser — tidak perlu server. Kalau mau pakai local server:
```bash
python3 -m http.server 8000
```
lalu buka `http://localhost:8000/baby_walker_dashboard.html`.

### Deploy ke Vercel

1. Push repo ini ke GitHub.
2. Di Vercel: **Add New Project** → import repo → Framework Preset pilih **Other** (build command & output directory dikosongkan).
3. Deploy.
4. Supaya bisa diakses langsung dari domain utama tanpa nama file (`namamu.vercel.app` bukan `namamu.vercel.app/baby_walker_dashboard.html`), **rename file jadi `index.html`** sebelum push.

Karena dashboard ini murni file statis, semua koneksi MQTT terjadi langsung dari browser pengunjung ke broker EMQX lewat WebSocket — Vercel cuma berfungsi sebagai hosting file, tidak ikut proses data.

## Konfigurasi MQTT Broker

| Parameter | Nilai |
|---|---|
| Address | `v1281112.ala.us-east-1.emqxsl.com` |
| MQTT over TLS/SSL Port | 8883 (dipakai firmware) |
| WebSocket over TLS/SSL Port | 8084 (dipakai dashboard web) |
| Pola topic status | `baby_walker/<device_id>/status` |
| Pola topic control (opsional) | `baby_walker/<device_id>/control` |

## Keamanan

- Jangan commit kredensial WiFi atau MQTT asli ke repo publik. Ganti dengan placeholder sebelum push, isi ulang kredensial asli setelah clone/deploy.
- Kredensial pada `baby_walker_dashboard.html` tertanam langsung di kode (client-side), jadi hanya cocok untuk penggunaan pribadi/link tidak disebar — bukan untuk dashboard publik.
- Pisahkan izin: user `esp1`/`esp2`/`esp3` cukup diberi izin **publish**, sedangkan user `dashboard-viewer` cukup diberi izin **subscribe**. Jangan pakai satu user yang sama untuk semuanya.

## Lisensi

Belum ditentukan — tambahkan file `LICENSE` sesuai kebutuhan (misal MIT) sebelum publish ke publik.
