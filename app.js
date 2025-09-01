// ------------------ MQTT Setup ------------------
const brokerUrl = "wss://broker.hivemq.com:8884/mqtt";
const clientId = "loki-home-" + Math.random().toString(16).substr(2, 8);
const client = mqtt.connect(brokerUrl, { clientId });

const connStatus = document.getElementById("connStatus");
const brokerLabel = document.getElementById("brokerLabel");

// UI elements
const doorPill = document.getElementById("doorPill");
const rfidResult = document.getElementById("rfidResult");
const passwordInput = document.getElementById("passwordInput");
const passwordSend = document.getElementById("passwordSend");
const passwordResult = document.getElementById("passwordResult");

const logBody = document.getElementById("logBody");
const modeHint = document.getElementById("modeHint");

// Power monitor
const voltageEl = document.getElementById("voltage");
const currentEl = document.getElementById("current");
const powerEl = document.getElementById("power");
const kwhEl = document.getElementById("kwh");
const billEl = document.getElementById("bill");
const tariffInput = document.getElementById("tariff");

let totalKwh = 0;
let usageData = [];
let chart;

// ------------------ MQTT Events ------------------
client.on("connect", () => {
  connStatus.textContent = "Connected";
  connStatus.classList.add("online");
  brokerLabel.textContent = brokerUrl;

  // Subscribe to topics
  client.subscribe("home/door/status");
  client.subscribe("home/rfid/status");
  client.subscribe("home/power/+");
  client.subscribe("home/temp");

  addLog("System", "MQTT Connected");
});

client.on("error", (err) => {
  connStatus.textContent = "Error";
  connStatus.classList.remove("online");
  console.error(err);
});

client.on("message", (topic, payload) => {
  const msg = payload.toString();
  if (topic === "home/door/status") {
    doorPill.textContent = msg;
    doorPill.className = "pill " + (msg === "Locked" ? "locked" : "unlocked");
    addLog("Door", "Status Update", msg);
  }
  if (topic === "home/rfid/status") {
    rfidResult.textContent = msg;
    addLog("RFID", "Access", msg);
  }
  if (topic.startsWith("home/power/")) {
    handlePower(topic.split("/")[2], msg);
  }
  if (topic === "home/temp") {
    document.getElementById("liveTemp").textContent = msg;
  }
});

// ------------------ UI Events ------------------
document.querySelectorAll("[data-pub]").forEach((btn) => {
  btn.addEventListener("click", () => {
    client.publish(btn.dataset.pub, btn.dataset.value);
    addLog("Command", btn.dataset.pub, btn.dataset.value);
  });
});

// Room toggles
document.querySelectorAll("[data-toggle]").forEach((toggle) => {
  toggle.addEventListener("change", () => {
    const state = toggle.checked ? "ON" : "OFF";
    client.publish(toggle.dataset.toggle, state);
    addLog("Room", toggle.dataset.toggle, state);
  });
});

// Password fallback unlock
passwordSend.addEventListener("click", () => {
  const pass = passwordInput.value.trim();
  if (pass === "") {
    passwordResult.textContent = "❌ Password required";
    return;
  }
  // Example hardcoded password — replace with secure check
  if (pass === "1234") {
    client.publish("door/command", "UNLOCK");
    passwordResult.textContent = "✅ Access Granted";
    addLog("Password", "Access", "Correct Password");
  } else {
    passwordResult.textContent = "❌ Wrong Password";
    addLog("Password", "Access", "Failed Attempt");
  }
  passwordInput.value = "";
});

// Modes
const modeColors = {
  day: "#222", // dark gray
  away: "#00bfff", // deep sky blue
  night: "#4b0082", // indigo
  panic: "#ff1744" // red
};
document.querySelectorAll("[data-mode]").forEach((chip) => {
  chip.addEventListener("click", () => {
    const mode = chip.dataset.mode;
    client.publish("home/mode", mode);
    modeHint.textContent = "Current: " + mode.toUpperCase();
    addLog("Mode", "Changed", mode);
    // Color logic
    document.querySelectorAll("[data-mode]").forEach((c) => {
      c.style.background = "#eee";
      c.style.color = "#222";
    });
    chip.style.background = modeColors[mode] || "#eee";
    chip.style.color = "#fff";
  });
});

