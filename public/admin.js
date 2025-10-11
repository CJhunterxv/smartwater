const API_BASE = ""; // leave empty if backend is same origin
const token = localStorage.getItem("token");

// --- Chart.js setup ---
const rootStyles = getComputedStyle(document.documentElement);
const textMutedColor = rootStyles.getPropertyValue('--text-muted').trim();
const textLightColor = rootStyles.getPropertyValue('--text-light').trim();
const accentColor = rootStyles.getPropertyValue('--accent').trim();
const lightGreenColor = rootStyles.getPropertyValue('--light-green').trim();
const accentRgb = rootStyles.getPropertyValue('--accent-rgb').trim();
const lightGreenRgb = rootStyles.getPropertyValue('--light-green-rgb').trim();
const gridColor = 'rgba(255, 255, 255, 0.1)';

Chart.defaults.color = textMutedColor;
Chart.defaults.borderColor = gridColor;

const liveChart = new Chart(document.getElementById('liveChart'), {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      { 
        label: 'Distance (cm)', 
        data: [], 
        borderColor: accentColor, 
        backgroundColor: `rgba(${accentRgb},0.15)`, 
        fill: true, 
        tension: 0.4, 
        pointRadius: 0, 
        yAxisID: 'yDistance' 
      },
      { 
        label: 'Water Detected', 
        data: [], 
        borderColor: lightGreenColor, 
        backgroundColor: `rgba(${lightGreenRgb},0.15)`, 
        fill: true, 
        stepped: true, 
        pointRadius: 0, 
        yAxisID: 'yWater' 
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,   // important for mobile
    plugins: { legend: { labels: { color: textLightColor } } },
    scales: {
      x: { ticks: { color: textMutedColor }, grid: { display: false } },
      yDistance: { type: 'linear', position: 'left', ticks: { color: accentColor }, grid: { color: gridColor } },
      yWater: { 
        type: 'linear', 
        position: 'right', 
        min: 0, 
        max: 1, 
        ticks: { stepSize: 1, color: lightGreenColor, callback: v => v===1?'Yes':'No' }, 
        grid: { drawOnChartArea: false } 
      }
    }
  }
});

// --- DOM references ---
const gaugeFg = document.getElementById('gauge-fg');
const gaugeText = document.getElementById('gauge-text');
const eventLog = document.getElementById('event-log');
const gaugeRadius = gaugeFg.r.baseVal.value;
const gaugeCircumference = 2 * Math.PI * gaugeRadius;

// --- state ---
let liveDataInterval;
let currentFilter = 'live';
let isSystemOnline = true;
let previousState = {};
// --- helpers ---
function setBadge(el, text, cls) { 
  el.className = 'badge ' + cls; 
  el.textContent = text; 
}

function setSwitch(el, on) { 
  el.classList.toggle('on', on); 
}

function addLogEntry(message, type='neutral') {
  const logEntry = document.createElement('div');
  logEntry.innerHTML = `<span class="time">[${new Date().toLocaleTimeString()}]</span> 
                        <span class="event-${type}">${message}</span>`;
  eventLog.prepend(logEntry);
  if (eventLog.children.length > 20) eventLog.removeChild(eventLog.lastChild);
}

function updateGauge(distance) {
  const MAX_DISTANCE = 50;
  let percent = 100 - (Math.min(distance, MAX_DISTANCE) / MAX_DISTANCE * 100);
  percent = Math.max(0, Math.min(100, percent));
  gaugeFg.style.strokeDashoffset = gaugeCircumference - (percent/100)*gaugeCircumference;
  gaugeText.innerHTML = `${distance || 0}<small>cm</small>`;

  if (distance <= 5) { 
    gaugeFg.style.stroke='var(--bad)'; 
    gaugeText.style.color='var(--bad)'; 
  }
  else if (distance <= 15) { 
    gaugeFg.style.stroke='var(--warn)'; 
    gaugeText.style.color='var(--warn)'; 
  }
  else { 
    gaugeFg.style.stroke='var(--good)'; 
    gaugeText.style.color='var(--text-light)'; 
  }
}

// --- filter controls ---
function displayHistoricalData(data) {
  liveChart.data.labels = data.labels;
  liveChart.data.datasets[0].data = data.distance;
  liveChart.data.datasets[1].data = data.water;
  liveChart.update();
}

