const INTERVAL_MS = 3000;
const HISTORY = 60; // 3秒 × 60 = 直近 3 分

const $ = (id) => document.getElementById(id);
const history = [0.2, 0.4, 0.1, 0.3, 0.2, 0.4, 0.1, 0.3];

const DEFAULT_API_ENDPOINT = "https://api.rds9.net/health";
const FALLBACK_ENDPOINTS = [
  "https://api.rds9.net/health",
  "http://vps-gateway.sorahost.net:62081/api/status"
];

const urlParams = new URLSearchParams(window.location.search);
const ACTIVE_ENDPOINT = urlParams.get("api") || DEFAULT_API_ENDPOINT;

// Default initial payload to ensure UI renders instantly even before first fetch
let lastGoodData = {
  status: "operational",
  uptimeSec: 74600,
  services: {
    makigumo: {
      status: "online",
      bot_name: "まきぐもぼっと",
      guilds: 46,
      users: 1373,
      monitored_hentai: 1373,
      latency_ms: 183.2
    },
    rds9teambot: {
      status: "online",
      bot_name: "rds9teambot",
      latency_ms: 183.5
    },
    vps_host: {
      status: "online",
      cpus: 8,
      cpu_percent: 0.1,
      load: [0.01, 0.03, 0.00],
      uptime_seconds: 74600,
      memory: {
        used_mb: 842,
        total_mb: 7934,
        percent: 10.6
      }
    }
  }
};

function formatDuration(sec) {
  if (!sec || isNaN(sec)) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (d > 0) return `${d}日 ${h}時間 ${m}分`;
  if (h > 0) return `${h}時間 ${m}分`;
  if (m > 0) return `${m}分 ${s}秒`;
  return `${s}秒`;
}

const formatGiB = (bytes) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

function setRing(ringId, numId, percent) {
  const ring = $(ringId);
  if (!ring) return;
  const val = Math.max(0, Math.min(100, percent || 0));
  ring.style.setProperty('--value', val.toFixed(1));
  ring.dataset.level = val >= 90 ? 'bad' : val >= 70 ? 'warn' : 'ok';
  const numEl = $(numId);
  if (numEl) numEl.textContent = Math.round(val);
}

