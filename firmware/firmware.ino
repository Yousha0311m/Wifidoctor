#include <WiFi.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <BLE.h>

// BLE protocol constants — must match src/lib/hardware.ts
#define BLE_SERVICE_UUID  "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define BLE_CHAR_UUID     "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define BLE_DEVICE_PREFIX "SignalFloor"

#define BLE_TIMEOUT_MS  (5UL * 60UL * 1000UL)
#define WIFI_TIMEOUT_MS 15000UL

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

// --- Monitor mode (always-on checks, saved in NVS so it survives a reboot) ---
bool          monitorEnabled  = false;
unsigned int  monitorInterval = 60;          // seconds between readings
unsigned long lastSampleMs    = 0;
unsigned int  sampleCounter   = 0;
bool          monitorKick     = false;       // take a reading right away
const unsigned int NEIGHBOUR_EVERY = 5;      // look at neighbouring networks every Nth reading

// Link drops are noted by the WiFi event handler and reported once MQTT is back
volatile bool          dropNoted    = false;
volatile uint8_t       dropReason   = 0;
volatile unsigned long dropAtMs     = 0;
volatile bool          backNoted    = false;
unsigned long          downSinceMs  = 0;
uint8_t                downReason   = 0;
bool                   dropPending  = false; // a drop still has to be reported

// --- MQTT reconnect backoff ---
unsigned long lastMqttAttempt = 0;
unsigned long mqttBackoff     = 2000;
unsigned long mqttBackoffMax  = 30000;

// --- BLE state (core 4.x BLE library) ---
char                  bleNameStr[24] = BLE_DEVICE_PREFIX "-0000";
bool                  bleClientConnected = false;
bool                  bleStarted         = false;
String                bleRxBuf;
unsigned long         bleStartTime = 0;

// --- Provisioning state machine ---
enum ProvState { PROV_WIFI_CONNECTING, PROV_BLE, PROV_DONE };
ProvState     provState = PROV_WIFI_CONNECTING;
unsigned long wifiConnectStart = 0;
String        pendingSsid, pendingPass, pendingHost, pendingPort, pendingDeviceId;

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
  Serial.print("[settings] mqtt="); Serial.print(mqtt_host);
  Serial.print(":"); Serial.print(mqtt_port);
  Serial.print(" id="); Serial.println(device_id);
}

void saveSettings() {
  prefs.begin("wifidoctor", false);
  prefs.putString("mqtt_host", String(mqtt_host));
  prefs.putString("mqtt_port", String(mqtt_port));
  prefs.putString("device_id", String(device_id));
  prefs.end();
  Serial.println("[settings] saved to NVS");
}

void printSettings() {
  Serial.println("--- current settings ---");
  Serial.print("  mqtt_host = "); Serial.println(mqtt_host);
  Serial.print("  mqtt_port = "); Serial.println(mqtt_port);
  Serial.print("  device_id = "); Serial.println(device_id);
  Serial.print("  mqtt state = "); Serial.println(mqtt.state());
  Serial.println("------------------------");
}

void wipeAll() {
  Serial.println("[wipe] clearing NVS + WiFiManager");
  prefs.begin("wifidoctor", false);
  prefs.clear();
  prefs.end();
  WiFiManager wm;
  wm.resetSettings();
  delay(2000);
  ESP.restart();
}

// ============================================================
//  MQTT
// ============================================================
String statusTopic() { return String("devices/") + device_id + "/status"; }
String cmdTopic()    { return String("devices/") + device_id + "/cmd";    }
String scanTopic()   { return String("devices/") + device_id + "/scan";   }

String monitorTopic() { return String("devices/") + device_id + "/monitor"; }

// ============================================================
//  Monitor mode
// ============================================================
void loadMonitor() {
  prefs.begin("wifidoctor", true);
  monitorEnabled  = prefs.getBool("mon_on", false);
  monitorInterval = prefs.getUInt("mon_int", 60);
  prefs.end();
  if (monitorInterval < 30)   monitorInterval = 30;
  if (monitorInterval > 3600) monitorInterval = 3600;
}