function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-buttons button')
    .forEach(btn => btn.classList.remove('active'));
  document.getElementById(`btn-${filter}`).classList.add('active');
  clearInterval(liveDataInterval);

  liveChart.data.labels = [];
  liveChart.data.datasets.forEach(dataset => dataset.data = []);
  liveChart.update();

  if (filter === 'live') {
    fetchStatus();
    liveDataInterval = setInterval(fetchStatus, 2000);
  } else if (filter === 'month') {
    displayHistoricalData({ 
      labels: ['Week 1','W2','W3','W4'], 
      distance:[25,30,22,28], 
      water:[0,0,1,0] 
    });
  } else if (filter === '6months') {
    displayHistoricalData({ 
      labels: ['May','Jun','Jul','Aug','Sep','Oct'], 
      distance:[35,40,38,42,30,25], 
      water:[0,0,0,0,1,1] 
    });
  }
}
// --- fetch status ---
async function fetchStatus() {
  try {
    const res = await fetch('/status');
    const payload = await res.json();
    if (!payload.ok) throw new Error(payload.message || 'API error');

    if (!isSystemOnline) { 
      isSystemOnline = true; 
      addLogEntry('Physical system connected.','good'); 
    }

    const { waterDetected, pumpState, buzzerState, distanceCM, manualOverride, lastUpdate, lastAlert } = payload.data;
    if (previousState.waterDetected !== waterDetected) {
      addLogEntry(`Water detection: ${waterDetected?'Yes':'No'}`, waterDetected?'bad':'good');
    }
    previousState = { waterDetected };

    setBadge(document.getElementById('waterBadge'), waterDetected?'Yes':'No', waterDetected?'bad':'good');
    setBadge(document.getElementById('pumpBadge'), pumpState?'On':'Off', pumpState?'good':'neutral');
    setBadge(document.getElementById('buzzerBadge'), buzzerState?'On':'Off', buzzerState?'warn':'neutral');
    setBadge(document.getElementById('modeBadge'), manualOverride?'Manual':'Auto', manualOverride?'warn':'good');
    updateGauge(distanceCM);

    document.getElementById('lastUpdate').textContent = "Last update: "+new Date(lastUpdate).toLocaleString();
    const lastAlertEl=document.getElementById('lastAlertBadge');
    if (lastAlert) { 
      lastAlertEl.textContent=new Date(lastAlert).toLocaleString(); 
      lastAlertEl.className='badge warn'; 
    } else { 
      lastAlertEl.textContent='None'; 
      lastAlertEl.className='badge neutral'; 
    }

    setSwitch(document.getElementById('pumpSwitch'), pumpState);
    setSwitch(document.getElementById('buzzerSwitch'), buzzerState);

    if (currentFilter==='live') {
      const ts=new Date().toLocaleTimeString();
      liveChart.data.labels.push(ts);
      liveChart.data.datasets[0].data.push(distanceCM||0);
      liveChart.data.datasets[1].data.push(waterDetected?1:0);
      if (liveChart.data.labels.length>30) {
        liveChart.data.labels.shift();
        liveChart.data.datasets[0].data.shift();
        liveChart.data.datasets[1].data.shift();
      }
      liveChart.update('none');
    }
  } catch(e) {
    console.error("Status fetch failed:", e);
    if (isSystemOnline) { 
      isSystemOnline=false; 
      addLogEntry('Physical system offline.','bad'); 
    }
  }
}

// --- controls ---
function instantToggle(el) { 
  setSwitch(el, !el.classList.contains('on')); 
}

async function togglePump(el) {
  const next = el.classList.contains('on');
  addLogEntry(`Pump manually set to ${next ? 'ON' : 'OFF'}.`, next ? 'good' : 'neutral');
  try {
    await fetch('/control/pump', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ on: next }) 
    });
  } catch (e) {
    console.error(e); 
    setSwitch(el, !next); 
    addLogEntry('Pump control failed!', 'bad');
  } finally { 
    setTimeout(fetchStatus, 200); 
  }
}

