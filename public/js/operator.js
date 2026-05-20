let ipcRenderer = null;
try {
  const electron = window.require ? window.require('electron') : null;
  if (electron) {
    ipcRenderer = electron.ipcRenderer;
  }
} catch (e) {
  console.log("Menjalankan di luar container Electron (Mode PWA/Browser)");
}

// STATE GLOBAL
let matchData = null;
let currentScoreA = 0;
let currentScoreB = 0;
let timerSeconds = 0;
let timerInterval = null;
let syncQueue = [];
let isOnline = false;

// Broadcast Channel untuk sinkronisasi ke layar kedua (Videotron)
const broadcastChannel = new BroadcastChannel('live_score_channel');

// Dengarkan request state dari Videotron (jika layar videotron dibuka belakangan)
broadcastChannel.onmessage = (event) => {
  if (event.data && event.data.type === 'REQUEST_STATE') {
    broadcastState();
  }
};

// DOM ELEMENTS - SETUP
const setupModal = document.getElementById('setup-modal');
const serverUrlInput = document.getElementById('server-url');
const matchIdInput = document.getElementById('match-id');
const authTokenInput = document.getElementById('auth-token');
const btnDownload = document.getElementById('btn-download');
const setupStatus = document.getElementById('setup-status');

// New Auth Selectors
const tabAccountLogin = document.getElementById('tab-login-account');
const tabTokenLogin = document.getElementById('tab-login-token');
const formAccountLogin = document.getElementById('form-account-login');
const formTokenLogin = document.getElementById('form-token-login');
const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const btnGoogleLogin = document.getElementById('btn-google-login');

// DOM ELEMENTS - MAIN PANEL
const mainLayout = document.querySelector('.main-layout');
const connectionStatus = document.getElementById('connection-status');
const syncCountBadge = document.getElementById('sync-count');
const btnOpenVideotron = document.getElementById('btn-open-videotron');
const btnSyncNow = document.getElementById('btn-sync-now');
const btnResetMatch = document.getElementById('btn-reset-match');

const caborBadge = document.getElementById('cabor-badge');
const faseBadge = document.getElementById('fase-badge');
const teamAName = document.getElementById('team-a-name');
const teamBName = document.getElementById('team-b-name');
const scoreADisplay = document.getElementById('score-a');
const scoreBDisplay = document.getElementById('score-b');

const timerMin = document.getElementById('timer-minutes');
const timerSec = document.getElementById('timer-seconds');
const btnTimerStart = document.getElementById('btn-timer-start');
const btnTimerStop = document.getElementById('btn-timer-stop');
const btnTimerReset = document.getElementById('btn-timer-reset');

const scoreAUp = document.getElementById('btn-score-a-up');
const scoreADown = document.getElementById('btn-score-a-down');
const scoreBUp = document.getElementById('btn-score-b-up');
const scoreBDown = document.getElementById('btn-score-b-down');

const btnTimeMinPlus = document.getElementById('btn-time-min-plus');
const btnTimeMinMinus = document.getElementById('btn-time-min-minus');
const btnTimeSecPlus = document.getElementById('btn-time-sec-plus');
const btnTimeSecMinus = document.getElementById('btn-time-sec-minus');

const activeListA = document.getElementById('active-list-a');
const benchListA = document.getElementById('bench-list-a');
const activeListB = document.getElementById('active-list-b');
const benchListB = document.getElementById('bench-list-b');

const btnAnonEventA = document.getElementById('btn-anon-event-a');
const btnAnonEventB = document.getElementById('btn-anon-event-b');

const timelineList = document.getElementById('timeline-list');