void saveMonitor() {
  prefs.begin("wifidoctor", false);
  prefs.putBool("mon_on", monitorEnabled);
  prefs.putUInt("mon_int", monitorInterval);
  prefs.end();
}

void publishMonitorState() {
  if (!mqtt.connected()) return;
  JsonDocument d;
  d["type"] = "state";
  d["enabled"] = monitorEnabled;
  d["interval"] = monitorInterval;
  String out;
  serializeJson(d, out);
  mqtt.publish(monitorTopic().c_str(), out.c_str());
}

// Called by the WiFi stack on its own task: only note what happened
void onWifiEvent(arduino_event_id_t event, arduino_event_info_t info) {
  if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    if (!dropNoted && provState == PROV_DONE) {   // only after setup; first disconnect of a drop; repeats while retrying are ignored
      dropReason = info.wifi_sta_disconnected.reason;
      dropAtMs   = millis();
      dropNoted  = true;
    }
  } else if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
    backNoted = true;
  }
}

// Time to open a connection to ip:port. Returns -1 if nothing answered in time.
// A refused connection still proves the machine is there, so it counts as reachable.
int probeMs(IPAddress ip, uint16_t port, uint32_t timeoutMs) {
  WiFiClient c;
  unsigned long t0 = millis();
  bool ok = c.connect(ip, port, timeoutMs);
  unsigned long dt = millis() - t0;
  c.stop();
  if (ok || dt < timeoutMs - 150) return (int)dt;
  return -1;
}

int dnsMs() {
  IPAddress ip;
  unsigned long t0 = millis();
  bool ok = WiFi.hostByName("example.com", ip) == 1;
  unsigned long dt = millis() - t0;
  return ok ? (int)dt : -1;
}

void reportDropIfAny() {
  if (!mqtt.connected()) return;
  if (dropNoted && !dropPending) {          // new drop, remember it
    dropPending = true;
    downSinceMs = dropAtMs;
    downReason  = dropReason;
  }
  if (!dropPending) return;
  if (WiFi.status() != WL_CONNECTED) return; // still down, report when back
  unsigned long downS = (millis() - downSinceMs) / 1000;
  JsonDocument a;
  a["type"] = "event"; a["event"] = "disconnect"; a["reason"] = downReason;
  a["ago_s"] = downS;                        // the dashboard backdates it
  String o1; serializeJson(a, o1);
  mqtt.publish(monitorTopic().c_str(), o1.c_str());

  JsonDocument b;
  b["type"] = "event"; b["event"] = "reconnect"; b["down_s"] = downS;
  String o2; serializeJson(b, o2);
  mqtt.publish(monitorTopic().c_str(), o2.c_str());

  dropPending = false;
  dropNoted   = false;
  backNoted   = false;
  monitorKick = true;                        // take a reading right after coming back
}

