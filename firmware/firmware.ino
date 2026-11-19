#include <WiFi.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// --- Persistent settings (NVS) ---
Preferences prefs;

char mqtt_host[40] = "192.168.0.122";
char mqtt_port[6]  = "1883";
char device_id[20] = "esp32-01";

WiFiManagerParameter param_host("mqtt_host", "MQTT broker host", mqtt_host, 40);
WiFiManagerParameter param_port("mqtt_port", "MQTT broker port", mqtt_port, 6);
WiFiManagerParameter param_devid("device_id", "Device ID", device_id, 20);

WiFiClient netClient;
PubSubClient mqtt(netClient);

// --- Scan state ---
bool   pendingScan = false;
String scanId      = "";

// --- MQTT reconnect backoff ---
unsigned long lastMqttAttempt = 0;
unsigned long mqttBackoff     = 2000;
unsigned long mqttBackoffMax  = 30000;

// ============================================================
//  Settings
// ============================================================
void loadSettings() {
  prefs.begin("wifidoctor", true);
  String h = prefs.getString("mqtt_host", "192.168.0.122");
  String p = prefs.getString("mqtt_port", "1883");
  String d = prefs.getString("device_id", "esp32-01");
  prefs.end();
  h.toCharArray(mqtt_host, sizeof(mqtt_host));
  p.toCharArray(mqtt_port, sizeof(mqtt_port));
  d.toCharArray(device_id, sizeof(device_id));
  Serial.println("[settings] loaded:");
  Serial.print("  mqtt_host = "); Serial.println(mqtt_host);
  Serial.print("  mqtt_port = "); Serial.println(mqtt_port);
  Serial.print("  device_id = "); Serial.println(device_id);
}

void printSettings() {
  Serial.println("--- current settings ---");
  Serial.print("  mqtt_host = "); Serial.println(mqtt_host);
  Serial.print("  mqtt_port = "); Serial.println(mqtt_port);
  Serial.print("  device_id = "); Serial.println(device_id);
  Serial.print("  mqtt state = "); Serial.println(mqtt.state());
  Serial.println("------------------------");
}

void saveSettings() {
  prefs.begin("wifidoctor", false);
  prefs.putString("mqtt_host", String(mqtt_host));
  prefs.putString("mqtt_port", String(mqtt_port));
  prefs.putString("device_id", String(device_id));
  prefs.end();
  Serial.println("[settings] saved to NVS");
}

void wipeAll() {
  Serial.println("[wipe] clearing NVS + WiFiManager settings");
  prefs.begin("wifidoctor", false);
  prefs.clear();
  prefs.end();
  WiFiManager wm;
  wm.resetSettings();
  Serial.println("[wipe] rebooting in 2s");
  delay(2000);
  ESP.restart();
}

// ============================================================
//  MQTT
// ============================================================
String statusTopic() { return String("devices/") + device_id + "/status"; }
String cmdTopic()    { return String("devices/") + device_id + "/cmd";    }
String scanTopic()   { return String("devices/") + device_id + "/scan";   }

bool mqttConnect() {
  Serial.print("[mqtt] connecting to ");
  Serial.print(mqtt_host); Serial.print(":"); Serial.println(mqtt_port);

  String clientId = String(device_id);
  String will     = statusTopic();

  bool ok = mqtt.connect(
    clientId.c_str(),
    nullptr, nullptr,            // no user/pass in Phase A
    will.c_str(),                // Last Will topic
    0,                           // will QoS
    true,                        // will retained
    "offline"                    // will payload
  );

  if (!ok) {
    Serial.print("[mqtt] connect failed, rc="); Serial.println(mqtt.state());
    return false;
  }

  Serial.println("[mqtt] connected");
  mqtt.publish(will.c_str(), "online", true);

  String cmd = cmdTopic();
  mqtt.subscribe(cmd.c_str(), 0);
  Serial.print("[mqtt] subscribed to "); Serial.println(cmd);

  mqttBackoff = 2000;
  return true;
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String msg;
  msg.reserve(length + 1);
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];

  Serial.print("[mqtt] << "); Serial.print(topic);
  Serial.print(" : "); Serial.println(msg);

  if (String(topic) != cmdTopic()) return;

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, msg);
  if (err) { Serial.print("[mqtt] JSON err: "); Serial.println(err.c_str()); return; }

  const char* action = doc["action"] | "";
  if (strcmp(action, "scan") != 0) {
    Serial.print("[mqtt] unknown action: "); Serial.println(action);
    return;
  }

  scanId = String((const char*)(doc["scan_id"] | ""));
  pendingScan = true;
  Serial.print("[scan] requested, id=");
  Serial.println(scanId.length() ? scanId : "(none)");
}

