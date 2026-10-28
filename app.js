const INTERVAL_MS = 3000;
const HISTORY = 60; // 3秒 × 60 = 直近 3 分

const $ = (id) => document.getElementById(id);
const history = [0.2, 0.4, 0.1, 0.3, 0.2, 0.4, 0.1, 0.3];

const DEFAULT_API_ENDPOINT = "https://api.rds9.net/health";
const FALLBACK_ENDPOINTS = [
  "https://api.rds9.net/health"
];

const ACTIVE_ENDPOINT = DEFAULT_API_ENDPOINT;

let lastGoodData = null;

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

const CIRCUMFERENCE = 326.73; // 2 * Math.PI * 52

function setRing(ringId, numId, percent) {
  const ring = $(ringId);
  if (!ring) return;
  const val = Math.max(0, Math.min(100, Number(percent) || 0));
  ring.dataset.level = val >= 90 ? 'bad' : val >= 70 ? 'warn' : 'ok';

  const bar = ring.querySelector('.bar');
  if (bar) {
    if (val <= 0) {
      bar.style.strokeDashoffset = `${CIRCUMFERENCE}`;
      bar.style.opacity = '0';
    } else {
      const offset = CIRCUMFERENCE * (1 - val / 100);
      bar.style.strokeDashoffset = `${offset.toFixed(2)}`;
      bar.style.opacity = '1';
    }
  }

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

function renderValue(elId, val, isLocaleNumber = false) {
  const el = $(elId);
  if (!el) return;
  if (val === undefined || val === null || val === '—') {
    el.textContent = '—';
  } else if (isLocaleNumber && !isNaN(Number(val))) {
    el.textContent = Number(val).toLocaleString();
  } else {
    el.textContent = String(val);
  }
}

function render(data) {
  if (!data) return;

  const vps = data.services?.vps_host || {};
  const uptimeSec = vps.uptime_seconds || data.uptime_seconds || data.uptimeSec || 0;
  if ($('uptime')) $('uptime').textContent = uptimeSec ? formatDuration(uptimeSec) : '—';

  const cpuPercent = vps.cpu_percent !== undefined ? vps.cpu_percent : (data.cpuPercent || 0);
  setRing('cpu-ring', 'cpu', cpuPercent);
  if ($('cpu-sub')) $('cpu-sub').textContent = `${vps.cpus || data.cpus || '—'} コア`;

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
  if ($('mem-sub')) $('mem-sub').textContent = memTotalBytes ? `${formatGiB(memUsedBytes)} / ${formatGiB(memTotalBytes)}` : '—';
  if ($('mem-free')) $('mem-free').textContent = memTotalBytes ? formatGiB(Math.max(0, memTotalBytes - memUsedBytes)) : '—';

  // Storage (Disk)
  const disk = vps.disk || data.disk || {};
  let diskPercent = 0;
  let diskUsedBytes = 0;
  let diskTotalBytes = 0;
  let diskFreeBytes = 0;
  if (disk.total_bytes && disk.used_bytes) {
    diskUsedBytes = disk.used_bytes;
    diskTotalBytes = disk.total_bytes;
    diskFreeBytes = disk.free_bytes !== undefined ? disk.free_bytes : Math.max(0, diskTotalBytes - diskUsedBytes);
    diskPercent = disk.percent !== undefined ? disk.percent : (diskUsedBytes / diskTotalBytes) * 100;
  } else if (disk.total && disk.used) {
    diskUsedBytes = disk.used;
    diskTotalBytes = disk.total;
    diskFreeBytes = disk.free !== undefined ? disk.free : Math.max(0, diskTotalBytes - diskUsedBytes);
    diskPercent = disk.percent !== undefined ? disk.percent : (diskUsedBytes / diskTotalBytes) * 100;
  } else if (disk.total_gb && disk.used_gb) {
    diskUsedBytes = disk.used_gb * (1024 ** 3);
    diskTotalBytes = disk.total_gb * (1024 ** 3);
    diskFreeBytes = (disk.free_gb || Math.max(0, disk.total_gb - disk.used_gb)) * (1024 ** 3);
    diskPercent = disk.percent !== undefined ? disk.percent : (disk.used_gb / disk.total_gb) * 100;
  }
  setRing('disk-ring', 'disk', diskPercent);
  if ($('disk-sub')) $('disk-sub').textContent = diskTotalBytes ? `${formatGiB(diskUsedBytes)} / ${formatGiB(diskTotalBytes)}` : '—';
  if ($('disk-free')) $('disk-free').textContent = diskTotalBytes ? formatGiB(diskFreeBytes) : '—';

  // Load
  const load = vps.load || data.load || [];
  if ($('load')) $('load').textContent = load.length ? load.map((n) => Number(n).toFixed(2)).join('  ') : '—';

  // Server Time
  if ($('time')) $('time').textContent = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  // Makigumo
  const maki = data.services?.makigumo;
  const makiUsers = maki?.users ?? maki?.monitored_hentai ?? '—';
  const makiGuilds = maki?.guilds ?? '—';
  const makiPing = (maki?.latency_ms !== undefined && maki.latency_ms !== null) ? Number(maki.latency_ms).toFixed(1) : '—';
  renderValue('maki-stat', makiUsers, true);
  renderValue('bot-maki-users', makiUsers, true);
  renderValue('bot-maki-guilds', makiGuilds);
  renderValue('bot-maki-ping', makiPing);

  // World War Bot
  const war = data.services?.worldwarbot;
  const warUsers = war?.users ?? '—';
  const warGuilds = war?.guilds ?? '—';
  const warPing = (war?.latency_ms !== undefined && war.latency_ms !== null) ? Number(war.latency_ms).toFixed(1) : '—';
  renderValue('bot-war-users', warUsers, true);
  renderValue('bot-war-guilds', warGuilds);
  renderValue('bot-war-ping', warPing);

  // Auth Bot (認証bot)
  const auth = data.services?.auth;
  const authUsers = auth?.users ?? '—';
  const authGuilds = auth?.guilds ?? '—';
  const authPing = (auth?.latency_ms !== undefined && auth.latency_ms !== null) ? Number(auth.latency_ms).toFixed(1) : '—';
  renderValue('bot-auth-users', authUsers, true);
  renderValue('bot-auth-guilds', authGuilds);
  renderValue('bot-auth-ping', authPing);

  // Narisumashi Bot (なりすましchat)
  const nari = data.services?.narisumashi;
  const nariUsers = nari?.users ?? '—';
  const nariGuilds = nari?.guilds ?? '—';
  const nariPing = (nari?.latency_ms !== undefined && nari.latency_ms !== null) ? Number(nari.latency_ms).toFixed(1) : '—';
  renderValue('bot-nari-users', nariUsers, true);
  renderValue('bot-nari-guilds', nariGuilds);
  renderValue('bot-nari-ping', nariPing);

  // VC Manager Bot (VC自動作成bot)
  const vc = data.services?.vc;
  const vcUsers = vc?.users ?? '—';
  const vcGuilds = vc?.guilds ?? '—';
  const vcPing = (vc?.latency_ms !== undefined && vc.latency_ms !== null) ? Number(vc.latency_ms).toFixed(1) : '—';
  renderValue('bot-vc-users', vcUsers, true);
  renderValue('bot-vc-guilds', vcGuilds);
  renderValue('bot-vc-ping', vcPing);

  // Linkord 公式Bot
  const linkord = data.services?.linkord;
  const linkordUsers = linkord?.users ?? '—';
  const linkordGuilds = linkord?.guilds ?? '—';
  const linkordPing = (linkord?.latency_ms !== undefined && linkord.latency_ms !== null) ? Number(linkord.latency_ms).toFixed(1) : '—';
  renderValue('bot-linkord-users', linkordUsers, true);
  renderValue('bot-linkord-guilds', linkordGuilds);
  renderValue('bot-linkord-ping', linkordPing);

  // App Uptime
  const procUp = data.processUptimeSec || data.uptime_seconds || uptimeSec;
  if ($('proc-uptime')) $('proc-uptime').textContent = procUp ? formatDuration(procUp) : '—';

  // Sparkline history
  if (cpuPercent !== undefined) {
    history.push(cpuPercent);
    if (history.length > HISTORY) history.shift();
    drawSpark();
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
              ...(lastGoodData?.services || {}),
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
                },
                disk: d.disk || lastGoodData?.services?.vps_host?.disk
              }
            }
          };
        }
        lastGoodData = d;
        return { ok: true, data: d };
      }
    } catch (e) {
      console.warn("[rds9 health] fetch failed for:", rawUrl, e.message);
    }
  }

  // All endpoints failed
  return { ok: false, data: lastGoodData };
}

async function tick() {
  const res = await fetchStatus();
  if (res.ok && res.data) {
    render(res.data);
    setLive("ok", "稼働中", "正常に稼働中");
  } else {
    if (lastGoodData) {
      setLive("degraded", "応答なし", "ステータスの更新に失敗しました");
    } else {
      setLive("down", "応答なし", "応答がありません");
    }
  }
}

// Initial tick
tick();
setInterval(tick, INTERVAL_MS);
