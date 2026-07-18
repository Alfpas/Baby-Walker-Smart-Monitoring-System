#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ESP32Servo.h>

// ================= WIFI =================
const char* WIFI_SSID     = "Pasca Sarjana";
const char* WIFI_PASSWORD = "ublkecee";

// ================= EMQX CLOUD (dari screenshot Deployment Overview) =================
const char* MQTT_HOST = "v1281112.ala.us-east-1.emqxsl.com";
const int   MQTT_PORT = 8883; // MQTT over TLS/SSL

// Kredensial client MQTT (BUKAN API Key REST di halaman "Deployment API Key").
// Buat di menu: Access Control > Authentication > tambah username/password
// Tiap alat pakai username/password sendiri (esp1 / esp2 / esp3, dst).
const char* MQTT_USER = "esp1"; // isi: esp1 / esp2 / esp3 sesuai alatnya
const char* MQTT_PASS = "FewR2UAe25di8KV";

// ID alat ini — GANTI per unit: "esp1", "esp2", atau "esp3"
const char* DEVICE_ID = "esp2";

// Topic dibuat otomatis per alat, contoh: baby_walker/esp1/status
String TOPIC_STATUS  = "baby_walker/" + String(DEVICE_ID) + "/status";
String TOPIC_CONTROL = "baby_walker/" + String(DEVICE_ID) + "/control"; // opsional
String MQTT_CLIENT_ID = "esp32-baby-walker-" + String(DEVICE_ID);

#define TRIG_PIN 5
#define ECHO_PIN 18
#define SERVO1_PIN 13
#define SERVO2_PIN 12
#define ENCODER_PIN 34   // HC-020K DO pin

Servo servo1;
Servo servo2;

WiFiClientSecure secureClient;
PubSubClient mqttClient(secureClient);

volatile long pulseCount = 0;

long duration;
float distance;

unsigned long lastTime = 0;
unsigned long lastPublish = 0;
float kecepatan = 0;
bool sedangRem = false;

// ======= SESUAIKAN DENGAN SISTEM KAMU =======
int jumlahSlot = 20;        // biasanya 20 slot disk
float diameterRoda = 10.0;  // cm (ubah sesuai roda kamu)
// ============================================

void IRAM_ATTR hitungPulsa() {
  pulseCount++;
}

void connectWiFi() {
  Serial.print("Menyambungkan ke WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println(" tersambung!");
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  Serial.print("Pesan masuk [");
  Serial.print(topic);
  Serial.print("]: ");
  Serial.println(msg);
  // Tambahkan logika kontrol dari sini kalau perlu, misal:
  // if (msg == "REM_MANUAL") { servo1.write(90); servo2.write(90); }
}

void connectMQTT() {
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);

  while (!mqttClient.connected()) {
    Serial.print("Menyambungkan ke MQTT broker...");
    if (mqttClient.connect(MQTT_CLIENT_ID.c_str(), MQTT_USER, MQTT_PASS)) {
      Serial.println(" berhasil!");
      mqttClient.subscribe(TOPIC_CONTROL.c_str());
    } else {
      Serial.print(" gagal, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" coba lagi dalam 2 detik");
      delay(2000);
    }
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  pinMode(ENCODER_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(ENCODER_PIN), hitungPulsa, RISING);

  servo1.attach(SERVO1_PIN);
  servo2.attach(SERVO2_PIN);

  servo1.write(0);
  servo2.write(0);

  lastTime = millis();

  connectWiFi();

  // Cara paling cepat untuk mulai (skip validasi sertifikat CA).
  // Untuk produksi, lebih aman pakai secureClient.setCACert(...) dengan
  // isi file CA Certificate yang bisa di-download dari halaman EMQX Cloud.
  secureClient.setInsecure();

  connectMQTT();
}

void loop() {
  if (!mqttClient.connected()) {
    connectMQTT();
  }
  mqttClient.loop();

  // ================= ULTRASONIC =================
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  duration = pulseIn(ECHO_PIN, HIGH);
  distance = duration * 0.034 / 2;

  // ================= HITUNG KECEPATAN =================
  unsigned long currentTime = millis();
  if (currentTime - lastTime >= 1000) {  // hitung tiap 1 detik

    noInterrupts();
    long jumlahPulsa = pulseCount;
    pulseCount = 0;
    interrupts();

    float keliling = 3.1416 * diameterRoda;
    float jarakPerPulse = keliling / jumlahSlot;

    kecepatan = jumlahPulsa * jarakPerPulse;  // cm/s

    Serial.print("Kecepatan: ");
    Serial.print(kecepatan);
    Serial.println(" cm/s");

    lastTime = currentTime;
  }

  Serial.print("Jarak: ");
  Serial.print(distance);
  Serial.println(" cm");

  // ================= KONDISI SERVO =================
  if (distance <= 20 || kecepatan >= 50) {
    servo1.write(90);
    servo2.write(90);
    sedangRem = true;
  } else {
    servo1.write(0);
    servo2.write(0);
    sedangRem = false;
  }

  // ================= PUBLISH KE MQTT (tiap 1 detik) =================
  if (currentTime - lastPublish >= 1000) {
    lastPublish = currentTime;

    String payload = "{";
    payload += "\"jarak_cm\":" + String(distance, 1) + ",";
    payload += "\"kecepatan_cms\":" + String(kecepatan, 1) + ",";
    payload += "\"rem_aktif\":" + String(sedangRem ? "true" : "false");
    payload += "}";

    mqttClient.publish(TOPIC_STATUS.c_str(), payload.c_str());
  }

  delay(200);
}