// ============================================================
//  Scan
// ============================================================
void executeScan() {
  Serial.println("[scan] starting WiFi scan...");
  unsigned long t0 = millis();
  int n = WiFi.scanNetworks();
  unsigned long dt = millis() - t0;
  Serial.print("[scan] done in "); Serial.print(dt);
  Serial.print(" ms, "); Serial.print(n); Serial.println(" networks");

  if (n <= 0) {
    WiFi.scanDelete();
    pendingScan = false;
    return;
  }

  // Sort indices by RSSI, strongest first
  const int MAX_NETS = 64;
  const int TOP_N    = 15;
  int count = n > MAX_NETS ? MAX_NETS : n;
  int idx[MAX_NETS];
  for (int i = 0; i < count; i++) idx[i] = i;
  for (int i = 1; i < count; i++) {
    int key = idx[i];
    int keyR = WiFi.RSSI(key);
    int j = i - 1;
    while (j >= 0 && WiFi.RSSI(idx[j]) < keyR) {
      idx[j + 1] = idx[j];
      j--;
    }
    idx[j + 1] = key;
  }

  int topN = count < TOP_N ? count : TOP_N;

  JsonDocument doc;
  doc["device_id"] = device_id;
  if (scanId.length()) doc["scan_id"] = scanId;
  JsonArray nets = doc["networks"].to<JsonArray>();

  for (int i = 0; i < topN; i++) {
    int k = idx[i];
    JsonObject net = nets.add<JsonObject>();
    net["ssid"]    = WiFi.SSID(k);
    net["bssid"]   = WiFi.BSSIDstr(k);
    net["rssi"]    = WiFi.RSSI(k);
    net["channel"] = WiFi.channel(k);
  }

  String out;
  serializeJson(doc, out);
  Serial.print("[scan] payload "); Serial.print(out.length());
  Serial.println(" bytes");

  if (mqtt.connected()) {
    String st = scanTopic();
    bool ok = mqtt.publish(st.c_str(), out.c_str(), false);
    Serial.print("[scan] publish "); Serial.println(ok ? "OK" : "FAILED");
  } else {
    Serial.println("[scan] MQTT disconnected, cannot publish");
  }

  WiFi.scanDelete();
  pendingScan = false;
  scanId      = "";
}

// ============================================================
//  Serial
// ============================================================
void handleSerial() {
  if (!Serial.available()) return;
  char c = Serial.read();
  switch (c) {
    case 'r': case 'R': wipeAll();     break;
    case 's': case 'S': printSettings(); break;
    case 'm': case 'M':
      Serial.print("[mqtt] state="); Serial.print(mqtt.state());
      Serial.print(" connected="); Serial.println(mqtt.connected() ? "yes" : "no");
      break;
    case 'c': case 'C':
      if (mqtt.connected()) mqtt.disconnect();
      Serial.println("[mqtt] forcing reconnect");
      lastMqttAttempt = 0;
      break;
  }
}

// ============================================================
//  Setup
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println();
  Serial.println("=== WiFiDoctor Firmware (Phase A) ===");
  Serial.println("Serial commands: r=wipe  s=settings  m=mqtt-state  c=force-reconnect");

  loadSettings();

  WiFi.mode(WIFI_STA);

  WiFiManager wm;
  wm.setConfigPortalTimeout(180);
  wm.setConnectTimeout(30);
  wm.addParameter(&param_host);
  wm.addParameter(&param_port);
  wm.addParameter(&param_devid);
  wm.setSaveParamsCallback([]() {
    strncpy(mqtt_host, param_host.getValue(), sizeof(mqtt_host) - 1);
    strncpy(mqtt_port, param_port.getValue(), sizeof(mqtt_port) - 1);
    strncpy(device_id, param_devid.getValue(), sizeof(device_id) - 1);
    saveSettings();
  });

  if (!wm.autoConnect("WiFiDoctor-Setup")) {
    Serial.println("[wifi] failed, rebooting");
    delay(2000);
    ESP.restart();
  }

  Serial.print("[wifi] connected, IP="); Serial.println(WiFi.localIP());
  Serial.print("[wifi] RSSI="); Serial.println(WiFi.RSSI());

  mqtt.setServer(mqtt_host, atoi(mqtt_port));
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(4096);
  mqtt.setKeepAlive(30);

  mqttConnect();
}

// ============================================================
//  Loop
// ============================================================
void loop() {
  handleSerial();

  if (pendingScan) {
    executeScan();
  }

  if (mqtt.connected()) {
    mqtt.loop();
  } else {
    unsigned long now = millis();
    if (now - lastMqttAttempt >= mqttBackoff) {
      lastMqttAttempt = now;
      if (!mqttConnect()) {
        mqttBackoff = mqttBackoff * 2 > mqttBackoffMax ? mqttBackoffMax : mqttBackoff * 2;
        Serial.print("[mqtt] retry in "); Serial.print(mqttBackoff); Serial.println(" ms");
      }
    }
  }
}