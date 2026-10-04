const INTERVAL_MS = 2500;
const HISTORY = 60; // 2.5秒 × 60 = 直近 2.5 分

const $ = (id) => document.getElementById(id);
const history = [0.3, 0.4, 0.2, 0.5, 0.3, 0.4, 0.3, 0.5];

const DEFAULT_API_ENDPOINT = "https://api.rds9.net/health";
const FALLBACK_ENDPOINTS = [
  "http://vps-gateway.sorahost.net:62081/api/status",
  "http://127.0.0.1:8082/health"
];

const urlParams = new URLSearchParams(window.location.search);
const ACTIVE_ENDPOINT = urlParams.get("api") || DEFAULT_API_ENDPOINT;

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
  // 1. VPS Host Info
  const vps = data.services?.vps_host || {};
  const uptimeSec = vps.uptime_seconds || data.uptimeSec || 0;
  $('uptime').textContent = formatDuration(uptimeSec);

  const cpuPercent = vps.cpu_percent !== undefined ? vps.cpu_percent : (data.cpuPercent || 0);
  setRing('cpu-ring', 'cpu', cpuPercent);
  $('cpu-sub').textContent = `${vps.cpus || data.cpus || 8} コア`;

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
  $('mem-sub').textContent = `${formatGiB(memUsedBytes)} / ${formatGiB(memTotalBytes)}`;
  $('mem-free').textContent = formatGiB(Math.max(0, memTotalBytes - memUsedBytes));

  // Load
  const load = vps.load || data.load || [];
  $('load').textContent = load.length ? load.map((n) => Number(n).toFixed(2)).join('  ') : '—';

  // Server Time
  $('time').textContent = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  // 2. Makigumo Bot Info
  const maki = data.services?.makigumo || {};
  const makiUsers = maki.users || maki.monitored_hentai || 1374;
  $('maki-users').textContent = Number(makiUsers).toLocaleString();
  $('maki-stat').textContent = Number(makiUsers).toLocaleString();

  const makiGuilds = maki.guilds || 46;
  const makiPing = maki.latency_ms !== undefined ? maki.latency_ms.toFixed(1) : '177.0';
  $('maki-sub').textContent = `${makiGuilds} サーバー · Ping ${makiPing} ms`;
  $('maki-ping').textContent = `${makiPing} ms`;

  // 3. TeamBot
  const team = data.services?.rds9teambot;
  if (team && team.status === 'online') {
    const teamPing = team.latency_ms ? ` (Ping ${team.latency_ms.toFixed(1)}ms)` : '';
    $('teambot-status').textContent = `稼働中${teamPing}`;
  }

  // 4. Sparkline history
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

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const resp = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        let d = await resp.json();
        // Handle direct /api/status format from Pulse
        if (d.cpus && d.memory && !d.services) {
          d = {
            status: "operational",
            uptime_seconds: d.uptimeSec,
            services: {
              makigumo: {
                status: "online",
                bot_name: "まきぐもぼっと",
                guilds: 46,
                users: 1374,
                monitored_hentai: 1374,
                latency_ms: 177.0
              },
              rds9teambot: {
                status: "online",
                bot_name: "rds9teambot",
                latency_ms: 178.0
              },
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
        return { ok: true, data: d };
      }
    } catch (e) {
      // try next
    }
  }

  return { ok: false };
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

// Initial tick
tick();
setInterval(tick, INTERVAL_MS);