// Schedule save
document.getElementById("saveSchedule").addEventListener("click", () => {
  const time = document.getElementById("modeStart").value;
  const temp = document.getElementById("autoOffTemp").value;
  client.publish("home/schedule", JSON.stringify({ time, temp }));
  addLog("Schedule", "Saved", `Time: ${time}, Temp: ${temp}`);
});

// ------------------ Logs ------------------
function addLog(type, event, detail = "") {
  const tr = document.createElement("tr");
  const now = new Date().toLocaleTimeString();
  tr.innerHTML = `<td>${now}</td><td>${event}</td><td>${detail}</td>`;
  logBody.prepend(tr);
}

document.getElementById("clearLog").addEventListener("click", () => {
  logBody.innerHTML = "";
});

document.getElementById("exportLog").addEventListener("click", () => {
  let csv = "Time,Event,Detail\n";
  logBody.querySelectorAll("tr").forEach((tr) => {
    csv += Array.from(tr.children).map((td) => td.textContent).join(",") + "\n";
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "logs.csv";
  a.click();
});

// ------------------ Power Monitoring ------------------
function handlePower(metric, value) {
  console.log("Power data received:", metric, value); // Debug log
  if (metric === "voltage") voltageEl.textContent = value;
  if (metric === "current") currentEl.textContent = value;
  if (metric === "power") {
    powerEl.textContent = value;
    const powerW = parseFloat(value);
    if (!isNaN(powerW)) {
      totalKwh += powerW / 1000 / 60; // rough 1-min interval
      kwhEl.textContent = totalKwh.toFixed(3);
      const tariff = parseFloat(tariffInput.value);
      billEl.textContent = (totalKwh * tariff * 30).toFixed(2);
      updateChart(powerW);
      console.log("Graph updated with value:", powerW); // Debug log
    } else {
      console.warn("Received invalid power value:", value);
    }
  }
}

// ------------------ Chart.js ------------------
function initChart() {
  try {
    const ctx = document.getElementById("usageChart");
    if (!ctx) {
      console.error("usageChart canvas not found");
      return;
    }
    // Get accent color from CSS
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || "#0078ff";
    chart = new Chart(ctx.getContext("2d"), {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Power (W)",
            data: [],
            borderColor: accent,
            backgroundColor: accent + "22", // semi-transparent fill
            tension: 0.2,
            pointRadius: 2,
            pointBackgroundColor: accent,
          },
        ],
      },
      options: {
        responsive: true,
        scales: { x: { display: false }, y: { beginAtZero: true } },
        plugins: {
          legend: { display: false }
        }
      },
    });
    if (document.getElementById("chartError")) {
      document.getElementById("chartError").style.display = "none";
    }
  } catch (e) {
    if (document.getElementById("chartError")) {
      document.getElementById("chartError").style.display = "block";
    }
    console.error("Chart.js error:", e);
  }
}

function updateChart(value) {
  if (!chart) return;
  const now = new Date().toLocaleTimeString();
  chart.data.labels.push(now);
  chart.data.datasets[0].data.push(value);
  if (chart.data.labels.length > 20) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update();
}

// ------------------ Weather ------------------
async function updateWeather() {
  try {
    const apiKey = "YOUR_OPENWEATHERMAP_API_KEY"; // Replace with your API key
    const city = "Hyderabad";
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Weather fetch failed");
    const data = await res.json();
    const temp = Math.round(data.main.temp);
    const iconCode = data.weather[0].icon;
    const iconUrl = `https://openweathermap.org/img/wn/${iconCode}.png`;
    document.getElementById("weather").innerHTML = `<img src='${iconUrl}' alt='weather' style='height:1em;vertical-align:middle;'/> ${temp}°C`;
  } catch (e) {
    document.getElementById("weather").innerHTML = `<span id='weatherIcon'>☀️</span> —`;
    console.error("Weather error:", e);
  }
}
setInterval(updateWeather, 60000);

// ------------------ Clock + Init ------------------
function updateClock() {
  const clockEl = document.getElementById("clock");
  if (clockEl) {
    const time = new Date().toLocaleTimeString();
    clockEl.innerHTML = '<span id="clockIcon">🕒</span> ' + time;
  }
}
setInterval(updateClock, 1000);

window.onload = () => {
  initChart();
  updateClock();
  updateWeather();
  // Debug info
  console.log("Dashboard loaded. If you see errors above, check API key and MQTT connection.");
};