void takeSample() {
  if (WiFi.status() != WL_CONNECTED || !mqtt.connected()) return;
  sampleCounter++;

  JsonDocument d;
  d["type"]    = "sample";
  d["rssi"]    = WiFi.RSSI();
  d["channel"] = WiFi.channel();
  d["ssid"]    = WiFi.SSID();
  int gw  = probeMs(WiFi.gatewayIP(), 80, 1000);
  int net = probeMs(IPAddress(1, 1, 1, 1), 443, 1500);
  int dns = dnsMs();
  if (gw  >= 0) d["gw_ms"]  = gw;   else d["gw_ms"]  = nullptr;
  if (net >= 0) d["net_ms"] = net;  else d["net_ms"] = nullptr;
  if (dns >= 0) d["dns_ms"] = dns;  else d["dns_ms"] = nullptr;
  d["heap"] = ESP.getFreeHeap();
  d["up"]   = (uint32_t)(millis() / 1000);

  if (sampleCounter == 1 || sampleCounter % NEIGHBOUR_EVERY == 0) {
    int n = WiFi.scanNetworks();
    if (n > 0) {
      const int MAXN = 48, KEEP = 12;
      int count = n > MAXN ? MAXN : n;
      int idx[MAXN];
      for (int i = 0; i < count; i++) idx[i] = i;
      for (int i = 1; i < count; i++) {
        int key = idx[i], keyR = WiFi.RSSI(key), j = i - 1;
        while (j >= 0 && WiFi.RSSI(idx[j]) < keyR) { idx[j + 1] = idx[j]; j--; }
        idx[j + 1] = key;
      }
      JsonArray arr = d["networks"].to<JsonArray>();
      for (int i = 0; i < count && (int)arr.size() < KEEP; i++) {
        int k = idx[i];
        JsonObject o = arr.add<JsonObject>();
        o["ssid"]    = WiFi.SSID(k);
        o["bssid"]   = WiFi.BSSIDstr(k);
        o["rssi"]    = WiFi.RSSI(k);
        o["channel"] = WiFi.channel(k);
      }
      d["aps"] = n;
    }
    WiFi.scanDelete();
  }

  String out;
  serializeJson(d, out);
  bool ok = mqtt.publish(monitorTopic().c_str(), out.c_str());
  Serial.print("[monitor] reading sent="); Serial.print(ok);
  Serial.print(" rssi="); Serial.print(WiFi.RSSI());
  Serial.print(" gw="); Serial.print(gw);
  Serial.print(" net="); Serial.print(net);
  Serial.print(" dns="); Serial.println(dns);
}

void monitorTick() {
  reportDropIfAny();
  if (!monitorEnabled || provState != PROV_DONE) return;
  unsigned long now = millis();
  if (monitorKick || now - lastSampleMs >= monitorInterval * 1000UL) {
    monitorKick  = false;
    lastSampleMs = now;
    takeSample();
  }
}

