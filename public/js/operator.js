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
const authTokenInput = document.getElementById('auth-token');
const btnDownload = document.getElementById('btn-download');
const setupStatus = document.getElementById('setup-status');

const matchSelectorContainer = document.getElementById('match-selector-container');
const matchSelect = document.getElementById('match-select');
const btnStartOperator = document.getElementById('btn-start-operator');
const matchSelectTitle = document.getElementById('match-select-title');

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
const selectPeriod = document.getElementById('select-period');

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

// ============================================
// LOGIC SETUP KONEKSI (PIN OPERATOR)
// ============================================

// Helper to parse Server URL
function parseServerUrl(inputUrl) {
  try {
    let cleanUrl = inputUrl.trim();
    if (cleanUrl.endsWith('/')) {
      cleanUrl = cleanUrl.slice(0, -1);
    }
    const parsed = new URL(cleanUrl);
    return parsed.origin + parsed.pathname.replace(/\/$/, '');
  } catch (e) {
    return null;
  }
}

// 4. DOWNLOAD DATA PERTANDINGAN BERDASARKAN PIN
btnDownload.addEventListener('click', async () => {
  const serverUrl = parseServerUrl(serverUrlInput.value);
  const token = authTokenInput.value.trim();

  if (!serverUrl) {
    showSetupStatus("Alamat Server Pusat tidak valid!", "error");
    return;
  }

  if (!token) {
    showSetupStatus("Kode Akses Operator (PIN) wajib diisi!", "error");
    return;
  }

  btnDownload.disabled = true;
  btnDownload.textContent = "Menghubungkan & Memverifikasi...";
  showSetupStatus("Memverifikasi Kode Akses...", "info");

  try {
    // Verifikasi Token dan Ambil Detail Pertandingan
    const verifyRes = await fetch(`${serverUrl}/api/desktop/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token })
    });

    const result = await verifyRes.json();

    if (verifyRes.status === 200 && result.status) {
      const apiToken = result.api_token;
      const matchId = result.match.id_jadwal;

      // Simpan variabel koneksi
      localStorage.setItem('temp_server_url', serverUrl);
      localStorage.setItem('temp_token', apiToken);

      showSetupStatus("PIN Valid! Mengunduh detail pertandingan...", "info");

      // Setelah verifikasi berhasil, ambil full match data menggunakan id_jadwal
      const responseMatch = await fetch(`${serverUrl}/api/desktop/download-match/${matchId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      const fullResult = await responseMatch.json();

      if (responseMatch.status === 200 && fullResult.status) {
        matchData = fullResult.data;
        matchData.serverUrl = serverUrl;
        matchData.token = apiToken;
        
        // Simpan konfigurasi ke localStorage
        localStorage.setItem('active_match_data', JSON.stringify(matchData));
        localStorage.setItem('sync_queue', JSON.stringify([]));

        initMatchPanel();
        showSetupStatus("Download Berhasil! Memulai operator...", "success");
        setTimeout(() => {
          setupModal.style.display = 'none';
          mainLayout.style.display = 'flex';
        }, 1000);
      } else {
        showSetupStatus(fullResult.message || "Gagal mengunduh data penuh pertandingan.", "error");
      }
    } else {
      showSetupStatus(result.message || "Kode Akses tidak valid atau sudah kedaluwarsa.", "error");
    }
  } catch (error) {
    console.error(error);
    showSetupStatus("Gagal terhubung ke server. Pastikan Server URL benar.", "error");
  } finally {
    btnDownload.disabled = false;
    btnDownload.textContent = "Koneksikan & Buka Pertandingan";
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

  // Populate Period Dropdown
  if (selectPeriod) {
    selectPeriod.innerHTML = '';
    const jml = parseInt(matchData.jumlah_babak) || 2;
    const label = matchData.nama_babak || 'Babak';
    
    // Generate Babak Utama
    for (let i = 1; i <= jml; i++) {
      const val = `${label} ${i}`;
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      selectPeriod.appendChild(opt);
    }
    
    // Standard Extras
    const extras = (label.toLowerCase() === 'quarter') ? ['Overtime', 'Adu Penalti'] : ['Extra Time 1', 'Extra Time 2', 'Adu Penalti'];
    extras.forEach(ex => {
      const opt = document.createElement('option');
      opt.value = ex;
      opt.textContent = ex;
      selectPeriod.appendChild(opt);
    });
    
    // Custom option
    const customOpt = document.createElement('option');
    customOpt.value = '__add_custom__';
    customOpt.textContent = '+ Tambah Sesi...';
    selectPeriod.appendChild(customOpt);

    // Set selected value
    const current = matchData.current_period || `${label} 1`;
    // If the option does not exist yet (custom period), insert it before __add_custom__
    let hasOpt = false;
    for (let i = 0; i < selectPeriod.options.length; i++) {
      if (selectPeriod.options[i].value === current) {
        hasOpt = true;
        break;
      }
    }
    if (!hasOpt) {
      const opt = document.createElement('option');
      opt.value = current;
      opt.textContent = current;
      selectPeriod.insertBefore(opt, customOpt);
    }
    selectPeriod.value = current;
    matchData.current_period = current;
    localStorage.setItem('active_match_data', JSON.stringify(matchData));
  }

  // Pulihkan status roster pemain dari event history
  restoreRosterStatus();

  // Set Timer dari data server
  timerSeconds = parseInt(matchData.timer_seconds_elapsed || 0);
  updateTimerDisplay();
  if (matchData.is_timer_running == 1) {
    btnTimerStart.click();
  }

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
  const isBasket = matchData.cabor_nama.toLowerCase().includes('basket') || matchData.id_cabor == 3;

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
        if (matchData.cabor_events && matchData.cabor_events.length > 0) {
          matchData.cabor_events.forEach(ev => {
            let btnClass = 'gol';
            const code = ev.kode_event.toLowerCase();
            if (code.includes('kuning')) {
              btnClass = 'kuning';
            } else if (code.includes('merah') || code.includes('foul') || code.includes('error')) {
              btnClass = 'merah';
            } else if (code.includes('assist')) {
              btnClass = 'assist';
            } else if (code.includes('own_goal') || code.includes('bd')) {
              btnClass = 'bd';
            } else if (code.includes('smash') || code.includes('netting')) {
              btnClass = 'assist';
            }
            actionButtons += `
              <button class="btn-player-action ${btnClass}" onclick="recordPlayerEvent('${team}', ${p.id_personil}, '${ev.kode_event.toLowerCase()}', ${ev.bobot_skor})" title="${ev.nama_event}">${ev.ikon}</button>
            `;
          });
        } else {
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
              <button class="btn-player-action bd" onclick="recordPlayerEvent('${team}', ${p.id_personil}, 'own_goal', 1)" title="Gol Bunuh Diri">❌</button>
            `;
          }
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

  if (matchData && matchData.id_jadwal) {
    queueSyncAction('/api/desktop/update-timer', { id_jadwal: matchData.id_jadwal, seconds: timerSeconds, is_running: 1 });
  }
});

btnTimerStop.addEventListener('click', () => {
  if (!timerInterval) return;
  
  clearInterval(timerInterval);
  timerInterval = null;

  btnTimerStart.disabled = false;
  btnTimerStop.disabled = true;
  broadcastState();

  if (matchData && matchData.id_jadwal) {
    queueSyncAction('/api/desktop/update-timer', { id_jadwal: matchData.id_jadwal, seconds: timerSeconds, is_running: 0 });
  }
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

  if (matchData && matchData.id_jadwal) {
    queueSyncAction('/api/desktop/update-timer', { id_jadwal: matchData.id_jadwal, seconds: timerSeconds, is_running: 0 });
  }
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
      timerText: `${formatNum(min)}:${formatNum(sec)}`,
      currentPeriod: matchData ? matchData.current_period : 'Babak 1'
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

  let targetPoin = 'self';
  let points = weight;

  if (matchData.cabor_events && matchData.cabor_events.length > 0) {
    const foundEvent = matchData.cabor_events.find(ev => ev.kode_event.toLowerCase() === eventType.toLowerCase());
    if (foundEvent) {
      targetPoin = foundEvent.target_poin || 'self';
      points = parseInt(foundEvent.bobot_skor) || 0;
    }
  } else {
    // Fallback legacy logic
    targetPoin = eventType === 'own_goal' ? 'opponent' : 'self';
    points = eventType === 'own_goal' || eventType === 'gol' ? 1 : (eventType.startsWith('poin_') ? parseInt(eventType.replace('poin_', '')) : 0);
  }

  const eventPayload = {
    id_event: generateUUID(),
    id_jadwal: matchData.id_jadwal,
    id_personil: personilId,
    id_team: team === 'A' ? matchData.id_team_a : matchData.id_team_b,
    jenis: eventType,
    menit: elapsedMinutes,
    playerName: playerName,
    teamType: team,
    target_poin: targetPoin,
    nilai: points,
    periode: matchData.current_period || 'Babak 1'
  };

  if (!matchData.events) matchData.events = [];
  matchData.events.unshift(eventPayload);
  localStorage.setItem('active_match_data', JSON.stringify(matchData));

  // Handle score increments
  if (points > 0) {
    if (targetPoin === 'opponent') {
      if (team === 'A') {
        currentScoreB += points;
        scoreBDisplay.textContent = currentScoreB;
      } else {
        currentScoreA += points;
        scoreADisplay.textContent = currentScoreA;
      }
    } else {
      if (team === 'A') {
        currentScoreA += points;
        scoreADisplay.textContent = currentScoreA;
      } else {
        currentScoreB += points;
        scoreBDisplay.textContent = currentScoreB;
      }
    }
    saveMatchScoreLocally();
    broadcastState();

    broadcastChannel.postMessage({
      type: 'GOAL_CELEBRATION',
      data: {
        player: eventType === 'own_goal' ? 'Gol Bunuh Diri' : playerName,
        teamName: targetPoin === 'opponent' ? (team === 'A' ? matchData.team_b_nama : matchData.team_a_nama) : teamName
      }
    });

    queueSyncAction('/api/desktop/sync-score', { id_jadwal: matchData.id_jadwal, skor_a: currentScoreA, skor_b: currentScoreB });
  }

  queueSyncAction('/api/desktop/add-event', eventPayload);
  queueSyncAction('/api/desktop/update-timer', { id_jadwal: matchData.id_jadwal, seconds: timerSeconds, is_running: timerInterval ? 1 : 0 });

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
  if (!matchData) return;
  
  const anonModal = document.getElementById('anon-event-modal');
  const anonTeamLabel = document.getElementById('anon-modal-team-label');
  const anonTeamInput = document.getElementById('anon-team-type');
  const anonEventTypeSelect = document.getElementById('anon-event-type');
  const anonEventDescInput = document.getElementById('anon-event-desc');
  
  if (!anonModal) return;

  anonTeamInput.value = team;
  anonTeamLabel.textContent = `Tim: ${team === 'A' ? matchData.team_a_nama : matchData.team_b_nama}`;
  anonEventDescInput.value = '';

  // Populate Select
  anonEventTypeSelect.innerHTML = '';
  if (matchData.cabor_events && matchData.cabor_events.length > 0) {
    matchData.cabor_events.forEach(ev => {
      const opt = document.createElement('option');
      opt.value = ev.kode_event.toUpperCase();
      opt.textContent = ev.nama_event;
      anonEventTypeSelect.appendChild(opt);
    });
    
    // Check if own_goal is not in cabor_events, but is soccer/futsal
    const isSoccerFutsal = matchData.id_cabor == 1 || matchData.id_cabor == 2 || matchData.cabor_nama.toLowerCase().includes('bola') || matchData.cabor_nama.toLowerCase().includes('futsal');
    if (isSoccerFutsal) {
      const hasOg = matchData.cabor_events.some(ev => ev.kode_event.toLowerCase() === 'own_goal' || ev.kode_event.toLowerCase() === 'own goal' || ev.kode_event.toLowerCase() === 'bd');
      if (!hasOg) {
        const opt = document.createElement('option');
        opt.value = 'OWN_GOAL';
        opt.textContent = 'Gol Bunuh Diri (Own Goal)';
        anonEventTypeSelect.appendChild(opt);
      }
    }
  } else {
    const isBasket = matchData.cabor_nama.toLowerCase().includes('basket') || matchData.id_cabor == 3;
    if (isBasket) {
      anonEventTypeSelect.innerHTML = `
        <option value="POIN_1">1 Point</option>
        <option value="POIN_2">2 Point</option>
        <option value="POIN_3">3 Point</option>
        <option value="FOUL">Foul</option>
      `;
    } else {
      anonEventTypeSelect.innerHTML = `
        <option value="GOL">Gol</option>
        <option value="KARTU_KUNING">Kartu Kuning</option>
        <option value="KARTU_MERAH">Kartu Merah</option>
        <option value="OWN_GOAL">Gol Bunuh Diri (Own Goal)</option>
      `;
    }
  }

  // Extra Administrative Options
  const extras = [
    { value: 'GLOBAL_WARNING', text: 'Peringatan Global' },
    { value: 'STARTER', text: 'Starter (Menit 0)' },
    { value: 'SUB_IN', text: 'Masuk Lapangan (Sub In)' },
    { value: 'SUB_OUT', text: 'Keluar Lapangan (Sub Out)' },
    { value: 'PAUSE', text: 'Pause' },
    { value: 'RESUME', text: 'Resume' },
    { value: 'PERIOD_CHANGE', text: 'Ganti Babak' }
  ];
  extras.forEach(ex => {
    const opt = document.createElement('option');
    opt.value = ex.value;
    opt.textContent = ex.text;
    anonEventTypeSelect.appendChild(opt);
  });

  anonModal.style.display = 'flex';
};

window.saveAnonymousEvent = function() {
  const anonModal = document.getElementById('anon-event-modal');
  const anonTeamInput = document.getElementById('anon-team-type');
  const anonEventTypeSelect = document.getElementById('anon-event-type');
  const anonEventDescInput = document.getElementById('anon-event-desc');

  if (!anonModal) return;

  const team = anonTeamInput.value;
  const tipeEvent = anonEventTypeSelect.value;
  const keterangan = anonEventDescInput.value.trim();

  // Find Label
  let label = anonEventTypeSelect.options[anonEventTypeSelect.selectedIndex].textContent;
  if (keterangan) {
    label = `${label} (${keterangan})`;
  }

  let targetPoin = 'self';
  let weight = 0;

  // Look up event from cabor_events to see target_poin and bobot_skor
  if (matchData.cabor_events && matchData.cabor_events.length > 0) {
    const foundEvent = matchData.cabor_events.find(ev => ev.kode_event.toUpperCase() === tipeEvent);
    if (foundEvent) {
      targetPoin = foundEvent.target_poin || 'self';
      weight = parseInt(foundEvent.bobot_skor) || 0;
    } else {
      // Check for hardcoded fallback
      if (tipeEvent === 'OWN_GOAL') {
        targetPoin = 'opponent';
        weight = 1;
      } else if (tipeEvent.startsWith('POIN_')) {
        targetPoin = 'self';
        weight = parseInt(tipeEvent.replace('POIN_', '')) || 0;
      }
    }
  } else {
    // Fallback legacy logic
    if (tipeEvent === 'OWN_GOAL') {
      targetPoin = 'opponent';
      weight = 1;
    } else if (tipeEvent === 'GOL') {
      targetPoin = 'self';
      weight = 1;
    } else if (tipeEvent.startsWith('POIN_')) {
      targetPoin = 'self';
      weight = parseInt(tipeEvent.replace('POIN_', '')) || 0;
    }
  }

  const teamName = team === 'A' ? matchData.team_a_nama : matchData.team_b_nama;
  const elapsedMinutes = Math.floor(timerSeconds / 60);

  const eventPayload = {
    id_event: generateUUID(),
    id_jadwal: matchData.id_jadwal,
    id_personil: 0, // 0 for anonymous
    id_team: team === 'A' ? matchData.id_team_a : matchData.id_team_b,
    jenis: tipeEvent.toLowerCase(),
    menit: elapsedMinutes,
    playerName: label,
    teamType: team,
    target_poin: targetPoin,
    nilai: weight,
    periode: matchData.current_period || 'Babak 1',
    keterangan: keterangan
  };

  if (!matchData.events) matchData.events = [];
  matchData.events.unshift(eventPayload);
  localStorage.setItem('active_match_data', JSON.stringify(matchData));

  // Handle score increments
  if (weight > 0) {
    if (targetPoin === 'opponent') {
      if (team === 'A') {
        currentScoreB += weight;
        scoreBDisplay.textContent = currentScoreB;
      } else {
        currentScoreA += weight;
        scoreADisplay.textContent = currentScoreA;
      }
    } else {
      if (team === 'A') {
        currentScoreA += weight;
        scoreADisplay.textContent = currentScoreA;
      } else {
        currentScoreB += weight;
        scoreBDisplay.textContent = currentScoreB;
      }
    }
    saveMatchScoreLocally();
    broadcastState();

    broadcastChannel.postMessage({
      type: 'GOAL_CELEBRATION',
      data: {
        player: tipeEvent === 'OWN_GOAL' ? 'Gol Bunuh Diri' : label,
        teamName: targetPoin === 'opponent' ? (team === 'A' ? matchData.team_b_nama : matchData.team_a_nama) : teamName
      }
    });

    queueSyncAction('/api/desktop/sync-score', { id_jadwal: matchData.id_jadwal, skor_a: currentScoreA, skor_b: currentScoreB });
  }

  queueSyncAction('/api/desktop/add-event', eventPayload);
  queueSyncAction('/api/desktop/update-timer', { id_jadwal: matchData.id_jadwal, seconds: timerSeconds, is_running: timerInterval ? 1 : 0 });

  renderTimeline();
  anonModal.style.display = 'none';
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
    } else if (e.jenis === 'own_goal') {
      badgeClass = "kartu_merah";
      badgeText = "Own Goal";
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
    
    // Kurangi skor otomatis jika event bernilai poin dihapus
    if (deletedEvent.nilai && deletedEvent.nilai > 0) {
      const weight = deletedEvent.nilai;
      const targetPoin = deletedEvent.target_poin || 'self';
      if (targetPoin === 'opponent') {
        if (deletedEvent.teamType === 'A' && currentScoreB > 0) {
          currentScoreB = Math.max(0, currentScoreB - weight);
          scoreBDisplay.textContent = currentScoreB;
        } else if (deletedEvent.teamType === 'B' && currentScoreA > 0) {
          currentScoreA = Math.max(0, currentScoreA - weight);
          scoreADisplay.textContent = currentScoreA;
        }
      } else {
        if (deletedEvent.teamType === 'A' && currentScoreA > 0) {
          currentScoreA = Math.max(0, currentScoreA - weight);
          scoreADisplay.textContent = currentScoreA;
        } else if (deletedEvent.teamType === 'B' && currentScoreB > 0) {
          currentScoreB = Math.max(0, currentScoreB - weight);
          scoreBDisplay.textContent = currentScoreB;
        }
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

// PERIOD / BABAK SELECT LISTENER
if (selectPeriod) {
  selectPeriod.addEventListener('change', () => {
    let val = selectPeriod.value;
    if (val === '__add_custom__') {
      const custom = prompt("Masukkan nama sesi tambahan (contoh: Golden Goal, Extra Time 3):");
      if (custom) {
        const opt = document.createElement('option');
        opt.value = custom;
        opt.textContent = custom;
        const customOpt = selectPeriod.querySelector('option[value="__add_custom__"]');
        selectPeriod.insertBefore(opt, customOpt);
        selectPeriod.value = custom;
        val = custom;
      } else {
        // Revert to first option
        selectPeriod.value = selectPeriod.options[0].value;
        return;
      }
    }

    matchData.current_period = val;
    localStorage.setItem('active_match_data', JSON.stringify(matchData));
    
    broadcastState();
    
    // Sync to database
    queueSyncAction('/api/desktop/update-period', { id_jadwal: matchData.id_jadwal, current_period: val });
  });
}

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

  // Wire Modal Buttons
  const btnAnonCancel = document.getElementById('btn-anon-cancel');
  const btnAnonSave = document.getElementById('btn-anon-save');
  const anonModal = document.getElementById('anon-event-modal');
  
  if (btnAnonCancel && anonModal) {
    btnAnonCancel.addEventListener('click', () => {
      anonModal.style.display = 'none';
    });
  }
  
  if (btnAnonSave) {
    btnAnonSave.addEventListener('click', () => {
      saveAnonymousEvent();
    });
  }
});
