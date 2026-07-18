(() => {
  const DIST_MAX = 100;
  const SPEED_MAX = 80;
  const BRAKE_ZONE = 20;
  const OFFLINE_AFTER_MS = 8000;

  let client = null;
  let selectedDevice = DEVICES[0].id;

  const deviceData = {};
  DEVICES.forEach((d) => {
    deviceData[d.id] = {
      dist: null,
      speed: null,
      active: false,
      lastSeen: null,
      timerHandle: null,
      log: [],
    };
  });

  const dot = document.getElementById('connDot');
  const connLabel = document.getElementById('connLabel');
  const errMsg = document.getElementById('errMsg');
  const retryBtn = document.getElementById('retryBtn');
  const deviceTabs = document.getElementById('deviceTabs');

  function setStatus(state, text) {
    dot.className = 'dot ' + state;
    connLabel.textContent = text;
  }

  document.getElementById('distMaxLabel').textContent = DIST_MAX + ' cm';
  document.getElementById('distZone').style.width = (BRAKE_ZONE / DIST_MAX * 100) + '%';

  function renderTabs() {
    deviceTabs.innerHTML = DEVICES.map((d) => {
      const st = deviceData[d.id];
      const dotClass = st.active ? 'brake' : (isOnline(d.id) ? 'live' : '');
      return `
        <div class="device-tab ${d.id === selectedDevice ? 'selected' : ''}" data-id="${d.id}">
          <span class="tab-dot ${dotClass}"></span>
          <span>${d.label}</span>
        </div>`;
    }).join('');

    deviceTabs.querySelectorAll('.device-tab').forEach((el) => {
      el.addEventListener('click', () => selectDevice(el.dataset.id));
    });
  }

  function isOnline(id) {
    const st = deviceData[id];
    return st.lastSeen && (Date.now() - st.lastSeen < OFFLINE_AFTER_MS);
  }

  function selectDevice(id) {
    selectedDevice = id;
    renderTabs();
    renderSelectedDevice();
  }

  function drawGaugeBase() {
    const svg = document.getElementById('speedGauge');
    const cx = 75;
    const cy = 75;
    const r = 58;
    const startAngle = -210;
    const endAngle = 30;

    function polar(cxp, cyp, rp, angleDeg) {
      const a = (angleDeg - 90) * Math.PI / 180;
      return [cxp + rp * Math.cos(a), cyp + rp * Math.sin(a)];
    }

    function arcPath(r, a0, a1) {
      const [x0, y0] = polar(cx, cy, r, a0);
      const [x1, y1] = polar(cx, cy, r, a1);
      const large = (a1 - a0) > 180 ? 1 : 0;
      return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
    }

    let ticks = '';
    for (let i = 0; i <= 8; i++) {
      const a = startAngle + (endAngle - startAngle) * (i / 8);
      const [ix, iy] = polar(cx, cy, r + 2, a);
      const [ox, oy] = polar(cx, cy, r - 6, a);
      ticks += `<line x1="${ix}" y1="${iy}" x2="${ox}" y2="${oy}" stroke="var(--line)" stroke-width="2"/>`;
    }

    svg.innerHTML = `
      <path d="${arcPath(r, startAngle, endAngle)}" fill="none" stroke="var(--safe-soft)" stroke-width="10" stroke-linecap="round"/>
      <path id="gaugeProgress" d="${arcPath(r, startAngle, startAngle)}" fill="none" stroke="var(--safe)" stroke-width="10" stroke-linecap="round"/>
      ${ticks}
      <line id="needle" x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - r + 14}" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round" transform="rotate(${startAngle} ${cx} ${cy})"/>
      <circle cx="${cx}" cy="${cy}" r="4.5" fill="var(--ink)"/>
    `;

    svg.dataset.cx = cx;
    svg.dataset.cy = cy;
    svg.dataset.r = r;
    svg.dataset.start = startAngle;
    svg.dataset.end = endAngle;
  }

  drawGaugeBase();

  function updateGauge(speed) {
    const svg = document.getElementById('speedGauge');
    const cx = +svg.dataset.cx;
    const cy = +svg.dataset.cy;
    const r = +svg.dataset.r;
    const startAngle = +svg.dataset.start;
    const endAngle = +svg.dataset.end;
    const frac = Math.max(0, Math.min(1, speed / SPEED_MAX));
    const angle = startAngle + (endAngle - startAngle) * frac;

    document.getElementById('needle').setAttribute('transform', `rotate(${angle} ${cx} ${cy})`);

    function polar(angleDeg) {
      const a = (angleDeg - 90) * Math.PI / 180;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    }

    const [x0, y0] = polar(startAngle);
    const [x1, y1] = polar(angle);
    const large = (angle - startAngle) > 180 ? 1 : 0;
    document.getElementById('gaugeProgress').setAttribute('d', `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`);
    document.getElementById('gaugeProgress').setAttribute('stroke', frac > 0.7 ? 'var(--warn)' : 'var(--safe)');
  }

  function updateDistance(dist) {
    const pct = Math.max(0, Math.min(1, dist / DIST_MAX)) * 100;
    const fill = document.getElementById('distFill');
    fill.style.width = pct + '%';
    fill.style.background = dist <= BRAKE_ZONE ? 'var(--brake)' : 'var(--track)';
  }

  function updateBrake(active) {
    const banner = document.getElementById('brakeBanner');
    const text = document.getElementById('brakeText');
    const tag = document.getElementById('brakeTag');
    banner.classList.toggle('active', active);
    text.textContent = active ? 'Rem aktif' : 'Rem tidak aktif';
    tag.textContent = active ? 'MENGEREM' : 'AMAN';
  }

  function renderSelectedDevice() {
    const d = DEVICES.find((x) => x.id === selectedDevice);
    const st = deviceData[selectedDevice];

    document.getElementById('deviceTitle').textContent = d.label;
    document.getElementById('lastSeen').textContent = st.lastSeen
      ? new Date(st.lastSeen).toLocaleTimeString('id-ID') + (isOnline(selectedDevice) ? '' : ' (offline)')
      : 'belum ada data';

    if (st.dist !== null) {
      document.getElementById('distVal').textContent = st.dist.toFixed(1);
      updateDistance(st.dist);
    } else {
      document.getElementById('distVal').textContent = '–';
      document.getElementById('distFill').style.width = '0%';
    }

    if (st.speed !== null) {
      document.getElementById('speedVal').textContent = st.speed.toFixed(1);
      updateGauge(st.speed);
    } else {
      document.getElementById('speedVal').textContent = '–';
      updateGauge(0);
    }

    updateBrake(st.active);
    renderLog();
  }

  function renderLog() {
    const st = deviceData[selectedDevice];
    const body = document.getElementById('logBody');
    const empty = document.getElementById('logEmpty');

    if (st.log.length === 0) {
      body.innerHTML = '';
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    body.innerHTML = st.log.map((r) => `
      <tr>
        <td>${r.time}</td>
        <td>${r.dist.toFixed(1)}</td>
        <td>${r.speed.toFixed(1)}</td>
        <td style="color:${r.active ? 'var(--brake)' : 'var(--safe)'}">${r.active ? 'aktif' : '—'}</td>
      </tr>`).join('');
  }

  function connect() {
    errMsg.style.display = 'none';
    errMsg.textContent = '';
    retryBtn.style.display = 'none';
    setStatus('connecting', 'Menyambungkan…');

    const url = `wss://${MQTT_HOST}:${MQTT_PORT}${MQTT_PATH}`;
    const clientId = 'web-dashboard-' + Math.random().toString(16).slice(2, 8);

    try {
      client = mqtt.connect(url, {
        username: MQTT_USER,
        password: MQTT_PASS,
        clientId,
        reconnectPeriod: 3000,
        connectTimeout: 8000,
      });
    } catch (e) {
      showError(e.message);
      return;
    }

    client.on('connect', () => {
      setStatus('connected', 'Tersambung');
      client.subscribe(TOPIC_FILTER, (err) => {
        if (err) showError('Gagal subscribe: ' + err.message);
      });
    });

    client.on('reconnect', () => setStatus('connecting', 'Menyambung ulang…'));
    client.on('error', (err) => showError(err.message || String(err)));
    client.on('close', () => setStatus('', 'Terputus'));

    client.on('message', (topic, message) => {
      try {
        const parts = topic.split('/');
        const deviceId = parts[1];
        const st = deviceData[deviceId];
        if (!st) return;

        const data = JSON.parse(message.toString());
        const dist = Number(data.jarak_cm ?? 0);
        const speed = Number(data.kecepatan_cms ?? 0);
        const active = Boolean(data.rem_aktif);
        const time = new Date().toLocaleTimeString('id-ID');

        st.dist = dist;
        st.speed = speed;
        st.active = active;
        st.lastSeen = Date.now();
        st.log.unshift({ time, dist, speed, active });
        if (st.log.length > 15) st.log.pop();

        if (st.timerHandle) clearTimeout(st.timerHandle);
        st.timerHandle = setTimeout(renderTabs, OFFLINE_AFTER_MS + 100);

        renderTabs();
        if (deviceId === selectedDevice) renderSelectedDevice();
      } catch (e) {
        showError('Pesan tidak terbaca: ' + e.message);
      }
    });
  }

  function showError(msg) {
    setStatus('error', 'Error koneksi');
    errMsg.textContent = msg;
    errMsg.style.display = 'block';
    retryBtn.style.display = 'block';
  }

  retryBtn.addEventListener('click', () => {
    if (client) {
      client.end(true);
      client = null;
    }
    connect();
  });

  renderTabs();
  renderSelectedDevice();
  connect();
})();