async function toggleBuzzer(el) {
  const next = el.classList.contains('on');
  addLogEntry(`Buzzer manually set to ${next ? 'ON' : 'OFF'}.`, next ? 'warn' : 'neutral');
  try {
    await fetch('/control/buzzer', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ on: next }) 
    });
  } catch (e) {
    console.error(e); 
    setSwitch(el, !next); 
    addLogEntry('Buzzer control failed!', 'bad');
  } finally { 
    setTimeout(fetchStatus, 200); 
  }
}
// --- common actions ---
function downloadLogs() { 
  window.location.href = '/download-logs'; 
}

function logout() { 
  localStorage.removeItem('token'); 
  localStorage.removeItem('role'); 
  window.location.href = "login.html"; 
}

// --- access guard + init ---
document.addEventListener("DOMContentLoaded", () => {
  const role = localStorage.getItem("role");
  if (role !== "admin") {
    // Silent redirect — no popup here
    window.location.href = "dashboard.html";
    return;
  }
  addLogEntry('Admin Dashboard Initialized.', 'good');
  setFilter('live');
  fetchUsers();
  fetchRequests();
  fetchWeather();
  setInterval(fetchWeather, 900000); // refresh weather every 15 min
});

// --- Admin User Management ---
async function fetchUsers() {
  try {
    const res = await fetch(`${API_BASE}/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || "Failed to fetch users");
    renderUsers(data.users);
  } catch (err) {
    console.error("Fetch users failed:", err.message);
  }
}

function renderUsers(users) {
  const tbody = document.querySelector("#usersTable tbody");
  tbody.innerHTML = "";
  users.forEach(user => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${user.email}</td>
      <td>${user.name || "-"}</td>
      <td>${user.role}</td>
      <td>${user.pendingAdmin ? "Yes" : "No"}</td>
      <td class="actions">
        ${user.role === "admin"
          ? `<button class="action" onclick="removeAdmin('${user._id}')">Remove Admin</button>`
          : `<button class="action" onclick="directPromote('${user._id}')">Promote Directly</button>`}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// --- Pending Requests ---
async function fetchRequests() {
  try {
    const res = await fetch(`${API_BASE}/api/admins/requests`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.message);
    renderRequests(data.requests);
  } catch (err) {
    console.error("Fetch requests failed:", err.message);
  }
}

function renderRequests(requests) {
  const tbody = document.querySelector("#requestsTable tbody");
  tbody.innerHTML = "";
  requests.forEach(user => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${user.email}</td>
      <td>${user.name || "-"}</td>
      <td><button class="action" onclick="directPromote('${user._id}')">Promote Directly</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// --- Direct Promote (no OTP) ---
async function directPromote(userId) {
  try {
    const res = await fetch(`${API_BASE}/api/admins/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.message);
    showPopup("User promoted directly to admin");
    fetchUsers();
    fetchRequests();
  } catch (err) {
    console.error(err);
    showPopup("Error promoting user: " + err.message);
  }
}

// --- Remove Admin ---
async function removeAdmin(userId) {
  try {
    const res = await fetch(`${API_BASE}/api/admins/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.message);
    showPopup("Admin rights removed");
    fetchUsers();
    fetchRequests();
  } catch (err) {
    console.error(err);
    showPopup("Error removing admin: " + err.message);
  }
}

// --- Custom Popup Helpers ---
function showPopup(message) {
  const el = document.getElementById("popup");
  const msg = document.getElementById("popup-message");
  if (!el || !msg) { console.warn("Popup elements not found"); return; }
  msg.textContent = message;
  el.style.display = "flex";
}
function closePopup() {
  const el = document.getElementById("popup");
  if (!el) return;
  el.style.display = "none";
}

// --- Weather Fetch ---
async function fetchWeather() {
  const apiKey = "f9fa3ee7c10e8bddd0235f9437dc81c7";
  const lat = -29.8587;
  const lon = 31.0218;
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    document.getElementById("weatherBox").innerHTML = `
      <div class="status-item"><span>🌡 Temp</span><span>${data.main.temp} °C</span></div>
      <div class="status-item"><span>💧 Humidity</span><span>${data.main.humidity}%</span></div>
      <div class="status-item"><span>🌬 Wind</span><span>${data.wind.speed} m/s</span></div>
      <div class="status-item"><span>☁ Condition</span><span>${data.weather[0].description}</span></div>
    `;
  } catch (err) {
    console.error("Weather fetch failed", err);
    document.getElementById("weatherBox").textContent = "Weather unavailable";
  }
}