// 1. CEK ONLINE STATUS
function updateOnlineStatus() {
  isOnline = navigator.onLine;
  if (isOnline) {
    connectionStatus.textContent = "Online";
    connectionStatus.className = "status-badge online";
    processSyncQueue(); // Nyalakan sinkronisasi tertunda
  } else {
    connectionStatus.textContent = "Offline";
    connectionStatus.className = "status-badge offline";
  }
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// 2. DETEKSI STATUS LAYAR VIDEOTRON (ELECTRON ONLY)
if (ipcRenderer) {
  ipcRenderer.on('scoreboard-status', (event, isOpen) => {
    if (isOpen) {
      btnOpenVideotron.textContent = "📺 Videotron Aktif";
      btnOpenVideotron.className = "btn-sidebar secondary";
    } else {
      btnOpenVideotron.textContent = "📺 Buka Layar Videotron";
      btnOpenVideotron.className = "btn-sidebar";
    }
  });
}

// 3. EVENT BUKA LAYAR VIDEOTRON
btnOpenVideotron.addEventListener('click', () => {
  if (ipcRenderer) {
    ipcRenderer.send('open-scoreboard');
  } else {
    // Mode Browser / PWA: Buka tab baru
    window.open('scoreboard.html', 'scoreboard_window', 'width=1280,height=720');
  }
});

// Tab Switching logic
let activeAuthMode = 'account'; // default

tabAccountLogin.addEventListener('click', () => {
  activeAuthMode = 'account';
  tabAccountLogin.classList.add('active');
  tabAccountLogin.style.background = '#00d2ff';
  tabAccountLogin.style.color = '#0d0f1a';
  tabAccountLogin.style.border = 'none';

  tabTokenLogin.classList.remove('active');
  tabTokenLogin.style.background = 'transparent';
  tabTokenLogin.style.color = '#a4b0be';
  tabTokenLogin.style.border = '1px solid rgba(255,255,255,0.2)';

  formAccountLogin.style.display = 'block';
  formTokenLogin.style.display = 'none';
});

tabTokenLogin.addEventListener('click', () => {
  activeAuthMode = 'token';
  tabTokenLogin.classList.add('active');
  tabTokenLogin.style.background = '#00d2ff';
  tabTokenLogin.style.color = '#0d0f1a';
  tabTokenLogin.style.border = 'none';

  tabAccountLogin.classList.remove('active');
  tabAccountLogin.style.background = 'transparent';
  tabAccountLogin.style.color = '#a4b0be';
  tabAccountLogin.style.border = '1px solid rgba(255,255,255,0.2)';

  formTokenLogin.style.display = 'block';
  formAccountLogin.style.display = 'none';
});

// Google Login Event Handlers
if (btnGoogleLogin) {
  btnGoogleLogin.addEventListener('click', () => {
    const serverUrl = serverUrlInput.value.trim();
    if (!serverUrl) {
      showSetupStatus("Masukkan URL Web Server terlebih dahulu!", "error");
      return;
    }

    if (ipcRenderer) {
      showSetupStatus("Menunggu login Google di jendela baru...", "info");
      ipcRenderer.send('start-google-login', serverUrl);
    } else {
      const loginUrl = `${serverUrl}/api/desktop/google-login`;
      window.open(loginUrl, '_blank');
      showSetupStatus("Gunakan tombol 'Manual Token' untuk memasukkan token yang didapat setelah login.", "info");
    }
  });
}

if (ipcRenderer) {
  ipcRenderer.on('google-login-success', (event, token) => {
    authTokenInput.value = token;
    tabTokenLogin.click();
    showSetupStatus("Otentikasi Google berhasil! Mengunduh data pertandingan...", "success");
    btnDownload.click();
  });

  ipcRenderer.on('google-login-failed', (event, errorMsg) => {
    showSetupStatus(`Gagal Login Google: ${errorMsg}`, "error");
  });
}

// 4. DOWNLOAD DATA PERTANDINGAN (PRE-MATCH)
btnDownload.addEventListener('click', async () => {
  const serverUrl = serverUrlInput.value.trim();
  const matchId = matchIdInput.value.trim();
  let token = '';

  if (!serverUrl || !matchId) {
    showSetupStatus("Server URL dan Match ID wajib diisi!", "error");
    return;
  }

  if (activeAuthMode === 'token') {
    token = authTokenInput.value.trim();
    if (!token) {
      showSetupStatus("API Auth Token wajib diisi!", "error");
      return;
    }
  } else {
    // Mode Akun Login
    const username = loginUsernameInput.value.trim();
    const password = loginPasswordInput.value.trim();
    if (!username || !password) {
      showSetupStatus("Username & Password wajib diisi!", "error");
      return;
    }

    showSetupStatus("Melakukan autentikasi akun...", "info");
    try {
      const loginRes = await fetch(`${serverUrl}/api/desktop/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const loginData = await loginRes.json();
      if (loginRes.status === 200 && loginData.status) {
        token = loginData.token;
      } else {
        showSetupStatus(loginData.message || "Login Gagal. Cek kembali akun Anda.", "error");
        return;
      }
    } catch (e) {
      console.error(e);
      showSetupStatus("Gagal menghubungi server untuk login.", "error");
      return;
    }
  }

  showSetupStatus("Menghubungkan & mengunduh data...", "info");

  try {
    const response = await fetch(`${serverUrl}/api/desktop/download-match/${matchId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();

    if (response.status === 200 && result.status) {
      matchData = result.data;
      matchData.serverUrl = serverUrl;
      matchData.token = token;
      
      // Simpan konfigurasi ke localStorage
      localStorage.setItem('active_match_data', JSON.stringify(matchData));
      localStorage.setItem('sync_queue', JSON.stringify([]));

      initMatchPanel();
      showSetupStatus("Download Berhasil!", "success");
      setTimeout(() => {
        setupModal.style.display = 'none';
        mainLayout.style.display = 'flex';
      }, 1000);
    } else {
      showSetupStatus(result.message || "Gagal mengunduh data pertandingan.", "error");
    }
  } catch (error) {
    console.error(error);
    showSetupStatus("Gagal terhubung ke server. Cek jaringan atau URL Anda.", "error");
  }
});

function showSetupStatus(msg, type) {
  setupStatus.textContent = msg;
  setupStatus.className = `status-msg ${type}`;
}

// 5. INISIALISASI HALAMAN OPERATOR
function initMatchPanel() {
  if (!matchData) return;

  // Set Nama Tim & Skor Bawaan
  teamAName.textContent = matchData.team_a_nama;
  teamBName.textContent = matchData.team_b_nama;
  
  caborBadge.textContent = matchData.cabor_nama;
  faseBadge.textContent = matchData.fase ? `${matchData.kategori_nama} - ${matchData.fase}` : matchData.kategori_nama;

  currentScoreA = parseInt(matchData.skor_a || 0);
  currentScoreB = parseInt(matchData.skor_b || 0);
  scoreADisplay.textContent = currentScoreA;
  scoreBDisplay.textContent = currentScoreB;

  // Pulihkan status roster pemain dari event history
  restoreRosterStatus();

  // Load sync queue dari storage
  const savedQueue = localStorage.getItem('sync_queue');
  syncQueue = savedQueue ? JSON.parse(savedQueue) : [];
  updateSyncBadge();

  // Load event-log bawaan
  renderTimeline();

  updateOnlineStatus();
  broadcastState();
}

function restoreRosterStatus() {
  if (matchData.players_a) matchData.players_a.forEach(p => p.status = 'bench');
  if (matchData.players_b) matchData.players_b.forEach(p => p.status = 'bench');

  if (matchData.events && matchData.events.length > 0) {
    const eventsChronological = [...matchData.events].reverse();
    eventsChronological.forEach(e => {
      const team = e.teamType;
      const playerList = team === 'A' ? matchData.players_a : matchData.players_b;
      if (!playerList) return;
      const player = playerList.find(p => p.id_personil == e.id_personil);
      if (player) {
        if (e.jenis === 'starter' || e.jenis === 'sub_in') {
          player.status = 'active';
        } else if (e.jenis === 'sub_out') {
          player.status = 'bench';
        }
      }
    });
  }
  renderRoster();
}

function renderRoster() {
  if (!matchData) return;
  const isBasket = matchData.cabor_nama.toLowerCase().includes('basket') || matchData.id_cabor == 2;

  // Render untuk tim A dan B
  ['A', 'B'].forEach(team => {
    const activeList = team === 'A' ? activeListA : activeListB;
    const benchList = team === 'A' ? benchListA : benchListB;
    const players = team === 'A' ? matchData.players_a : matchData.players_b;

    activeList.innerHTML = '';
    benchList.innerHTML = '';

    if (!players || players.length === 0) {
      benchList.innerHTML = '<div class="roster-empty-message">Pemain belum didaftarkan</div>';
      return;
    }

    let activeCount = 0;

    players.forEach(p => {
      let actionButtons = '';
      if (p.status === 'active') {
        if (isBasket) {
          actionButtons = `
            <button class="btn-player-action gol" onclick="recordPlayerEvent('${team}', ${p.id_personil}, 'poin_1', 1)" title="Free Throw (+1)">1P</button>
            <button class="btn-player-action gol" onclick="recordPlayerEvent('${team}', ${p.id_personil}, 'poin_2', 2)" title="2 Point (+2)">2P</button>
            <button class="btn-player-action gol" onclick="recordPlayerEvent('${team}', ${p.id_personil}, 'poin_3', 3)" title="3 Point (+3)">3P</button>
            <button class="btn-player-action merah" onclick="recordPlayerEvent('${team}', ${p.id_personil}, 'foul', 0)" title="Foul">F</button>
          `;
        } else {
          actionButtons = `
            <button class="btn-player-action gol" onclick="recordPlayerEvent('${team}', ${p.id_personil}, 'gol', 1)" title="Gol">⚽</button>
            <button class="btn-player-action kuning" onclick="recordPlayerEvent('${team}', ${p.id_personil}, 'kartu_kuning', 0)" title="Kartu Kuning">🟨</button>
            <button class="btn-player-action merah" onclick="recordPlayerEvent('${team}', ${p.id_personil}, 'kartu_merah', 0)" title="Kartu Merah">🟥</button>
            <button class="btn-player-action assist" onclick="recordPlayerEvent('${team}', ${p.id_personil}, 'assist', 0)" title="Assist">👟</button>
          `;
        }
      }

      const subBtn = p.status === 'active' 
        ? `<button class="btn-player-sub" onclick="togglePlayerStatus('${team}', ${p.id_personil}, 'bench')" title="Tarik ke Cadangan">⬇️ Out</button>`
        : `<button class="btn-player-sub" onclick="togglePlayerStatus('${team}', ${p.id_personil}, 'active')" title="Masukkan ke Lapangan">⬆️ In</button>`;

      const playerRowHtml = `
        <div class="player-row">
          <div class="player-info">
            <span class="player-number">#${p.nomor_punggung || '-'}</span>
            <span class="player-name" title="${p.nama}">${p.nama}</span>
          </div>
          <div class="player-actions">
            ${p.status === 'active' ? actionButtons + subBtn : subBtn}
          </div>
        </div>
      `;

      if (p.status === 'active') {
        activeList.insertAdjacentHTML('beforeend', playerRowHtml);
        activeCount++;
      } else {
        benchList.insertAdjacentHTML('beforeend', playerRowHtml);
      }
    });

    if (activeCount === 0) {
      activeList.innerHTML = '<div class="roster-empty-message">Pemain belum dimasukkan ke lapangan</div>';
    }
  });
}

// 6. TIMER LOGIK
function formatNum(num) {
  return num.toString().padStart(2, '0');
}

function updateTimerDisplay() {
  const min = Math.floor(timerSeconds / 60);
  const sec = timerSeconds % 60;
  timerMin.textContent = formatNum(min);
  timerSec.textContent = formatNum(sec);
}

btnTimerStart.addEventListener('click', () => {
  if (timerInterval) return;
  
  btnTimerStart.disabled = true;
  btnTimerStop.disabled = false;

  timerInterval = setInterval(() => {
    timerSeconds++;
    updateTimerDisplay();
    broadcastState();
  }, 1000);
});

btnTimerStop.addEventListener('click', () => {
  if (!timerInterval) return;
  
  clearInterval(timerInterval);
  timerInterval = null;

  btnTimerStart.disabled = false;
  btnTimerStop.disabled = true;
  broadcastState();
});

btnTimerReset.addEventListener('click', () => {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerSeconds = 0;
  updateTimerDisplay();
  btnTimerStart.disabled = false;
  btnTimerStop.disabled = true;
  broadcastState();
});

// 7. FUNGSI BROADCAST KE VIDEOTRON
function broadcastState() {
  const min = Math.floor(timerSeconds / 60);
  const sec = timerSeconds % 60;
  
  broadcastChannel.postMessage({
    type: 'UPDATE_STATE',
    data: {
      cabor: matchData ? matchData.cabor_nama : 'CABOR',
      fase: matchData ? (matchData.fase ? `${matchData.kategori_nama} - ${matchData.fase}` : matchData.kategori_nama) : 'FASE',
      namaTurnamen: matchData ? matchData.nama_turnamen : 'TURNAMEN',
      teamAName: matchData ? matchData.team_a_nama : 'TEAM A',
      teamBName: matchData ? matchData.team_b_nama : 'TEAM B',
      scoreA: currentScoreA,
      scoreB: currentScoreB,
      timerText: `${formatNum(min)}:${formatNum(sec)}`
    }
  });
}

// 8. UPDATE SKOR UTAMA
scoreAUp.addEventListener('click', () => {
  currentScoreA++;
  scoreADisplay.textContent = currentScoreA;
  saveMatchScoreLocally();
  broadcastState();
  queueSyncAction('/api/desktop/sync-score', { id_jadwal: matchData.id_jadwal, skor_a: currentScoreA, skor_b: currentScoreB });
});

scoreADown.addEventListener('click', () => {
  if (currentScoreA > 0) {
    currentScoreA--;
    scoreADisplay.textContent = currentScoreA;
    saveMatchScoreLocally();
    broadcastState();
    queueSyncAction('/api/desktop/sync-score', { id_jadwal: matchData.id_jadwal, skor_a: currentScoreA, skor_b: currentScoreB });
  }
});

scoreBUp.addEventListener('click', () => {
  currentScoreB++;
  scoreBDisplay.textContent = currentScoreB;
  saveMatchScoreLocally();
  broadcastState();
  queueSyncAction('/api/desktop/sync-score', { id_jadwal: matchData.id_jadwal, skor_a: currentScoreA, skor_b: currentScoreB });
});

scoreBDown.addEventListener('click', () => {
  if (currentScoreB > 0) {
    currentScoreB--;
    scoreBDisplay.textContent = currentScoreB;
    saveMatchScoreLocally();
    broadcastState();
    queueSyncAction('/api/desktop/sync-score', { id_jadwal: matchData.id_jadwal, skor_a: currentScoreA, skor_b: currentScoreB });
  }
});

function saveMatchScoreLocally() {
  matchData.skor_a = currentScoreA;
  matchData.skor_b = currentScoreB;
  localStorage.setItem('active_match_data', JSON.stringify(matchData));
}

// 9. EVENT REGISTRATION (ROSTER & TIMER ADJUSTMENTS)
btnTimeMinPlus.addEventListener('click', () => {
  timerSeconds += 60;
  updateTimerDisplay();
  broadcastState();
});

btnTimeMinMinus.addEventListener('click', () => {
  timerSeconds = Math.max(0, timerSeconds - 60);
  updateTimerDisplay();
  broadcastState();
});

btnTimeSecPlus.addEventListener('click', () => {
  timerSeconds += 1;
  updateTimerDisplay();
  broadcastState();
});

btnTimeSecMinus.addEventListener('click', () => {
  timerSeconds = Math.max(0, timerSeconds - 1);
  updateTimerDisplay();
  broadcastState();
});

btnAnonEventA.addEventListener('click', () => {
  recordAnonymousEvent('A');
});

btnAnonEventB.addEventListener('click', () => {
  recordAnonymousEvent('B');
});

window.recordPlayerEvent = function(team, personilId, eventType, weight = 0) {
  const teamName = team === 'A' ? matchData.team_a_nama : matchData.team_b_nama;
  const elapsedMinutes = Math.floor(timerSeconds / 60);

  const players = team === 'A' ? matchData.players_a : matchData.players_b;
  const player = players.find(p => p.id_personil == personilId);
  const playerName = player ? player.nama : 'Pemain';

  const eventPayload = {
    id_event: generateUUID(),
    id_jadwal: matchData.id_jadwal,
    id_personil: personilId,
    id_team: team === 'A' ? matchData.id_team_a : matchData.id_team_b,
    jenis: eventType,
    menit: elapsedMinutes,
    playerName: playerName,
    teamType: team
  };

  if (!matchData.events) matchData.events = [];
  matchData.events.unshift(eventPayload);
  localStorage.setItem('active_match_data', JSON.stringify(matchData));

  // Handle score increments
  if (eventType === 'gol' || eventType.startsWith('poin_')) {
    const points = weight || 1;
    if (team === 'A') {
      currentScoreA += points;
      scoreADisplay.textContent = currentScoreA;
    } else {
      currentScoreB += points;
      scoreBDisplay.textContent = currentScoreB;
    }
    saveMatchScoreLocally();
    broadcastState();

    broadcastChannel.postMessage({
      type: 'GOAL_CELEBRATION',
      data: {
        player: playerName,
        teamName: teamName
      }
    });

    queueSyncAction('/api/desktop/sync-score', { id_jadwal: matchData.id_jadwal, skor_a: currentScoreA, skor_b: currentScoreB });
  }

  queueSyncAction('/api/desktop/add-event', eventPayload);

  renderTimeline();
};

window.togglePlayerStatus = function(team, personilId, newStatus) {
  const players = team === 'A' ? matchData.players_a : matchData.players_b;
  const player = players.find(p => p.id_personil == personilId);
  if (!player) return;

  player.status = newStatus;
  
  // Create starter / sub event payload
  let eventType = newStatus === 'active' ? 'sub_in' : 'sub_out';
  if (newStatus === 'active' && timerSeconds <= 0) {
    eventType = 'starter';
  }

  const teamId = team === 'A' ? matchData.id_team_a : matchData.id_team_b;
  const elapsedMinutes = Math.floor(timerSeconds / 60);

  const eventPayload = {
    id_event: generateUUID(),
    id_jadwal: matchData.id_jadwal,
    id_personil: personilId,
    id_team: teamId,
    jenis: eventType,
    menit: elapsedMinutes,
    playerName: player.nama,
    teamType: team
  };

  if (!matchData.events) matchData.events = [];
  matchData.events.unshift(eventPayload);
  localStorage.setItem('active_match_data', JSON.stringify(matchData));

  renderRoster();
  renderTimeline();
  broadcastState();

  queueSyncAction('/api/desktop/add-event', eventPayload);
};

window.recordAnonymousEvent = function(team) {
  const isBasket = matchData.cabor_nama.toLowerCase().includes('basket') || matchData.id_cabor == 2;
  let type = 'gol';
  let weight = 1;
  let label = 'Gol';
  
  if (isBasket) {
    const pointsStr = prompt("Masukkan jumlah poin (1, 2, atau 3):", "2");
    if (!pointsStr) return;
    weight = parseInt(pointsStr);
    if (![1, 2, 3].includes(weight)) {
      alert("Poin tidak valid!");
      return;
    }
    type = 'poin_' + weight;
    label = weight + ' Poin';
  } else {
    const isOwnGoal = confirm("Apakah ini Gol Bunuh Diri?");
    if (isOwnGoal) {
      type = 'gol';
      weight = 1;
      label = 'Gol Bunuh Diri (Own Goal)';
    }
  }

  const teamName = team === 'A' ? matchData.team_a_nama : matchData.team_b_nama;
  const elapsedMinutes = Math.floor(timerSeconds / 60);

  const eventPayload = {
    id_event: generateUUID(),
    id_jadwal: matchData.id_jadwal,
    id_personil: 0, // 0 for anonymous
    id_team: team === 'A' ? matchData.id_team_a : matchData.id_team_b,
    jenis: type,
    menit: elapsedMinutes,
    playerName: label,
    teamType: team
  };

  if (!matchData.events) matchData.events = [];
  matchData.events.unshift(eventPayload);
  
  // Add to score
  if (team === 'A') {
    currentScoreA += weight;
    scoreADisplay.textContent = currentScoreA;
  } else {
    currentScoreB += weight;
    scoreBDisplay.textContent = currentScoreB;
  }
  
  saveMatchScoreLocally();
  broadcastState();

  // Sync to server
  queueSyncAction('/api/desktop/sync-score', { id_jadwal: matchData.id_jadwal, skor_a: currentScoreA, skor_b: currentScoreB });
  queueSyncAction('/api/desktop/add-event', eventPayload);

  renderTimeline();
};

function renderTimeline() {
  timelineList.innerHTML = "";
  if (!matchData.events || matchData.events.length === 0) {
    timelineList.innerHTML = '<li class="empty-timeline">Belum ada kejadian tercatat.</li>';
    return;
  }

  matchData.events.forEach(e => {
    const item = document.createElement('li');
    item.className = "timeline-item";
    
    let badgeClass = "gol";
    let badgeText = "Event";
    
    if (e.jenis === 'gol') {
      badgeClass = "gol";
      badgeText = "Gol";
    } else if (e.jenis === 'kartu_kuning') {
      badgeClass = "kartu";
      badgeText = "Kuning";
    } else if (e.jenis === 'kartu_merah') {
      badgeClass = "kartu_merah";
      badgeText = "Merah";
    } else if (e.jenis === 'assist') {
      badgeClass = "gol";
      badgeText = "Assist";
    } else if (e.jenis === 'poin_1') {
      badgeClass = "gol";
      badgeText = "1 Poin";
    } else if (e.jenis === 'poin_2') {
      badgeClass = "gol";
      badgeText = "2 Poin";
    } else if (e.jenis === 'poin_3') {
      badgeClass = "gol";
      badgeText = "3 Poin";
    } else if (e.jenis === 'foul') {
      badgeClass = "kartu_merah";
      badgeText = "Foul";
    } else if (e.jenis === 'starter') {
      badgeClass = "gol";
      badgeText = "Starter";
    } else if (e.jenis === 'sub_in') {
      badgeClass = "gol";
      badgeText = "Masuk";
    } else if (e.jenis === 'sub_out') {
      badgeClass = "kartu_merah";
      badgeText = "Keluar";
    }

    item.innerHTML = `
      <span class="timeline-time">${e.menit}'</span>
      <span class="timeline-badge ${badgeClass}">${badgeText}</span>
      <span class="timeline-text"><strong>${e.playerName}</strong> (${e.teamType === 'A' ? matchData.team_a_nama : matchData.team_b_nama})</span>
      <button class="timeline-delete" onclick="deleteEventLocally('${e.id_event}')">Hapus</button>
    `;
    timelineList.appendChild(item);
  });
}

window.deleteEventLocally = function(eventId) {
  if (!confirm("Hapus kejadian ini?")) return;

  const eventIndex = matchData.events.findIndex(e => e.id_event === eventId);
  if (eventIndex > -1) {
    const deletedEvent = matchData.events[eventIndex];
    
    // Kurangi skor otomatis jika gol/poin dihapus
    if (deletedEvent.jenis === 'gol' || deletedEvent.jenis.startsWith('poin_')) {
      let weight = 1;
      if (deletedEvent.jenis.startsWith('poin_')) {
        weight = parseInt(deletedEvent.jenis.split('_')[1]) || 1;
      }
      if (deletedEvent.teamType === 'A' && currentScoreA > 0) {
        currentScoreA = Math.max(0, currentScoreA - weight);
        scoreADisplay.textContent = currentScoreA;
      } else if (deletedEvent.teamType === 'B' && currentScoreB > 0) {
        currentScoreB = Math.max(0, currentScoreB - weight);
        scoreBDisplay.textContent = currentScoreB;
      }
      saveMatchScoreLocally();
      broadcastState();
      queueSyncAction('/api/desktop/sync-score', { id_jadwal: matchData.id_jadwal, skor_a: currentScoreA, skor_b: currentScoreB });
    }

    matchData.events.splice(eventIndex, 1);
    localStorage.setItem('active_match_data', JSON.stringify(matchData));

    // Replay status pemain jika event yang dihapus adalah starter / sub
    if (['starter', 'sub_in', 'sub_out'].includes(deletedEvent.jenis)) {
      restoreRosterStatus();
    } else {
      renderRoster();
    }
    
    renderTimeline();

    // Kirim perintah hapus ke server queue
    queueSyncAction('/api/desktop/delete-event', { id_event: eventId });
  }
};

// 10. OUTBOX SYNC QUEUE SYSTEM
function queueSyncAction(endpoint, payload) {
  const queueItem = {
    id: generateUUID(),
    endpoint: endpoint,
    payload: payload,
    status: 'pending'
  };

  syncQueue.push(queueItem);
  localStorage.setItem('sync_queue', JSON.stringify(syncQueue));
  updateSyncBadge();

  if (isOnline) {
    processSyncQueue();
  }
}

async function processSyncQueue() {
  if (syncQueue.length === 0) return;
  
  // Ambil data pertama
  const activeItem = syncQueue.find(item => item.status === 'pending');
  if (!activeItem) return;

  activeItem.status = 'processing';

  try {
    const response = await fetch(`${matchData.serverUrl}${activeItem.endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${matchData.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(activeItem.payload)
    });

    const result = await response.json();

    if (response.status === 200 && result.status) {
      // Hapus dari antrean jika sukses
      syncQueue = syncQueue.filter(item => item.id !== activeItem.id);
      localStorage.setItem('sync_queue', JSON.stringify(syncQueue));
      updateSyncBadge();

      // Rekursif panggil sisa antrean
      processSyncQueue();
    } else {
      activeItem.status = 'pending'; // Kembalikan ke pending agar dicoba lagi
    }
  } catch (error) {
    console.error("Gagal sinkronisasi antrean:", error);
    activeItem.status = 'pending';
  }
}

function updateSyncBadge() {
  syncCountBadge.textContent = syncQueue.length;
}

btnSyncNow.addEventListener('click', () => {
  updateOnlineStatus();
  if (isOnline) {
    processSyncQueue();
  } else {
    alert("Koneksi internet Anda mati, tidak dapat melakukan sinkronisasi paksa.");
  }
});

// RESET & KELUAR
btnResetMatch.addEventListener('click', () => {
  if (confirm("Apakah Anda yakin ingin meriset sesi pertandingan ini? Data yang belum disinkronkan akan hilang!")) {
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    localStorage.removeItem('active_match_data');
    localStorage.removeItem('sync_queue');
    
    // Sembunyikan panel, tampilkan setup modal
    mainLayout.style.display = 'none';
    setupModal.style.display = 'flex';
    
    if (ipcRenderer) {
      ipcRenderer.send('close-scoreboard');
    }
  }
});

// UTILITIES
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// AUTO RESTORE SESSION ON LOAD
window.addEventListener('load', () => {
  const savedData = localStorage.getItem('active_match_data');
  if (savedData) {
    matchData = JSON.parse(savedData);
    setupModal.style.display = 'none';
    mainLayout.style.display = 'flex';
    initMatchPanel();
  }
});