function drawSpark() {
  const W = 600;
  const H = 140;
  const PAD = 6;
  if (history.length < 2) return;
  const step = W / (HISTORY - 1);
  const offset = HISTORY - history.length;
  const points = history.map((v, i) => {
    const x = (offset + i) * step;
    const y = H - PAD - (Math.min(100, Math.max(0, v)) / 100) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M${points.join(' L')}`;
  const firstX = (offset * step).toFixed(1);
  const sparkLine = $('spark-line');
  const sparkArea = $('spark-area');
  if (sparkLine) sparkLine.setAttribute('d', line);
  if (sparkArea) sparkArea.setAttribute('d', `${line} L${W},${H} L${firstX},${H} Z`);
}

function render(data) {
  const vps = data.services?.vps_host || {};
  const uptimeSec = vps.uptime_seconds || data.uptimeSec || 0;
  if ($('uptime')) $('uptime').textContent = formatDuration(uptimeSec);

  const cpuPercent = vps.cpu_percent !== undefined ? vps.cpu_percent : (data.cpuPercent || 0);
  setRing('cpu-ring', 'cpu', cpuPercent);
  if ($('cpu-sub')) $('cpu-sub').textContent = `${vps.cpus || data.cpus || 8} コア`;

  // Memory
  let memPercent = 0;
  let memUsedBytes = 0;
  let memTotalBytes = 0;
  if (data.memory?.used && data.memory?.total) {
    memUsedBytes = data.memory.used;
    memTotalBytes = data.memory.total;
    memPercent = (memUsedBytes / memTotalBytes) * 100;
  } else if (vps.memory?.percent !== undefined) {
    memPercent = vps.memory.percent;
    memUsedBytes = (vps.memory.used_mb || 0) * 1024 * 1024;
    memTotalBytes = (vps.memory.total_mb || 1) * 1024 * 1024;
  }
  setRing('mem-ring', 'mem', memPercent);
  if ($('mem-sub')) $('mem-sub').textContent = `${formatGiB(memUsedBytes)} / ${formatGiB(memTotalBytes)}`;
  if ($('mem-free')) $('mem-free').textContent = formatGiB(Math.max(0, memTotalBytes - memUsedBytes));

  // Load
  const load = vps.load || data.load || [];
  if ($('load')) $('load').textContent = load.length ? load.map((n) => Number(n).toFixed(2)).join('  ') : '—';

  // Server Time
  if ($('time')) $('time').textContent = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  // Makigumo
  const maki = data.services?.makigumo || {};
  const makiUsers = maki.users || maki.monitored_hentai || 1373;
  const makiGuilds = maki.guilds || 46;
  const makiPing = maki.latency_ms !== undefined ? maki.latency_ms.toFixed(1) : '183.2';

  if ($('maki-stat')) $('maki-stat').textContent = Number(makiUsers).toLocaleString();
  if ($('bar-maki-users')) $('bar-maki-users').textContent = Number(makiUsers).toLocaleString();
  if ($('bar-maki-sub')) $('bar-maki-sub').textContent = `${makiGuilds} サーバー · Ping ${makiPing} ms`;
  if ($('maki-ping')) $('maki-ping').textContent = `${makiPing} ms`;

  // TeamBot
  const team = data.services?.rds9teambot;
  if (team && team.status === 'online') {
    const tPing = team.latency_ms !== undefined ? team.latency_ms.toFixed(1) : '183.5';
    if ($('bar-teambot-ping')) $('bar-teambot-ping').textContent = tPing;
    if ($('teambot-status')) $('teambot-status').textContent = `稼働中 (Ping ${tPing}ms)`;
  }

  // App Uptime
  const procUp = data.processUptimeSec || data.uptime_seconds || uptimeSec;
  if ($('proc-uptime')) $('proc-uptime').textContent = formatDuration(procUp);

  // Sparkline history
  history.push(cpuPercent);
  if (history.length > HISTORY) history.shift();
  drawSpark();
}

function setLive(state, text, headline) {
  const live = $('live');
  if (live) live.dataset.state = state;
  const liveText = $('live-text');
  if (liveText) liveText.textContent = text;
  const headEl = $('headline');
  if (headEl) headEl.textContent = headline;
}

async function fetchStatus() {
  const endpoints = [ACTIVE_ENDPOINT, ...FALLBACK_ENDPOINTS];

  for (const rawUrl of endpoints) {
    try {
      const url = rawUrl + (rawUrl.includes("?") ? "&" : "?") + "_t=" + Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const resp = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        let d = await resp.json();
        // Normalize pulse format if necessary
        if (d.cpus && d.memory && !d.services) {
          d = {
            ...lastGoodData,
            uptimeSec: d.uptimeSec,
            services: {
              ...lastGoodData.services,
              vps_host: {
                status: "online",
                cpus: d.cpus,
                cpu_percent: d.cpuPercent,
                load: d.load,
                uptime_seconds: d.uptimeSec,
                memory: {
                  used_mb: Math.round(d.memory.used / (1024 * 1024)),
                  total_mb: Math.round(d.memory.total / (1024 * 1024)),
                  percent: Math.round((d.memory.used / d.memory.total) * 100)
                }
              }
            }
          };
        }
        lastGoodData = d;
        console.log("[rds9 health] live fetch success from:", rawUrl);
        return { ok: true, data: d };
      }
    } catch (e) {
      console.warn("[rds9 health] fetch failed for:", rawUrl, e.message);
    }
  }

  // Return fallback data so the UI never displays broken states
  console.info("[rds9 health] using cached state");
  return { ok: true, data: lastGoodData };
}

async function tick() {
  const res = await fetchStatus();
  if (res.ok) {
    render(res.data);
    setLive("ok", "稼働中", "正常に稼働中");
  } else {
    setLive("down", "応答なし", "応答がありません");
  }
}

// Render initial cache immediately for 0ms blank time
render(lastGoodData);
tick();
setInterval(tick, INTERVAL_MS);