bool mqttConnect() {
  Serial.print("[mqtt] connecting to ");
  Serial.print(mqtt_host); Serial.print(":"); Serial.println(mqtt_port);

  String clientId = String(device_id);
  String will     = statusTopic();

  bool ok = mqtt.connect(
    clientId.c_str(),
    nullptr, nullptr,
    will.c_str(), 0, true, "offline"
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
  publishMonitorState();
  if (monitorEnabled) monitorKick = true;
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
  if (strcmp(action, "monitor") == 0) {
    monitorEnabled = doc["enabled"] | false;
    unsigned int iv = doc["interval"] | 60;
    if (iv < 30) iv = 30;
    if (iv > 3600) iv = 3600;
    monitorInterval = iv;
    saveMonitor();
    publishMonitorState();
    if (monitorEnabled) monitorKick = true;
    Serial.print("[monitor] "); Serial.print(monitorEnabled ? "on, every " : "off, interval ");
    Serial.print(monitorInterval); Serial.println("s");
    return;
  }
  if (strcmp(action, "scan") != 0) return;

  scanId = String((const char*)(doc["scan_id"] | ""));
  pendingScan = true;
}

// ============================================================
//  Scan
// ============================================================
void executeScan() {
  Serial.println("[scan] starting WiFi scan...");
  // The network this board is joined to is "your" network. Remember its name first.
  String ownSsid = (WiFi.status() == WL_CONNECTED) ? WiFi.SSID() : String("");
  unsigned long t0 = millis();
  int n = WiFi.scanNetworks();
  unsigned long dt = millis() - t0;
  Serial.print("[scan] done in "); Serial.print(dt);
  Serial.print(" ms, "); Serial.print(n); Serial.println(" networks");

  if (n < 0) {  // the scan itself failed: report nothing rather than a fake "dead" reading
    Serial.println("[scan] scan failed");
    WiFi.scanDelete(); pendingScan = false; scanId = "";
    return;
  }
  // n == 0 is a real answer (heard nothing) and is still reported below

  const int MAX_NETS = 64;
  const int TOP_N    = 15;
  int count = n > MAX_NETS ? MAX_NETS : n;
  int idx[MAX_NETS];
  for (int i = 0; i < count; i++) idx[i] = i;
  for (int i = 1; i < count; i++) {
    int key = idx[i], keyR = WiFi.RSSI(key), j = i - 1;
    while (j >= 0 && WiFi.RSSI(idx[j]) < keyR) { idx[j + 1] = idx[j]; j--; }
    idx[j + 1] = key;
  }

  int topN = count < TOP_N ? count : TOP_N;

  JsonDocument doc;
  doc["device_id"] = device_id;
  if (scanId.length()) doc["scan_id"] = scanId;
  if (ownSsid.length()) doc["own_ssid"] = ownSsid;
  JsonArray nets = doc["networks"].to<JsonArray>();

  for (int i = 0; i < topN; i++) {
    int k = idx[i];
    JsonObject net = nets.add<JsonObject>();
    net["ssid"]    = WiFi.SSID(k);
    net["bssid"]   = WiFi.BSSIDstr(k);
    net["rssi"]    = WiFi.RSSI(k);
    net["channel"] = WiFi.channel(k);
  }

  // Our own network must always be in the report, even when it is so weak that
  // 15 louder neighbours push it out of the top list. List is sorted loudest first,
  // so the first match is our strongest access point.
  if (ownSsid.length()) {
    for (int i = topN; i < count; i++) {
      int k = idx[i];
      if (WiFi.SSID(k) == ownSsid) {
        JsonObject net = nets.add<JsonObject>();
        net["ssid"]    = WiFi.SSID(k);
        net["bssid"]   = WiFi.BSSIDstr(k);
        net["rssi"]    = WiFi.RSSI(k);
        net["channel"] = WiFi.channel(k);
        break;
      }
    }
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
//  BLE provisioning (ESP32 core 4.x built-in BLE library)
// ============================================================
static const BLEUUID SVC_UUID(BLE_SERVICE_UUID);
static const BLEUUID CHR_UUID(BLE_CHAR_UUID);
BLEServer         bleServer;
BLECharacteristic bleChr;
SemaphoreHandle_t bleMutex = nullptr;

void notifyBLE(const String& json) {
  if (!bleChr || !bleClientConnected) return;
  String out = json + "\n";
  // Send in 20-byte pieces so it works even before a bigger packet size is agreed.
  // The dashboard glues pieces back together at the newline.
  const size_t CH = 20;
  for (size_t i = 0; i < out.length(); i += CH) {
    size_t n = out.length() - i;
    if (n > CH) n = CH;
    bleChr.notify((const uint8_t*)out.c_str() + i, n);
    delay(8);
  }
  Serial.print("[ble] >> "); Serial.println(json);
}

// Tell the dashboard which WiFi networks this board can hear, so the user can pick one
// instead of typing the name. One short message per network, then a "done" message.
void sendNetworkList() {
  Serial.println("[ble] scanning nearby WiFi for the pick list...");
  int n = WiFi.scanNetworks();
  if (n < 0) n = 0;

  const int MAX_NETS = 64;
  const int MAX_LIST = 12;
  int count = n > MAX_NETS ? MAX_NETS : n;
  int idx[MAX_NETS];
  for (int i = 0; i < count; i++) idx[i] = i;
  for (int i = 1; i < count; i++) {   // loudest first
    int key = idx[i], keyR = WiFi.RSSI(key), j = i - 1;
    while (j >= 0 && WiFi.RSSI(idx[j]) < keyR) { idx[j + 1] = idx[j]; j--; }
    idx[j + 1] = key;
  }

  String seen[MAX_LIST];
  int sent = 0;
  for (int i = 0; i < count && sent < MAX_LIST; i++) {
    int k = idx[i];
    String ssid = WiFi.SSID(k);
    if (ssid.length() == 0) continue;          // hidden network
    bool dup = false;
    for (int j = 0; j < sent; j++) if (seen[j] == ssid) { dup = true; break; }
    if (dup) continue;                         // same name from another access point
    seen[sent++] = ssid;

    JsonDocument d;
    d["evt"]  = "net";
    d["ssid"] = ssid;
    d["rssi"] = WiFi.RSSI(k);
    d["sec"]  = (WiFi.encryptionType(k) == WIFI_AUTH_OPEN) ? 0 : 1;
    String out;
    serializeJson(d, out);
    notifyBLE(out);
  }
  WiFi.scanDelete();
  notifyBLE(String("{\"evt\":\"net_done\",\"count\":") + sent + "}");
}

void handleBLECommand(const String& line) {
  Serial.println("[ble] << command received (contents hidden, may hold a password)");
  bleStartTime = millis();

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, line);
  if (err) {
    notifyBLE("{\"evt\":\"error\",\"reason\":\"invalid json\"}");
    return;
  }

  const char* cmd = doc["cmd"] | "";
  if (strcmp(cmd, "scan") == 0) {
    sendNetworkList();
    return;
  }
  if (strcmp(cmd, "wifi") != 0) {
    notifyBLE("{\"evt\":\"error\",\"reason\":\"unknown cmd\"}");
    return;
  }

  pendingSsid     = String((const char*)(doc["ssid"] | ""));
  pendingPass     = String((const char*)(doc["pass"] | ""));
  pendingHost     = String((const char*)(doc["host"] | ""));
  pendingPort     = String((int)(doc["port"] | 1883));
  pendingDeviceId = String((const char*)(doc["id"] | "esp32-01"));

  if (pendingSsid.length() == 0) {
    notifyBLE("{\"evt\":\"wifi\",\"state\":\"failed\",\"reason\":\"empty ssid\"}");
    return;
  }

  if (pendingHost.length() > 0) {
    pendingHost.toCharArray(mqtt_host, sizeof(mqtt_host));
    pendingPort.toCharArray(mqtt_port, sizeof(mqtt_port));
    pendingDeviceId.toCharArray(device_id, sizeof(device_id));
    saveSettings();
    // PubSubClient keeps the old port until told again, so re-apply the server
    if (mqtt.connected()) mqtt.disconnect();
    mqtt.setServer(mqtt_host, atoi(mqtt_port));
  }

  notifyBLE("{\"evt\":\"wifi\",\"state\":\"connecting\"}");
  Serial.print("[ble] starting WiFi: "); Serial.println(pendingSsid);

  dropNoted = false; dropPending = false;   // changing network on purpose is not a drop
  WiFi.disconnect();
  delay(100);
  WiFi.begin(pendingSsid.c_str(), pendingPass.c_str());
  wifiConnectStart = millis();
  provState = PROV_WIFI_CONNECTING;
}

// Called on the Bluetooth task: only stash the text, the main loop does the work
void onBleWrite(BLECharacteristic& c, const BLEConnInfo& conn) {
  size_t len = 0;
  const uint8_t* d = c.getValue(&len);
  if (!d || !len) return;
  if (xSemaphoreTake(bleMutex, portMAX_DELAY) == pdTRUE) {
    for (size_t i = 0; i < len; i++) bleRxBuf += (char)d[i];
    xSemaphoreGive(bleMutex);
  }
}

void processBleInbox() {
  String line;
  if (xSemaphoreTake(bleMutex, 0) != pdTRUE) return;
  int idx = bleRxBuf.indexOf('\n');
  if (idx >= 0) {
    line = bleRxBuf.substring(0, idx);
    bleRxBuf = bleRxBuf.substring(idx + 1);
  }
  xSemaphoreGive(bleMutex);
  line.trim();
  if (line.length() > 0) handleBLECommand(line);
}

void startBLEServer() {
  if (bleStarted) return;
  bleMutex = xSemaphoreCreateMutex();

  uint64_t chip = ESP.getEfuseMac();
  snprintf(bleNameStr, sizeof(bleNameStr), BLE_DEVICE_PREFIX "-%02X%02X",
           (uint8_t)(chip >> 32), (uint8_t)(chip >> 40));
  Serial.print("[ble] starting, name="); Serial.println(bleNameStr);

  BTStatus st = BLE.begin(bleNameStr);
  if (!st) { Serial.printf("[ble] begin FAILED: %s\n", st.toString()); return; }

  bleServer = BLE.createServer();
  bleServer.onConnect([](BLEServer& s, const BLEConnInfo& c) {
    bleClientConnected = true;
    Serial.println("[ble] client connected");
  });
  bleServer.onDisconnect([](BLEServer& s, const BLEConnInfo& c, uint8_t reason) {
    bleClientConnected = false;
    Serial.println("[ble] client disconnected");
    BLE.startAdvertising();
  });

  BLEService svc = bleServer.createService(SVC_UUID);
  bleChr = svc.createCharacteristic(
      CHR_UUID,
      BLEProperty::Read | BLEProperty::Write | BLEProperty::WriteNR | BLEProperty::Notify,
      BLEPermission::ReadWriteOpen);
  if (!bleChr) { Serial.println("[ble] characteristic FAILED"); return; }
  bleChr.onWrite(onBleWrite);

  st = bleServer.start();
  if (!st) { Serial.printf("[ble] server FAILED: %s\n", st.toString()); return; }

  BLEAdvertising adv = BLE.getAdvertising();
  adv.addServiceUUID(SVC_UUID);
  adv.setName(bleNameStr);
  adv.setScanResponse(true);
  st = adv.start();
  if (!st) { Serial.printf("[ble] advertising FAILED: %s\n", st.toString()); return; }

  bleStarted   = true;
  bleStartTime = millis();
  Serial.println("[ble] advertising");
}

void stopBLE() {
  if (!bleStarted) return;
  Serial.println("[ble] stopping");
  BLE.stopAdvertising();
  bleStarted = false;
}

// ============================================================
//  Serial commands
// ============================================================
void handleSerial() {
  if (!Serial.available()) return;
  char c = Serial.read();
  switch (c) {
    case 'r': case 'R': wipeAll(); break;
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
  Serial.println("=== WiFiDoctor Firmware (core BLE) ===");
  Serial.println("Serial: r=wipe  s=settings  m=mqtt  c=reconnect");

  loadSettings();
  loadMonitor();
  WiFi.onEvent(onWifiEvent);

  // Start BLE before WiFi to avoid BT controller init state conflicts
  startBLEServer();

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.setSleep(false);

  Serial.println("[wifi] attempting saved connection...");
  WiFi.begin();
  wifiConnectStart = millis();
  provState = PROV_WIFI_CONNECTING;

  mqtt.setServer(mqtt_host, atoi(mqtt_port));
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(4096);
  mqtt.setKeepAlive(30);
}

// ============================================================
//  Loop
// ============================================================
void loop() {
  handleSerial();
  processBleInbox();

  if (provState == PROV_WIFI_CONNECTING) {
    if (WiFi.status() == WL_CONNECTED) {
      Serial.print("[wifi] connected, IP="); Serial.println(WiFi.localIP());
      notifyBLE("{\"evt\":\"wifi\",\"state\":\"connected\",\"ip\":\"" + WiFi.localIP().toString() + "\"}");
      provState = PROV_DONE;
      if (mqttConnect()) notifyBLE("{\"evt\":\"mqtt\",\"state\":\"connected\"}");
      else               notifyBLE("{\"evt\":\"mqtt\",\"state\":\"failed\"}");
    } else if (millis() - wifiConnectStart > WIFI_TIMEOUT_MS) {
      Serial.println("[wifi] timeout — waiting for BLE credentials");
      notifyBLE("{\"evt\":\"wifi\",\"state\":\"failed\",\"reason\":\"timeout\"}");
      provState = PROV_BLE;
      bleStartTime = millis();
    }
  }

  if (provState == PROV_BLE && millis() - bleStartTime > BLE_TIMEOUT_MS) {
    Serial.println("[ble] no command in 5 min, falling back to AP portal");
    stopBLE();

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

    if (wm.autoConnect("WiFiDoctor-Setup")) {
      provState = PROV_DONE;
      mqttConnect();
    } else {
      Serial.println("[wifi] portal timed out, rebooting");
      delay(2000);
      ESP.restart();
    }
  }

  if (pendingScan && provState == PROV_DONE) {
    executeScan();
  }

  monitorTick();

  if (mqtt.connected()) {
    mqtt.loop();
  } else if (provState == PROV_DONE && WiFi.status() == WL_CONNECTED) {
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