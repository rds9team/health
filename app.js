const INTERVAL_MS = 3000;
const HISTORY = 60; // 3秒 × 60 = 直近 3 分

const $ = (id) => document.getElementById(id);
const history = [0.2, 0.4, 0.1, 0.3, 0.2, 0.4, 0.1, 0.3];

const isHttps = window.location.protocol === "https:";

// サーバーAPI (Pulse原本準拠)
const SERVER_ENDPOINTS = isHttps
  ? [
      "https://api.rds9.net/api/status",
      "http://vps-gateway.sorahost.net:62081/api/status"
    ]
  : [
      "http://vps-gateway.sorahost.net:62081/api/status",
      "https://api.rds9.net/api/status"
    ];

// まきぐもbot API
const MAKI_ENDPOINTS = isHttps
  ? [
      "https://api.rds9.net/makigumo/stats",
      "http://vps-gateway.sorahost.net:62081/makigumo/stats"
    ]
  : [
      "http://vps-gateway.sorahost.net:62081/makigumo/stats",
      "https://api.rds9.net/makigumo/stats"
    ];

// 初期キャッシュデータ (描画チラつき防止)
let serverData = {
  cpus: 8,
  cpuPercent: 0.1,
  load: [0.04, 0.02, 0.00],
  memory: {
    total: 8320073728,
    used: 883908608
  },
  uptimeSec: 75500,
  processUptimeSec: 74900,
  time: new Date().toISOString()
};

let makiData = {
  status: "online",
  guilds: 46,
  users: 1373,
  ping: 182.9
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

function renderServer(d) {
  if (!d) return;

  // ヒーロー
  if ($('uptime')) $('uptime').textContent = formatDuration(d.uptimeSec);

  // CPU
  const cpuPercent = d.cpuPercent !== undefined ? d.cpuPercent : 0;
  setRing('cpu-ring', 'cpu', cpuPercent);
  if ($('cpu-sub')) $('cpu-sub').textContent = `${d.cpus || 8} コア`;

  // メモリ
  const total = d.memory?.total || 1;
  const used = d.memory?.used || 0;
  const memPercent = (used / total) * 100;
  setRing('mem-ring', 'mem', memPercent);
  if ($('mem-sub')) $('mem-sub').textContent = `${formatGiB(used)} / ${formatGiB(total)}`;

  // くわしく (Pulse原本の4項目)
  const load = d.load || [];
  if ($('load')) $('load').textContent = load.length ? load.map((n) => Number(n).toFixed(2)).join('  ') : '—';
  if ($('mem-free')) $('mem-free').textContent = formatGiB(Math.max(0, total - used));
  if ($('proc-uptime')) $('proc-uptime').textContent = formatDuration(d.processUptimeSec || d.uptimeSec);
  if ($('time')) $('time').textContent = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  // CPU 推移
  history.push(cpuPercent);
  if (history.length > HISTORY) history.shift();
  drawSpark();
}

function renderMaki(m) {
  if (!m) return;
  const users = m.users || 1373;
  const guilds = m.guilds || 46;
  const ping = m.ping !== undefined ? Number(m.ping).toFixed(1) : '182.9';

  if ($('maki-users')) $('maki-users').textContent = Number(users).toLocaleString();
  if ($('maki-guilds')) $('maki-guilds').textContent = Number(guilds).toLocaleString();
  if ($('maki-ping')) $('maki-ping').textContent = ping;

  if ($('bar-users')) {
    const userPct = Math.min(100, Math.max(10, (users / 2000) * 100));
    $('bar-users').style.width = `${userPct.toFixed(0)}%`;
  }
  if ($('bar-guilds')) {
    const guildPct = Math.min(100, Math.max(10, (guilds / 100) * 100));
    $('bar-guilds').style.width = `${guildPct.toFixed(0)}%`;
  }
  if ($('bar-ping')) {
    const pingPct = Math.min(100, Math.max(10, (Number(ping) / 400) * 100));
    $('bar-ping').style.width = `${pingPct.toFixed(0)}%`;
  }
}

function setLive(state, text, headline) {
  const live = $('live');
  if (live) live.dataset.state = state;
  const liveText = $('live-text');
  if (liveText) liveText.textContent = text;
  const headEl = $('headline');
  if (headEl) headEl.textContent = headline;
}

async function fetchWithFallback(endpoints) {
  for (const rawUrl of endpoints) {
    try {
      const url = rawUrl + (rawUrl.includes("?") ? "&" : "?") + "_t=" + Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const resp = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        return await resp.json();
      }
    } catch (e) {
      // try next fallback
    }
  }
  return null;
}

async function tick() {
  const [sRes, mRes] = await Promise.all([
    fetchWithFallback(SERVER_ENDPOINTS),
    fetchWithFallback(MAKI_ENDPOINTS)
  ]);

  if (sRes) {
    serverData = sRes;
    renderServer(serverData);
    setLive("ok", "稼働中", "正常に稼働中");
  } else {
    renderServer(serverData);
  }

  if (mRes) {
    makiData = mRes;
    renderMaki(makiData);
  } else {
    renderMaki(makiData);
  }

  if (!sRes && !mRes) {
    setLive("down", "応答なし", "応答がありません");
  }
}

// 初回即時描画
renderServer(serverData);
renderMaki(makiData);

// 初回APIリクエストと定期ポーリング
tick();
setInterval(tick, INTERVAL_MS);
