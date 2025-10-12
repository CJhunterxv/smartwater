// --- Theme colors ---
const rootStyles = getComputedStyle(document.documentElement);
const textMutedColor = rootStyles.getPropertyValue('--text-muted').trim();
const textLightColor = rootStyles.getPropertyValue('--text-light').trim();
const accentColor = rootStyles.getPropertyValue('--accent').trim();
const lightGreenColor = rootStyles.getPropertyValue('--light-green').trim();
const accentRgb = rootStyles.getPropertyValue('--accent-rgb').trim();
const lightGreenRgb = rootStyles.getPropertyValue('--light-green-rgb').trim();
const gridColor = 'rgba(255, 255, 255, 0.1)';

// --- Chart.js global config + init ---
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
        backgroundColor: `rgba(${accentRgb}, 0.15)`,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        yAxisID: 'yDistance'
      },
      {
        label: 'Water Detected',
        data: [],
        borderColor: lightGreenColor,
        backgroundColor: `rgba(${lightGreenRgb}, 0.15)`,
        fill: true,
        stepped: true,
        pointRadius: 0,
        yAxisID: 'yWater'
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,   // ensures clarity on mobile
    plugins: { legend: { labels: { color: textLightColor } } },
    scales: {
      x: { ticks: { color: textMutedColor }, grid: { display: false } },
      yDistance: { 
        type: 'linear', 
        position: 'left', 
        ticks: { color: accentColor }, 
        grid: { color: gridColor } 
      },
      yWater: {
        type: 'linear',
        position: 'right',
        min: 0,
        max: 1,
        ticks: { stepSize: 1, color: lightGreenColor, callback: v => v === 1 ? 'Yes' : 'No' },
        grid: { drawOnChartArea: false }
      }
    }
  }
});
// --- DOM refs + state ---
const gaugeFg = document.getElementById('gauge-fg');
const gaugeText = document.getElementById('gauge-text');
const eventLog = document.getElementById('event-log');
const gaugeRadius = gaugeFg.r.baseVal.value;
const gaugeCircumference = 2 * Math.PI * gaugeRadius;

let liveDataInterval;
let currentFilter = 'live';
let isSystemOnline = true;
let previousState = {};

// --- Demo historical data ---
const monthlyData = { 
  labels: ['Week 1','Week 2','Week 3','Week 4'], 
  distance:[25,30,22,28], 
  water:[0,0,1,0] 
};
const sixMonthData = { 
  labels: ['May','Jun','Jul','Aug','Sep','Oct'], 
  distance:[35,40,38,42,30,25], 
  water:[0,0,0,0,1,1] 
};

// --- UI helpers ---
function setBadge(el, text, cls) { 
  el.className = 'badge ' + cls; 
  el.textContent = text; 
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
  gaugeFg.style.strokeDashoffset = gaugeCircumference - (percent / 100) * gaugeCircumference;
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

// --- Data History ---
function displayHistoricalData(data) {
  liveChart.data.labels = data.labels;
  liveChart.data.datasets[0].data = data.distance;
  liveChart.data.datasets[1].data = data.water;
  liveChart.update();
}

function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-buttons button').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`btn-${filter}`).classList.add('active');
  clearInterval(liveDataInterval);

  liveChart.data.labels = [];
  liveChart.data.datasets.forEach(dataset => dataset.data = []);
  liveChart.update();

  if (filter === 'live') {
    fetchStatus();
    liveDataInterval = setInterval(fetchStatus, 2000);
  } else if (filter === 'month') {
    displayHistoricalData(monthlyData);
  } else if (filter === '6months') {
    displayHistoricalData(sixMonthData);
  }
}
// --- Fetch status from backend ---
async function fetchStatus(){
  try {
    const res = await fetch('/status');
    if (!res.ok) throw new Error('Network error');
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
    const lastAlertEl = document.getElementById('lastAlertBadge');
    if (lastAlert) { 
      lastAlertEl.textContent = new Date(lastAlert).toLocaleString(); 
      lastAlertEl.className='badge warn'; 
    } else { 
      lastAlertEl.textContent='None'; 
      lastAlertEl.className='badge neutral'; 
    }

    if (currentFilter==='live') {
      const ts = new Date().toLocaleTimeString();
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
    console.error(e);
    if (isSystemOnline) { 
      isSystemOnline=false; 
      addLogEntry('Physical system offline.','bad'); 
    }
    // Silent fail — no popup here
  }
}

// --- Custom Popup Helpers ---
function showPopup(message) {
  document.getElementById("popup-message").textContent = message;
  document.getElementById("popup").style.display = "flex";
}
function closePopup() {
  document.getElementById("popup").style.display = "none";
}
// --- Admin request flow (simplified, no OTP) ---
async function requestAdminAccess() {
  try {
    const res = await fetch("/api/admins/request", {
      method:"POST",
      headers:{ 
        "Content-Type":"application/json", 
        Authorization:`Bearer ${localStorage.getItem("token")}` 
      }
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.message);
    showPopup("Request sent to admin. Wait for approval.");
  } catch(err) {
    showPopup("Error: " + err.message);
  }
}

// --- Logout ---
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  window.location.href="login.html";
}

// --- Weather Fetch ---
async function fetchWeather() {
  const apiKey = "f9fa3ee7c10e8bddd0235f9437dc81c7"; // your OpenWeather key
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

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  addLogEntry('Dashboard Initialized.','good');
  setFilter('live');
  fetchWeather();
  setInterval(fetchWeather, 900000); // refresh every 15 min
});
