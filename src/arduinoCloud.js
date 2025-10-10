import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const {
  ARDUINO_CLIENT_ID,
  ARDUINO_CLIENT_SECRET,
  ARDUINO_THING_ID,          // 👈 Thing ID from your Thing metadata page
  ARDUINO_PUMP_VAR_ID,       // 👈 Property ID for Pump
  ARDUINO_BUZZER_VAR_ID,     // 👈 Property ID for Buzzer
  ARDUINO_WATER_VAR_ID,      // 👈 Property ID for Water Detected
  ARDUINO_DISTANCE_VAR_ID,   // 👈 Property ID for DistanceCM
} = process.env;

let accessToken = null;
let tokenExpiry = 0;

// === Helper: Get OAuth token ===
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (accessToken && now < tokenExpiry - 60) return accessToken;

  const res = await axios.post(
    "https://api2.arduino.cc/iot/v1/clients/token",
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: ARDUINO_CLIENT_ID,
      client_secret: ARDUINO_CLIENT_SECRET,
      audience: "https://api2.arduino.cc/iot",
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  accessToken = res.data.access_token;
  tokenExpiry = now + res.data.expires_in;
  return accessToken;
}

// === Fetch latest values from Arduino Cloud ===
export async function getLatestValues() {
  const token = await getAccessToken();

  const res = await axios.get(
    `https://api2.arduino.cc/iot/v2/things/${ARDUINO_THING_ID}/properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const vars = {};
  for (const v of res.data) {
    vars[v.id] = v.last_value;
  }

  return {
    waterDetected: vars[ARDUINO_WATER_VAR_ID],
    distanceCM: vars[ARDUINO_DISTANCE_VAR_ID],   // ✅ renamed key
    pumpState: vars[ARDUINO_PUMP_VAR_ID],
    buzzerState: vars[ARDUINO_BUZZER_VAR_ID],
  };
}

// === Update a variable in Arduino Cloud ===
export async function setVariable(varId, value) {
  const token = await getAccessToken();

  const res = await axios.put(
    `https://api2.arduino.cc/iot/v2/things/${ARDUINO_THING_ID}/properties/${varId}/publish`,
    { value },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return res.data;
}
