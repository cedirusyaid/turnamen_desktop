let ipcRenderer = null;
let fs = null;
let path = null;
try {
  const electron = window.require ? window.require('electron') : null;
  if (electron) {
    ipcRenderer = electron.ipcRenderer;
  }
  fs = window.require ? window.require('fs') : null;
  path = window.require ? window.require('path') : null;
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
let isBypassStarter = false;

// Shot Clock State
let shotClockSeconds = 24;
let shotClockInterval = null;
let showShotClock = false;

// Shot Clock Functions
function startShotClock() {
  if (shotClockInterval) return;
  const btnStart = document.getElementById('btn-shotclock-start');
  const btnPause = document.getElementById('btn-shotclock-pause');
  if (btnStart) btnStart.disabled = true;
  if (btnPause) btnPause.disabled = false;
  
  shotClockInterval = setInterval(() => {
    if (shotClockSeconds > 0) {
      shotClockSeconds--;
      if (shotClockSeconds === 0) {
        pauseShotClock();
        playBuzzer();
      }
    }
    updateShotClockDisplay();
    broadcastState();
  }, 1000);
}

function pauseShotClock() {
  if (!shotClockInterval) return;
  clearInterval(shotClockInterval);
  shotClockInterval = null;
  const btnStart = document.getElementById('btn-shotclock-start');
  const btnPause = document.getElementById('btn-shotclock-pause');
  if (btnStart) btnStart.disabled = false;
  if (btnPause) btnPause.disabled = true;
  broadcastState();
}

function resetShotClock(seconds = 24) {
  shotClockSeconds = seconds;
  updateShotClockDisplay();
  broadcastState();
}

function updateShotClockDisplay() {
  const disp = document.getElementById('operator-shot-clock-display');
  if (disp) {
    disp.textContent = shotClockSeconds;
  }
}

// Timer Configuration
let timerMode = 'up'; // 'up' or 'down'
let timerDuration = 10 * 60; // Default 10 mins in seconds

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

const pinMatchSelector = document.getElementById('pin-match-selector');
const pinTournamentName = document.getElementById('pin-tournament-name');
const pinMatchSelect = document.getElementById('pin-match-select');
const btnStartPinMatch = document.getElementById('btn-start-pin-match');

let verifiedTournamentData = null; 
let isVerifiedOffline = false;

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
const btnFinishMatch = document.getElementById('btn-finish-match');

const scoreAUp = document.getElementById('btn-score-a-up');
const scoreBUp = document.getElementById('btn-score-b-up');

const foulSectionA = document.getElementById('foul-section-a');
const foulCountA = document.getElementById('foul-count-a');
const btnResetFoulA = document.getElementById('btn-reset-foul-a');
const foulSectionB = document.getElementById('foul-section-b');
const foulCountB = document.getElementById('foul-count-b');
const btnResetFoulB = document.getElementById('btn-reset-foul-b');

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
      btnOpenVideotron.innerHTML = '<i class="fa fa-tv me-1"></i> Videotron Aktif';
      btnOpenVideotron.style.borderColor = '#00d2ff';
      btnOpenVideotron.style.color = '#00d2ff';
    } else {
      btnOpenVideotron.innerHTML = '<i class="fa fa-tv me-1"></i> Layar Videotron';
      btnOpenVideotron.style.borderColor = '';
      btnOpenVideotron.style.color = '';
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

function formatMatchOptionText(m) {
  // Format status text
  let statusText = "Belum Dimulai";
  if (m.status_pertandingan === "berjalan") {
    statusText = "Sedang Berlangsung";
  } else if (m.status_pertandingan === "selesai") {
    statusText = "Selesai";
  }

  // Format waktu str
  let waktuStr = "-";
  if (m.waktu) {
    try {
      const dateObj = new Date(m.waktu);
      const options = { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false
      };
      waktuStr = dateObj.toLocaleString('id-ID', options).replace(',', '');
    } catch (e) {
      waktuStr = m.waktu;
    }
  }

  // Format skor info jika berjalan / selesai
  let scoreInfo = "";
  if (m.status_pertandingan === "berjalan" || m.status_pertandingan === "selesai") {
    scoreInfo = ` (${m.skor_a ?? m.skor_1 ?? 0} - ${m.skor_b ?? m.skor_2 ?? 0})`;
  }

  return `[${m.kategori_nama} - ${m.fase}] ${m.team_a_nama} vs ${m.team_b_nama}${scoreInfo} | Rencana: ${waktuStr} | Status: ${statusText}`;
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

  // Jika Offline, coba hubungkan secara lokal
  if (!navigator.onLine) {
    handleOfflinePINVerification(token, serverUrl);
    btnDownload.disabled = false;
    btnDownload.textContent = "Koneksikan & Buka Pertandingan";
    return;
  }

  try {
    // Verifikasi Token Turnamen dan Ambil Detail Pertandingan Ongoing
    const verifyRes = await fetch(`${serverUrl}/api/desktop/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token })
    });

    const result = await verifyRes.json();

    if (verifyRes.status === 200 && result.status) {
      const apiToken = result.api_token;
      const tournamentId = result.tournament.id_turnamen;

      // Simpan variabel koneksi
      localStorage.setItem('temp_server_url', serverUrl);
      localStorage.setItem('temp_token', apiToken);

      showSetupStatus("PIN Valid! Mengunduh paket turnamen untuk cadangan offline...", "info");

      // Download full tournament package secara background untuk cadangan offline
      try {
        const responseTour = await fetch(`${serverUrl}/api/desktop/download-tournament/${tournamentId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          }
        });
        const tourResult = await responseTour.json();
        if (responseTour.status === 200 && tourResult.status) {
          // Tambahkan PIN token agar file backup lokal ini bisa diakses offline lewat PIN yang sama
          tourResult.operator_token = token;
          saveLocalBackup(tournamentId, tourResult);
          console.log("[Setup] Berhasil mencadangkan turnamen secara lokal untuk mode offline.");
        }
      } catch (errTour) {
        console.warn("[Setup] Gagal mendownload paket cadangan offline secara background:", errTour);
      }

      // Tampilkan list pertandingan di dropdown selector
      verifiedTournamentData = result;
      isVerifiedOffline = false;

      pinTournamentName.textContent = result.tournament.nama_turnamen;
      pinMatchSelect.innerHTML = '';
      
      const activeMatches = (result.matches || []).filter(m => m.status_pertandingan !== 'selesai');
      if (activeMatches.length === 0) {
        const opt = document.createElement('option');
        opt.value = "";
        opt.textContent = "-- Tidak ada pertandingan berjalan / belum selesai --";
        pinMatchSelect.appendChild(opt);
      } else {
        activeMatches.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.id_jadwal;
          opt.textContent = formatMatchOptionText(m);
          pinMatchSelect.appendChild(opt);
        });
      }

      pinMatchSelector.style.display = 'block';
      showSetupStatus("Koneksi berhasil! Silakan pilih pertandingan turnamen di bawah.", "success");
    } else {
      showSetupStatus(result.message || "Kode Akses tidak valid atau sudah kedaluwarsa.", "error");
    }
  } catch (error) {
    console.error(error);
    // Jika koneksi server gagal (tapi browser mendeteksi online), coba verifikasi secara lokal sebagai fallback
    console.log("[Setup] Gagal konek server. Fallback ke verifikasi PIN lokal offline.");
    handleOfflinePINVerification(token, serverUrl);
  } finally {
    btnDownload.disabled = false;
    btnDownload.textContent = "Koneksikan & Buka Pertandingan";
  }
});

// Helper Verifikasi PIN secara Offline dari cadangan lokal
function handleOfflinePINVerification(token, serverUrl) {
  const backups = getLocalBackupsList();
  // Cari backup yang memiliki operator_token == token
  const targetBackup = backups.find(b => b.data && (b.data.operator_token === token || b.operator_token === token));
  
  if (targetBackup) {
    verifiedTournamentData = targetBackup.data;
    isVerifiedOffline = true;

    // Simpan variabel koneksi fallback
    localStorage.setItem('temp_server_url', serverUrl);
    localStorage.setItem('temp_token', token);

    pinTournamentName.textContent = `${targetBackup.nama_turnamen} (Offline)`;
    pinMatchSelect.innerHTML = '';
    
    const activeMatches = (verifiedTournamentData.matches || []).filter(m => m.status_pertandingan !== 'selesai');
    if (activeMatches.length === 0) {
      const opt = document.createElement('option');
      opt.value = "";
      opt.textContent = "-- Tidak ada pertandingan berjalan / belum selesai --";
      pinMatchSelect.appendChild(opt);
    } else {
      activeMatches.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id_jadwal;
        opt.textContent = formatMatchOptionText(m);
        pinMatchSelect.appendChild(opt);
      });
    }

    pinMatchSelector.style.display = 'block';
    showSetupStatus("Terhubung secara Offline ke cadangan laptop!", "success");
  } else {
    showSetupStatus("PIN tidak ditemukan dalam cadangan laptop! Hubungkan internet untuk memverifikasi pertama kali.", "error");
  }
}

// 4b. START MATCH BERDASARKAN SELEKTOR PIN
btnStartPinMatch.addEventListener('click', async () => {
  const matchId = pinMatchSelect.value;
  if (!matchId) {
    showSetupStatus("Pilih pertandingan terlebih dahulu!", "error");
    return;
  }

  const serverUrl = localStorage.getItem('temp_server_url');
  const token = localStorage.getItem('temp_token');

  btnStartPinMatch.disabled = true;
  btnStartPinMatch.textContent = "Memuat Pertandingan...";

  if (isVerifiedOffline) {
    // Mode Offline: Ambil langsung dari verifiedTournamentData (data backup lokal)
    const match = verifiedTournamentData.matches.find(m => m.id_jadwal == matchId);
    if (!match) {
      showSetupStatus("Pertandingan tidak ditemukan di file cadangan!", "error");
      btnStartPinMatch.disabled = false;
      btnStartPinMatch.textContent = "Mulai Pertandingan";
      return;
    }

    matchData = match;
    matchData.serverUrl = serverUrl;
    matchData.token = token;

    localStorage.setItem('active_match_data', JSON.stringify(matchData));
    localStorage.setItem('sync_queue', JSON.stringify([]));

    initMatchPanel();
    updateOnlineStatus();

    showSetupStatus("Memulai pertandingan secara offline...", "success");
    setTimeout(() => {
      setupModal.style.display = 'none';
      mainLayout.style.display = 'flex';
      btnStartPinMatch.disabled = false;
      btnStartPinMatch.textContent = "Mulai Pertandingan";
    }, 1000);
  } else {
    // Mode Online: Ambil langsung dari server
    try {
      const responseMatch = await fetch(`${serverUrl}/api/desktop/download-match/${matchId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const fullResult = await responseMatch.json();

      if (responseMatch.status === 200 && fullResult.status) {
        matchData = fullResult.data;
        matchData.serverUrl = serverUrl;
        matchData.token = token;
        
        localStorage.setItem('active_match_data', JSON.stringify(matchData));
        localStorage.setItem('sync_queue', JSON.stringify([]));

        initMatchPanel();
        showSetupStatus("Pertandingan berhasil dimuat! Memulai panel operator...", "success");
        setTimeout(() => {
          setupModal.style.display = 'none';
          mainLayout.style.display = 'flex';
          btnStartPinMatch.disabled = false;
          btnStartPinMatch.textContent = "Mulai Pertandingan";
        }, 1000);
      } else {
        showSetupStatus(fullResult.message || "Gagal memuat pertandingan dari server.", "error");
        btnStartPinMatch.disabled = false;
        btnStartPinMatch.textContent = "Mulai Pertandingan";
      }
    } catch (err) {
      console.error(err);
      showSetupStatus("Gagal menghubungi server untuk memuat detail laga.", "error");
      btnStartPinMatch.disabled = false;
      btnStartPinMatch.textContent = "Mulai Pertandingan";
    }
  }
});

function showSetupStatus(msg, type) {
  setupStatus.textContent = msg;
  setupStatus.className = `status-msg ${type}`;
}

// Function helper untuk tenis game points & update score set yang aktif
function updateMainScoresForTennis() {
  if (!matchData) return;
  if (parseInt(matchData.id_cabor) === 10) {
    const period = matchData.current_period || 'Babak 1';
    let setNum = 1;
    if (period.includes('2')) setNum = 2;
    else if (period.includes('3')) setNum = 3;
    else if (period.includes('4')) setNum = 4;
    else if (period.includes('5')) setNum = 5;

    currentScoreA = parseInt(matchData[`s${setNum}_1`] || 0);
    currentScoreB = parseInt(matchData[`s${setNum}_2`] || 0);
    scoreADisplay.textContent = currentScoreA;
    scoreBDisplay.textContent = currentScoreB;

    // Tampilkan/update tennis game points
    const wrapper = document.getElementById('tennis-game-points-wrapper');
    const ptA = document.getElementById('tennis-point-a');
    const ptB = document.getElementById('tennis-point-b');
    if (wrapper && ptA && ptB) {
      wrapper.style.display = 'flex';
      let txt1 = "0";
      let txt2 = "0";
      if (period.indexOf('[') !== -1 && period.indexOf(']') !== -1) {
        let parts = period.split('[')[1].split(']')[0].split('-');
        txt1 = parts[0].trim();
        txt2 = parts[1].trim();
      } else if (period.toUpperCase().indexOf('DEUCE') !== -1) {
        txt1 = "40";
        txt2 = "40";
      }
      ptA.textContent = txt1;
      ptB.textContent = txt2;
    }
  } else {
    const wrapper = document.getElementById('tennis-game-points-wrapper');
    if (wrapper) wrapper.style.display = 'none';
  }
}

// 5. INISIALISASI HALAMAN OPERATOR
function initMatchPanel() {
  if (!matchData) return;

  // Tentukan apakah cabor bypass starter (Tenis Meja = 5, Bulu Tangkis = 7, Tenis Lapangan = 10)
  isBypassStarter = [5, 7, 10].includes(parseInt(matchData.id_cabor));

  // Sembunyikan/tampilkan tombol & bangku cadangan & anon footer jika bypass starter
  const starterBtnA = document.getElementById('btn-starter-all-a');
  const starterBtnB = document.getElementById('btn-starter-all-b');
  const benchHeaderA = document.getElementById('bench-header-a');
  const benchHeaderB = document.getElementById('bench-header-b');
  const benchListA = document.getElementById('bench-list-a');
  const benchListB = document.getElementById('bench-list-b');
  const anonFooterA = document.getElementById('anon-footer-a');
  const anonFooterB = document.getElementById('anon-footer-b');

  if (isBypassStarter) {
    if (starterBtnA) starterBtnA.style.setProperty('display', 'none', 'important');
    if (starterBtnB) starterBtnB.style.setProperty('display', 'none', 'important');
    if (benchHeaderA) benchHeaderA.style.setProperty('display', 'none', 'important');
    if (benchHeaderB) benchHeaderB.style.setProperty('display', 'none', 'important');
    if (benchListA) benchListA.style.setProperty('display', 'none', 'important');
    if (benchListB) benchListB.style.setProperty('display', 'none', 'important');
    if (anonFooterA) anonFooterA.style.setProperty('display', 'none', 'important');
    if (anonFooterB) anonFooterB.style.setProperty('display', 'none', 'important');
  } else {
    if (starterBtnA) starterBtnA.style.display = '';
    if (starterBtnB) starterBtnB.style.display = '';
    if (benchHeaderA) benchHeaderA.style.display = '';
    if (benchHeaderB) benchHeaderB.style.display = '';
    if (benchListA) benchListA.style.display = '';
    if (benchListB) benchListB.style.display = '';
    if (anonFooterA) anonFooterA.style.display = '';
    if (anonFooterB) anonFooterB.style.display = '';
  }

  // Set Nama Tim & Skor Bawaan
  teamAName.textContent = matchData.team_a_nama;
  teamBName.textContent = matchData.team_b_nama;
  
  caborBadge.textContent = matchData.cabor_nama;
  faseBadge.textContent = matchData.fase ? `${matchData.kategori_nama} - ${matchData.fase}` : matchData.kategori_nama;

  currentScoreA = parseInt(matchData.skor_a || 0);
  currentScoreB = parseInt(matchData.skor_b || 0);
  scoreADisplay.textContent = currentScoreA;
  scoreBDisplay.textContent = currentScoreB;

  // Khusus tenis, update ke skor set aktif
  updateMainScoresForTennis();

  // Init Timer Config
  timerMode = matchData.timer_mode || 'up';
  timerDuration = (parseInt(matchData.timer_duration) || 10) * 60;

  // Auto-hide Timer for Set-based sports
  const timerContainer = document.querySelector('.timer-section');
  if (matchData.tipe_skor === 'set') {
    if (timerContainer) timerContainer.style.display = 'none';
  } else {
    if (timerContainer) timerContainer.style.display = 'flex';
  }

  // Init Shot Clock (Basket Only)
  const isBasket = matchData && parseInt(matchData.id_cabor) === 3;
  const shotClockBox = document.getElementById('shot-clock-operator-box');
  if (isBasket) {
    showShotClock = true;
    shotClockSeconds = 24;
    if (shotClockBox) shotClockBox.style.display = 'block';
    const disp = document.getElementById('operator-shot-clock-display');
    if (disp) disp.textContent = shotClockSeconds;
  } else {
    showShotClock = false;
    if (shotClockBox) shotClockBox.style.display = 'none';
  }

  // Init Foul UI
  const hasFoul = matchData.id_cabor == 2 || matchData.id_cabor == 3;
  if (hasFoul) {
    foulSectionA.style.display = 'flex';
    foulSectionB.style.display = 'flex';
    foulCountA.textContent = parseInt(matchData.foul_a || 0);
    foulCountB.textContent = parseInt(matchData.foul_b || 0);
    if (parseInt(matchData.foul_a || 0) >= 5) foulCountA.style.color = '#ff4757'; else foulCountA.style.color = '#fff';
    if (parseInt(matchData.foul_b || 0) >= 5) foulCountB.style.color = '#ff4757'; else foulCountB.style.color = '#fff';
  } else {
    foulSectionA.style.display = 'none';
    foulSectionB.style.display = 'none';
  }

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
  lockUI();
}

function restoreRosterStatus() {
  if (isBypassStarter) {
    if (matchData.players_a) matchData.players_a.forEach(p => p.status = 'active');
    if (matchData.players_b) matchData.players_b.forEach(p => p.status = 'active');
  } else {
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
      const displayName = p.nama_punggung || p.nama;

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
            } else if (code.includes('rebound')) {
              btnClass = 'rebound';
            } else if (code.includes('block')) {
              btnClass = 'block';
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
              <button class="btn-player-action assist" onclick="recordPlayerEvent('${team}', ${p.id_personil}, 'assist', 0)" title="Assist">AST</button>
              <button class="btn-player-action rebound" onclick="recordPlayerEvent('${team}', ${p.id_personil}, 'rebound', 0)" title="Rebound">REB</button>
              <button class="btn-player-action block" onclick="recordPlayerEvent('${team}', ${p.id_personil}, 'block', 0)" title="Block">BLK</button>
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

      const subBtn = isBypassStarter ? '' : (p.status === 'active' 
        ? `<button class="btn-player-sub" onclick="togglePlayerStatus('${team}', ${p.id_personil}, 'bench')" title="Tarik ke Cadangan">⬇️ Out</button>`
        : `<button class="btn-player-sub" onclick="togglePlayerStatus('${team}', ${p.id_personil}, 'active')" title="Masukkan ke Lapangan">⬆️ In</button>`);

      const playerRowHtml = `
        <div class="player-row">
          <div class="player-info">
            <span class="player-number">#${p.nomor_punggung || '-'}</span>
            <span class="player-name" title="${p.nama}">${displayName}</span>
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
  let displaySeconds = timerSeconds;
  
  if (timerMode === 'down') {
    displaySeconds = timerDuration - timerSeconds;
    if (displaySeconds < 0) displaySeconds = 0;
  }

  const min = Math.floor(displaySeconds / 60);
  const sec = displaySeconds % 60;
  timerMin.textContent = formatNum(min);
  timerSec.textContent = formatNum(sec);
}

// Register Shot Clock Click Listeners
const scStartBtn = document.getElementById('btn-shotclock-start');
const scPauseBtn = document.getElementById('btn-shotclock-pause');
const scReset24Btn = document.getElementById('btn-shotclock-reset24');
const scReset14Btn = document.getElementById('btn-shotclock-reset14');

if (scStartBtn) scStartBtn.addEventListener('click', startShotClock);
if (scPauseBtn) scPauseBtn.addEventListener('click', pauseShotClock);
if (scReset24Btn) scReset24Btn.addEventListener('click', () => resetShotClock(24));
if (scReset14Btn) scReset14Btn.addEventListener('click', () => resetShotClock(14));

btnTimerStart.addEventListener('click', () => {
  if (timerInterval) return;
  
  if (showShotClock) {
    startShotClock();
  }
  
  // Hentikan timeout jika sedang berjalan saat timer dimulai
  if (timeoutEndTime) {
    stopTimeout();
  }

  let waktuPelaksanaanUpdate = null;
  if (matchData && (!matchData.waktu || matchData.waktu === "" || matchData.waktu === "0000-00-00 00:00:00" || matchData.waktu === "TBA")) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const date = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    waktuPelaksanaanUpdate = `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`;

    matchData.waktu = waktuPelaksanaanUpdate;
    localStorage.setItem('active_match_data', JSON.stringify(matchData));

    if (matchData.id_turnamen) {
      updateMatchInLocalBackup(matchData.id_turnamen, matchData.id_jadwal, waktuPelaksanaanUpdate);
    }
  }

  btnTimerStart.disabled = true;
  btnTimerStop.disabled = false;

  timerInterval = setInterval(() => {
    timerSeconds++;
    
    // Pengecekan jika timer hitungan mundur mencapai batas durasi (00:00)
    if (timerMode === 'down' && timerSeconds >= timerDuration) {
      timerSeconds = timerDuration; // Lock tepat pada target durasi
      clearInterval(timerInterval);
      timerInterval = null;
      btnTimerStart.disabled = false;
      btnTimerStop.disabled = true;
      
      updateTimerDisplay();
      updateTimeoutDisplay();
      broadcastState();
      
      playBuzzer();
      
      if (matchData && matchData.id_jadwal) {
        queueSyncAction('/api/desktop/update-timer', { 
          id_jadwal: matchData.id_jadwal, 
          seconds: timerSeconds, 
          is_running: 0,
          action: 'stop',
          current_period: matchData.current_period
        });
      }
      return;
    }

    updateTimerDisplay();
    updateTimeoutDisplay();
    broadcastState();
  }, 1000);

  if (matchData && matchData.id_jadwal) {
    const timerPayload = { 
      id_jadwal: matchData.id_jadwal, 
      seconds: timerSeconds, 
      is_running: 1,
      action: 'start',
      current_period: matchData.current_period
    };
    if (waktuPelaksanaanUpdate) {
      timerPayload.waktu_pelaksanaan = waktuPelaksanaanUpdate;
    }
    queueSyncAction('/api/desktop/update-timer', timerPayload);
  }
});

// Timer visual update (juga dipanggil saat timer berhenti/idle)
setInterval(() => {
  if (!timerInterval) {
    updateTimerDisplay();
    updateTimeoutDisplay();
  }
}, 1000);

let timeoutEndTime = null;
let timeoutBy = null;
let serverTimeOffset = 0;

function updateTimeoutDisplay() {
  if (!timeoutEndTime) {
    document.getElementById('timeout-active-overlay').style.display = 'none';
    return;
  }

  const now = new Date().getTime() + serverTimeOffset;
  const diff = Math.ceil((timeoutEndTime - now) / 1000);
  
  if (diff > 0) {
    document.getElementById('timeout-active-overlay').style.display = 'flex';
    document.getElementById('timeout-countdown-display').textContent = formatTime(diff);
    
    let label = "TIMEOUT";
    let teamName = "KEDUA TIM";
    if (timeoutBy) {
      if (timeoutBy === 'A' || timeoutBy == matchData.id_team_a) teamName = matchData.team_a_nama;
      else if (timeoutBy === 'B' || timeoutBy == matchData.id_team_b) teamName = matchData.team_b_nama;
    }
    document.getElementById('timeout-active-team').textContent = teamName;
  } else {
    // Timeout habis
    timeoutEndTime = null;
    document.getElementById('timeout-active-overlay').style.display = 'none';
    // Kita panggil stopTimeout agar server juga sinkron
    stopTimeout();
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

btnTimerStop.addEventListener('click', () => {
  if (!timerInterval) return;
  
  clearInterval(timerInterval);
  timerInterval = null;

  if (showShotClock) {
    pauseShotClock();
  }

  btnTimerStart.disabled = false;
  btnTimerStop.disabled = true;
  broadcastState();

  if (matchData && matchData.id_jadwal) {
    queueSyncAction('/api/desktop/update-timer', { 
      id_jadwal: matchData.id_jadwal, 
      seconds: timerSeconds, 
      is_running: 0,
      action: 'pause',
      current_period: matchData.current_period
    });
  }
});

btnTimerReset.addEventListener('click', () => {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerSeconds = 0;
  
  if (showShotClock) {
    resetShotClock(24);
    pauseShotClock();
  }
  
  updateTimerDisplay();
  btnTimerStart.disabled = false;
  btnTimerStop.disabled = true;
  broadcastState();

  if (matchData && matchData.id_jadwal) {
    queueSyncAction('/api/desktop/update-timer', { 
      id_jadwal: matchData.id_jadwal, 
      seconds: timerSeconds, 
      is_running: 0,
      action: 'reset',
      current_period: matchData.current_period
    });
  }
});

if (btnFinishMatch) {
  btnFinishMatch.addEventListener('click', () => {
    if (!matchData) return;
    if (confirm('Apakah Anda yakin ingin MENYELESAIKAN pertandingan ini? Skor akan disinkronkan, waktu di-set 0, dan status akan diubah menjadi "Selesai".')) {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      timerSeconds = 0;
      updateTimerDisplay();
      
      btnTimerStart.disabled = true;
      btnTimerStop.disabled = true;
      btnFinishMatch.disabled = true;
      
      matchData.status_pertandingan = 'selesai';
      broadcastState();

      // Update local backup with the finished status
      if (matchData.id_turnamen && fs) {
        const dir = getBackupDirectory();
        if (dir) {
          try {
            const filePath = path.join(dir, `tournament_${matchData.id_turnamen}.json`);
            if (fs.existsSync(filePath)) {
              const content = fs.readFileSync(filePath, 'utf8');
              const data = JSON.parse(content);
              if (data && Array.isArray(data.matches)) {
                const match = data.matches.find(m => m.id_jadwal == matchData.id_jadwal);
                if (match) {
                  match.status_pertandingan = 'selesai';
                  fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
                }
              }
            }
          } catch (e) {
            console.error("Gagal memperbarui status selesai di backup lokal:", e);
          }
        }
      }
      
      queueSyncAction('/api/desktop/update-timer', {
        id_jadwal: matchData.id_jadwal,
        action: 'finish',
        seconds: 0,
        is_running: 0,
        current_period: matchData.current_period
      });
      
      // Hapus data pertandingan aktif agar tidak dimuat lagi saat load/refresh
      localStorage.removeItem('active_match_data');

      if (ipcRenderer) {
        ipcRenderer.send('close-scoreboard');
      }

      // Tampilkan setup modal kembali
      mainLayout.style.display = 'none';
      setupModal.style.display = 'flex';

      alert('Pertandingan berhasil diselesaikan!');

      // Auto refresh list pertandingan menggunakan token yang tersimpan
      const savedToken = localStorage.getItem('temp_token');
      if (savedToken) {
        authTokenInput.value = savedToken;
        setTimeout(() => {
          btnDownload.click();
        }, 1500);
      }
    }
  });
}

// 7. FUNGSI BROADCAST KE VIDEOTRON
function broadcastState() {
  // Pastikan skor tenis & live game points terupdate sebelum broadcast
  updateMainScoresForTennis();

  let displaySeconds = timerSeconds;
  
  if (timerMode === 'down') {
    displaySeconds = timerDuration - timerSeconds;
    if (displaySeconds < 0) displaySeconds = 0;
  }

  const min = Math.floor(displaySeconds / 60);
  const sec = displaySeconds % 60;
  
  broadcastChannel.postMessage({
    type: 'UPDATE_STATE',
    data: {
      cabor: matchData ? matchData.cabor_nama : 'CABOR',
      id_cabor: matchData ? parseInt(matchData.id_cabor) : 0,
      max_set: matchData ? parseInt(matchData.max_set) : 3,
      tipe_skor: matchData ? matchData.tipe_skor : 'akumulasi',
      fase: matchData ? (matchData.fase ? `${matchData.kategori_nama} - ${matchData.fase}` : matchData.kategori_nama) : 'FASE',
      namaTurnamen: matchData ? matchData.nama_turnamen : 'TURNAMEN',
      teamAName: matchData ? matchData.team_a_nama : 'TEAM A',
      teamBName: matchData ? matchData.team_b_nama : 'TEAM B',
      scoreA: currentScoreA,
      scoreB: currentScoreB,
      foulA: matchData ? (matchData.foul_a || 0) : 0,
      foulB: matchData ? (matchData.foul_b || 0) : 0,
      hasFoul: matchData ? (matchData.id_cabor == 2 || matchData.id_cabor == 3) : false,
      timerText: `${formatNum(min)}:${formatNum(sec)}`,
      currentPeriod: matchData ? matchData.current_period : 'Babak 1',
      s1_1: matchData ? (matchData.s1_1 || 0) : 0,
      s1_2: matchData ? (matchData.s1_2 || 0) : 0,
      s2_1: matchData ? (matchData.s2_1 || 0) : 0,
      s2_2: matchData ? (matchData.s2_2 || 0) : 0,
      s3_1: matchData ? (matchData.s3_1 || 0) : 0,
      s3_2: matchData ? (matchData.s3_2 || 0) : 0,
      s4_1: matchData ? (matchData.s4_1 || 0) : 0,
      s4_2: matchData ? (matchData.s4_2 || 0) : 0,
      s5_1: matchData ? (matchData.s5_1 || 0) : 0,
      s5_2: matchData ? (matchData.s5_2 || 0) : 0,
      isTimeout: timeoutEndTime !== null,
      timeoutEndTime: timeoutEndTime,
      timeoutBy: timeoutBy,
      showShotClock: showShotClock,
      shotClock: shotClockSeconds
    }
  });
  lockUI();
}

function lockUI() {
  if (matchData && matchData.status_pertandingan === 'selesai') {
    // Disable all interactive elements
    document.querySelectorAll('button, input, select, textarea').forEach(el => {
      el.disabled = true;
    });
    // Show overlay dimming effect if exists
    const overlay = document.getElementById('ui-lock-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
    }
  }
}

// 8. UPDATE SKOR UTAMA
scoreAUp.addEventListener('click', () => {
  recordQuickScoreEvent('A', 1);
});

scoreBUp.addEventListener('click', () => {
  recordQuickScoreEvent('B', 1);
});

function recordQuickScoreEvent(team, points) {
  if (!matchData) return;

  // Tentukan tipe event dan bobot
  let tipeEvent = 'GOL';
  let label = 'Gol';
  let weight = points;
  let targetPoin = 'self';

  // Sesuaikan cabor
  const isBasket = (matchData.cabor_nama && matchData.cabor_nama.toLowerCase().includes('basket')) || matchData.id_cabor == 3;
  if (isBasket) {
    tipeEvent = `POIN_${points}`;
    label = `${points} Point`;
  } else {
    tipeEvent = 'GOL';
    label = 'Gol';
  }

  // Jika cabor_events ada, coba cari event bertipe GOL atau POIN_x
  if (matchData.cabor_events && matchData.cabor_events.length > 0) {
    const foundEvent = matchData.cabor_events.find(ev => ev.kode_event.toUpperCase() === tipeEvent);
    if (foundEvent) {
      targetPoin = foundEvent.target_poin || 'self';
      weight = parseInt(foundEvent.bobot_skor) || points;
      label = foundEvent.nama_event;
    }
  }

  // Tambahkan skor secara lokal di state operator
  let affectedScore = null;
  if (targetPoin === 'opponent') {
    if (team === 'A') {
      currentScoreB += weight;
      scoreBDisplay.textContent = currentScoreB;
      affectedScore = 'B';
    } else {
      currentScoreA += weight;
      scoreADisplay.textContent = currentScoreA;
      affectedScore = 'A';
    }
  } else {
    if (team === 'A') {
      currentScoreA += weight;
      scoreADisplay.textContent = currentScoreA;
      affectedScore = 'A';
    } else {
      currentScoreB += weight;
      scoreBDisplay.textContent = currentScoreB;
      affectedScore = 'B';
    }
  }

  // Set Score babak jika set-based cabor
  if (matchData.tipe_skor === 'set' && affectedScore) {
    const period = matchData.current_period || '';
    let setNum = 1;
    if (period.includes('2')) setNum = 2;
    else if (period.includes('3')) setNum = 3;
    else if (period.includes('4')) setNum = 4;
    else if (period.includes('5')) setNum = 5;
    
    const key = `s${setNum}_${affectedScore === 'A' ? 1 : 2}`;
    matchData[key] = (parseInt(matchData[key]) || 0) + weight;
  }

  const elapsedMinutes = Math.floor(timerSeconds / 60);

  // Buat payload event
  const eventPayload = {
    id_event: generateUUID(),
    id_jadwal: matchData.id_jadwal,
    id_personil: 0, // 0 artinya tanpa pemain / belum diisi
    id_team: team === 'A' ? matchData.id_team_a : matchData.id_team_b,
    jenis: tipeEvent.toLowerCase(),
    menit: elapsedMinutes,
    playerName: "", // Nama kosong sesuai permintaan
    teamType: team,
    target_poin: targetPoin,
    nilai: weight,
    periode: matchData.current_period || 'Babak 1',
    keterangan: ""
  };

  if (!matchData.events) matchData.events = [];
  matchData.events.unshift(eventPayload);
  localStorage.setItem('active_match_data', JSON.stringify(matchData));

  // Simpan skor terbaru secara lokal & broadcast
  saveMatchScoreLocally();
  broadcastState();

  // Kirim selebrasi ke layar videotron
  broadcastChannel.postMessage({
    type: 'GOAL_CELEBRATION',
    data: {
      player: tipeEvent === 'OWN_GOAL' ? 'Gol Bunuh Diri' : label,
      teamName: targetPoin === 'opponent' ? (team === 'A' ? matchData.team_b_nama : matchData.team_a_nama) : (team === 'A' ? matchData.team_a_nama : matchData.team_b_nama)
    }
  });

  // Antrekan sinkronisasi API ke server
  queueSyncAction('/api/desktop/sync-score', { id_jadwal: matchData.id_jadwal, skor_a: currentScoreA, skor_b: currentScoreB, foul_a: matchData.foul_a || 0, foul_b: matchData.foul_b || 0 });
  queueSyncAction('/api/desktop/add-event', eventPayload);
  queueSyncAction('/api/desktop/update-timer', { id_jadwal: matchData.id_jadwal, seconds: timerSeconds, is_running: timerInterval ? 1 : 0 });

  renderTimeline();
}

btnResetFoulA.addEventListener('click', () => {
  if (confirm("Reset akumulasi foul Tim A menjadi 0?")) {
    matchData.foul_a = 0;
    foulCountA.textContent = 0;
    foulCountA.style.color = '#fff';
    saveMatchScoreLocally();
    broadcastState();
    
    const eventPayload = {
      id_event: generateUUID(),
      id_jadwal: matchData.id_jadwal,
      id_personil: 0,
      id_team: matchData.id_team_a,
      jenis: 'reset_foul',
      menit: Math.floor(timerSeconds / 60),
      playerName: 'Reset Foul',
      teamType: 'A',
      target_poin: 'none',
      nilai: 0,
      periode: matchData.current_period || 'Babak 1',
      keterangan: 'Foul Reset'
    };
    if (!matchData.events) matchData.events = [];
    matchData.events.unshift(eventPayload);
    renderTimeline();
    
    queueSyncAction('/api/desktop/add-event', eventPayload);
    queueSyncAction('/api/desktop/sync-score', { id_jadwal: matchData.id_jadwal, skor_a: currentScoreA, skor_b: currentScoreB, foul_a: 0, foul_b: matchData.foul_b || 0 });
  }
});

btnResetFoulB.addEventListener('click', () => {
  if (confirm("Reset akumulasi foul Tim B menjadi 0?")) {
    matchData.foul_b = 0;
    foulCountB.textContent = 0;
    foulCountB.style.color = '#fff';
    saveMatchScoreLocally();
    broadcastState();
    
    const eventPayload = {
      id_event: generateUUID(),
      id_jadwal: matchData.id_jadwal,
      id_personil: 0,
      id_team: matchData.id_team_b,
      jenis: 'reset_foul',
      menit: Math.floor(timerSeconds / 60),
      playerName: 'Reset Foul',
      teamType: 'B',
      target_poin: 'none',
      nilai: 0,
      periode: matchData.current_period || 'Babak 1',
      keterangan: 'Foul Reset'
    };
    if (!matchData.events) matchData.events = [];
    matchData.events.unshift(eventPayload);
    renderTimeline();
    
    queueSyncAction('/api/desktop/add-event', eventPayload);
    queueSyncAction('/api/desktop/sync-score', { id_jadwal: matchData.id_jadwal, skor_a: currentScoreA, skor_b: currentScoreB, foul_a: matchData.foul_a || 0, foul_b: 0 });
  }
});

window.setAllAsStarter = function(team) {
  if (!matchData) return;
  if (!confirm(`Masukkan semua pemain ${team === 'A' ? matchData.team_a_nama : matchData.team_b_nama} sebagai Starter (Menit 0)?`)) return;

  const players = team === 'A' ? matchData.players_a : matchData.players_b;
  const teamId = team === 'A' ? matchData.id_team_a : matchData.id_team_b;

  if (players && players.length > 0) {
    players.forEach(p => {
      if (p.status !== 'active') {
        p.status = 'active';
        
        const eventPayload = {
          id_event: generateUUID(),
          id_jadwal: matchData.id_jadwal,
          id_personil: p.id_personil,
          id_team: teamId,
          jenis: 'starter',
          menit: 0,
          playerName: p.nama,
          teamType: team,
          target_poin: 'none',
          nilai: 0,
          periode: matchData.current_period || 'Babak 1'
        };

        if (!matchData.events) matchData.events = [];
        matchData.events.unshift(eventPayload);
        queueSyncAction('/api/desktop/add-event', eventPayload);
      }
    });

    localStorage.setItem('active_match_data', JSON.stringify(matchData));
    renderRoster();
    renderTimeline();
    broadcastState();
  }
};

function saveMatchScoreLocally() {
  matchData.skor_a = currentScoreA;
  matchData.skor_b = currentScoreB;
  localStorage.setItem('active_match_data', JSON.stringify(matchData));
}

// --- TIMEOUT CONTROLS ---
window.startTimeout = function() {
  const duration = parseInt(document.getElementById('timeout-duration-input').value) || 60;
  const team = document.getElementById('timeout-team-select').value;
  
  // Pause timer first if running
  if (timerInterval) {
    btnTimerStop.click();
  }

  const payload = {
    action: 'timeout_start',
    duration: duration,
    timeout_by: team === 'both' ? 'both' : (team === 'A' ? matchData.id_team_a : matchData.id_team_b),
    id_jadwal: matchData.id_jadwal
  };

  // Optimistic update locally
  timeoutEndTime = new Date().getTime() + (duration * 1000);
  timeoutBy = team;
  document.getElementById('timeout-modal').style.display = 'none';
  
  // Log event
  let teamName = "KEDUA TIM";
  if(team === 'A') teamName = matchData.team_a_nama;
  if(team === 'B') teamName = matchData.team_b_nama;
  
  const eventPayload = {
    id_event: generateUUID(),
    id_jadwal: matchData.id_jadwal,
    id_personil: 0,
    id_team: (team === 'A' ? matchData.id_team_a : (team === 'B' ? matchData.id_team_b : 0)),
    jenis: 'timeout',
    menit: Math.floor(timerSeconds / 60),
    playerName: 'TIMEOUT',
    teamType: team,
    target_poin: 'none',
    nilai: 0,
    periode: matchData.current_period || 'Babak 1',
    keterangan: 'Timeout oleh ' + teamName
  };
  
  if (!matchData.events) matchData.events = [];
  matchData.events.unshift(eventPayload);
  renderTimeline();
  broadcastState();

  queueSyncAction('/api/desktop/update-timer', payload);
  queueSyncAction('/api/desktop/add-event', eventPayload);
};

window.stopTimeout = function() {
  timeoutEndTime = null;
  timeoutBy = null;
  document.getElementById('timeout-active-overlay').style.display = 'none';
  broadcastState();

  if (matchData && matchData.id_jadwal) {
    queueSyncAction('/api/desktop/update-timer', { id_jadwal: matchData.id_jadwal, action: 'timeout_stop' });
  }
};

// Wire up timeout buttons
document.getElementById('btn-timeout-trigger').addEventListener('click', () => {
  document.getElementById('timeout-modal').style.display = 'flex';
  // Update team labels in modal
  document.getElementById('opt-team-a').textContent = matchData.team_a_nama.toUpperCase();
  document.getElementById('opt-team-b').textContent = matchData.team_b_nama.toUpperCase();
});

document.getElementById('btn-timeout-cancel').addEventListener('click', () => {
  document.getElementById('timeout-modal').style.display = 'none';
});

document.getElementById('btn-timeout-start').addEventListener('click', () => {
  startTimeout();
});

document.getElementById('btn-timeout-stop').addEventListener('click', () => {
  stopTimeout();
});

// Wire up edit event modal buttons
document.getElementById('btn-edit-event-cancel').addEventListener('click', () => {
  document.getElementById('edit-event-modal').style.display = 'none';
});

document.getElementById('btn-edit-event-save').addEventListener('click', () => {
  saveEditedEventLocally();
});

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

// BUZZER TRIGGERS
const btnBuzzerTrigger = document.getElementById('btn-buzzer-trigger');
const audioBuzzer = document.getElementById('audio-buzzer');

if (btnBuzzerTrigger) {
  btnBuzzerTrigger.addEventListener('click', () => {
    playBuzzer();
  });
}

function playBuzzer() {
  if (audioBuzzer) {
    audioBuzzer.currentTime = 0;
    audioBuzzer.play().catch(e => console.log("Gagal memutar audio buzzer:", e));
  }
}

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
    let affectedScore = null;
    let affectedSet = null;
    let setScoreKey = '';

    if (targetPoin === 'opponent') {
      if (team === 'A') {
        currentScoreB += points;
        scoreBDisplay.textContent = currentScoreB;
        affectedScore = 'B';
      } else {
        currentScoreA += points;
        scoreADisplay.textContent = currentScoreA;
        affectedScore = 'A';
      }
    } else {
      if (team === 'A') {
        currentScoreA += points;
        scoreADisplay.textContent = currentScoreA;
        affectedScore = 'A';
      } else {
        currentScoreB += points;
        scoreBDisplay.textContent = currentScoreB;
        affectedScore = 'B';
      }
    }

    // Local set score calculation for Set-based sports
    if (matchData.tipe_skor === 'set' && affectedScore) {
      const period = matchData.current_period || '';
      let setNum = 1;
      if (period.includes('2')) setNum = 2;
      else if (period.includes('3')) setNum = 3;
      else if (period.includes('4')) setNum = 4;
      else if (period.includes('5')) setNum = 5;
      
      const key = `s${setNum}_${affectedScore === 'A' ? 1 : 2}`;
      matchData[key] = (parseInt(matchData[key]) || 0) + points;
    }
  }
  
  if (eventType === 'foul') {
    if (team === 'A') {
        matchData.foul_a = (parseInt(matchData.foul_a) || 0) + 1;
        foulCountA.textContent = matchData.foul_a;
        if (matchData.foul_a >= 5) foulCountA.style.color = '#ff4757';
    } else {
        matchData.foul_b = (parseInt(matchData.foul_b) || 0) + 1;
        foulCountB.textContent = matchData.foul_b;
        if (matchData.foul_b >= 5) foulCountB.style.color = '#ff4757';
    }
  }

  if (weight > 0 || eventType === 'foul' || eventType === 'pause') {
    saveMatchScoreLocally();
    broadcastState();

    if (points > 0) {
        broadcastChannel.postMessage({
          type: 'GOAL_CELEBRATION',
          data: {
            player: eventType === 'own_goal' ? 'Gol Bunuh Diri' : playerName,
            teamName: targetPoin === 'opponent' ? (team === 'A' ? matchData.team_b_nama : matchData.team_a_nama) : teamName
          }
        });
    } else if (eventType === 'pause') {
        broadcastChannel.postMessage({
          type: 'GOAL_CELEBRATION',
          data: {
            player: 'TIME OUT',
            teamName: teamName
          }
        });
    }

    queueSyncAction('/api/desktop/sync-score', { id_jadwal: matchData.id_jadwal, skor_a: currentScoreA, skor_b: currentScoreB, foul_a: matchData.foul_a || 0, foul_b: matchData.foul_b || 0 });
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

  if (weight > 0) {
    let affectedScore = null;
    if (targetPoin === 'opponent') {
      if (team === 'A') {
        currentScoreB += weight;
        scoreBDisplay.textContent = currentScoreB;
        affectedScore = 'B';
      } else {
        currentScoreA += weight;
        scoreADisplay.textContent = currentScoreA;
        affectedScore = 'A';
      }
    } else {
      if (team === 'A') {
        currentScoreA += weight;
        scoreADisplay.textContent = currentScoreA;
        affectedScore = 'A';
      } else {
        currentScoreB += weight;
        scoreBDisplay.textContent = currentScoreB;
        affectedScore = 'B';
      }
    }

    // Local set score calculation for Set-based sports
    if (matchData.tipe_skor === 'set' && affectedScore) {
      const period = matchData.current_period || '';
      let setNum = 1;
      if (period.includes('2')) setNum = 2;
      else if (period.includes('3')) setNum = 3;
      else if (period.includes('4')) setNum = 4;
      else if (period.includes('5')) setNum = 5;
      
      const key = `s${setNum}_${affectedScore === 'A' ? 1 : 2}`;
      matchData[key] = (parseInt(matchData[key]) || 0) + weight;
    }
  }

  if (tipeEvent === 'FOUL') {
    if (team === 'A') {
        matchData.foul_a = (parseInt(matchData.foul_a) || 0) + 1;
        foulCountA.textContent = matchData.foul_a;
        if (matchData.foul_a >= 5) foulCountA.style.color = '#ff4757';
    } else {
        matchData.foul_b = (parseInt(matchData.foul_b) || 0) + 1;
        foulCountB.textContent = matchData.foul_b;
        if (matchData.foul_b >= 5) foulCountB.style.color = '#ff4757';
    }
  }

  if (weight > 0 || tipeEvent === 'FOUL' || tipeEvent === 'PAUSE') {
    saveMatchScoreLocally();
    broadcastState();

    if (weight > 0) {
        broadcastChannel.postMessage({
          type: 'GOAL_CELEBRATION',
          data: {
            player: tipeEvent === 'OWN_GOAL' ? 'Gol Bunuh Diri' : label,
            teamName: targetPoin === 'opponent' ? (team === 'A' ? matchData.team_b_nama : matchData.team_a_nama) : teamName
          }
        });
    } else if (tipeEvent === 'PAUSE') {
        broadcastChannel.postMessage({
          type: 'GOAL_CELEBRATION',
          data: {
            player: 'TIME OUT',
            teamName: teamName
          }
        });
    }

    queueSyncAction('/api/desktop/sync-score', { id_jadwal: matchData.id_jadwal, skor_a: currentScoreA, skor_b: currentScoreB, foul_a: matchData.foul_a || 0, foul_b: matchData.foul_b || 0 });
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
    const customIcon = e.ikon || '';
    
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

    const iconHtml = customIcon ? `<span class="me-1">${customIcon}</span>` : '';

    item.innerHTML = `
      <span class="timeline-time">${e.menit}'</span>
      <span class="timeline-badge ${badgeClass}">${iconHtml}${badgeText}</span>
      <span class="timeline-text"><strong>${e.playerName || '(Nama Kosong)'}</strong> (${e.teamType === 'A' ? matchData.team_a_nama : matchData.team_b_nama})</span>
      <div style="display: flex; gap: 5px;">
        <button class="timeline-edit" onclick="editEventLocally('${e.id_event}')" style="background: transparent; color: #ffa502; border: none; border-radius: 4px; padding: 0.2rem 0.5rem; font-size: 0.75rem; cursor: pointer; display: flex; align-items: center; gap: 3px;"><i class="fa fa-edit"></i> Edit</button>
        <button class="timeline-delete" onclick="deleteEventLocally('${e.id_event}')"><i class="fa fa-trash"></i> Hapus</button>
      </div>
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
      let affectedScore = null;

      if (targetPoin === 'opponent') {
        if (deletedEvent.teamType === 'A' && currentScoreB > 0) {
          currentScoreB = Math.max(0, currentScoreB - weight);
          scoreBDisplay.textContent = currentScoreB;
          affectedScore = 'B';
        } else if (deletedEvent.teamType === 'B' && currentScoreA > 0) {
          currentScoreA = Math.max(0, currentScoreA - weight);
          scoreADisplay.textContent = currentScoreA;
          affectedScore = 'A';
        }
      } else {
        if (deletedEvent.teamType === 'A' && currentScoreA > 0) {
          currentScoreA = Math.max(0, currentScoreA - weight);
          scoreADisplay.textContent = currentScoreA;
          affectedScore = 'A';
        } else if (deletedEvent.teamType === 'B' && currentScoreB > 0) {
          currentScoreB = Math.max(0, currentScoreB - weight);
          scoreBDisplay.textContent = currentScoreB;
          affectedScore = 'B';
        }
      }

      // Local set score subtraction
      if (matchData.tipe_skor === 'set' && affectedScore) {
        const period = deletedEvent.periode || '';
        let setNum = 1;
        if (period.includes('2')) setNum = 2;
        if (period.includes('3')) setNum = 3;
        
        const key = `s${setNum}_${affectedScore === 'A' ? 1 : 2}`;
        matchData[key] = Math.max(0, (parseInt(matchData[key]) || 0) - weight);
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

window.editEventLocally = function(eventId) {
  if (!matchData) return;
  const event = matchData.events.find(e => e.id_event === eventId);
  if (!event) return;

  const modal = document.getElementById('edit-event-modal');
  const modalLabel = document.getElementById('edit-modal-team-label');
  const eventIdInput = document.getElementById('edit-event-id');
  const eventTeamInput = document.getElementById('edit-event-team');
  const playerSelect = document.getElementById('edit-event-player-select');
  const minuteInput = document.getElementById('edit-event-minute');

  if (!modal) return;

  eventIdInput.value = eventId;
  eventTeamInput.value = event.teamType;
  modalLabel.textContent = `Tim: ${event.teamType === 'A' ? matchData.team_a_nama : matchData.team_b_nama}`;
  minuteInput.value = event.menit;

  playerSelect.innerHTML = '';
  
  const optAnon = document.createElement('option');
  optAnon.value = "0";
  optAnon.textContent = "-- Tanpa Pemain / Anonim --";
  playerSelect.appendChild(optAnon);

  const players = event.teamType === 'A' ? matchData.players_a : matchData.players_b;
  if (players && players.length > 0) {
    players.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id_personil;
      opt.textContent = `${p.nama} (#${p.nomor_punggung || '-'})`;
      if (p.id_personil == event.id_personil) {
        opt.selected = true;
      }
      playerSelect.appendChild(opt);
    });
  }

  modal.style.display = 'flex';
};

function saveEditedEventLocally() {
  const modal = document.getElementById('edit-event-modal');
  const eventId = document.getElementById('edit-event-id').value;
  const playerSelect = document.getElementById('edit-event-player-select');
  const minuteInput = document.getElementById('edit-event-minute');

  if (!matchData || !eventId) return;

  const eventIndex = matchData.events.findIndex(e => e.id_event === eventId);
  if (eventIndex === -1) return;

  const oldEvent = matchData.events[eventIndex];
  const newPlayerId = parseInt(playerSelect.value) || 0;
  const newMinute = parseInt(minuteInput.value) || 0;

  let newPlayerName = "";
  if (newPlayerId > 0) {
    const players = oldEvent.teamType === 'A' ? matchData.players_a : matchData.players_b;
    const player = players.find(p => p.id_personil == newPlayerId);
    if (player) {
      newPlayerName = `${player.nama} (#${player.nomor_punggung || '-'})`;
    }
  }

  // 1. Antrekan delete event lama ke server
  queueSyncAction('/api/desktop/delete-event', { id_event: oldEvent.id_event });

  // 2. Perbarui data event
  oldEvent.id_personil = newPlayerId;
  oldEvent.playerName = newPlayerName;
  oldEvent.menit = newMinute;
  
  const newEventId = generateUUID();
  oldEvent.id_event = newEventId;

  localStorage.setItem('active_match_data', JSON.stringify(matchData));

  // 3. Antrekan add event ter-update ke server
  queueSyncAction('/api/desktop/add-event', oldEvent);

  renderTimeline();
  modal.style.display = 'none';
}

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
    const currentToken = (matchData.token && matchData.token !== 'offline_mode')
      ? matchData.token
      : (localStorage.getItem('temp_token') || 'offline_mode');

    const response = await fetch(`${matchData.serverUrl}${activeItem.endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentToken}`,
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

    // Auto refresh matches list using saved token/PIN
    const savedToken = localStorage.getItem('temp_token');
    if (savedToken) {
      authTokenInput.value = savedToken;
      btnDownload.click();
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

// --- AUTO-BACKUP SYSTEM UTILITIES ---
function getBackupDirectory() {
  if (!fs || !path) return null;
  const home = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME, 'Library', 'Application Support') : path.join(process.env.HOME, '.config'));
  const dir = path.join(home, 'TurnamenScorer', 'offline_backups');
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  } catch (e) {
    console.error("Gagal membuat direktori backup:", e);
    return null;
  }
}

function saveLocalBackup(tournamentId, data) {
  const dir = getBackupDirectory();
  if (!dir) return;
  try {
    const token = localStorage.getItem('temp_token');
    if (token && !data.operator_token) {
      data.operator_token = token;
    }
    const filePath = path.join(dir, `tournament_${tournamentId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
  } catch (e) {
    console.error(`Gagal menyimpan file auto-backup tournament_${tournamentId}:`, e);
  }
}

function updateMatchInLocalBackup(tournamentId, matchId, waktuVal) {
  const dir = getBackupDirectory();
  if (!dir) return;
  try {
    const filePath = path.join(dir, `tournament_${tournamentId}.json`);
    if (fs && fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      if (data && Array.isArray(data.matches)) {
        const match = data.matches.find(m => m.id_jadwal == matchId);
        if (match) {
          match.waktu = waktuVal;
          fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
          console.log(`[Backup] Berhasil memperbarui waktu pelaksanaan match ${matchId} di backup lokal.`);
        }
      }
    }
  } catch (e) {
    console.error(`[Backup] Gagal memperbarui backup lokal untuk match ${matchId}:`, e);
  }
}

function getLocalBackupsList() {
  const dir = getBackupDirectory();
  if (!dir) return [];
  try {
    const files = fs.readdirSync(dir);
    const list = [];
    files.forEach(file => {
      if (file.startsWith('tournament_') && file.endsWith('.json')) {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        try {
          const data = JSON.parse(content);
          if (data && data.tournament && Array.isArray(data.matches)) {
            list.push({
              id_turnamen: data.tournament.id_turnamen,
              nama_turnamen: data.tournament.nama_turnamen,
              cabor_nama: data.tournament.cabor_nama,
              mtime: stats.mtime,
              file: file,
              data: data
            });
          }
        } catch (je) {
          console.error(`JSON Parse error for ${file}:`, je);
        }
      }
    });
    return list.sort((a, b) => b.mtime - a.mtime);
  } catch (e) {
    console.error("Gagal membaca daftar file backup:", e);
    return [];
  }
}

// AUTO RESTORE SESSION ON LOAD
window.addEventListener('load', () => {
  // Handle Capacitor (Android/iOS Tablet) Native Integrations
  if (window.Capacitor && window.Capacitor.Plugins) {
    const { ScreenOrientation } = window.Capacitor.Plugins;
    if (ScreenOrientation) {
      ScreenOrientation.lock({ orientation: 'landscape' })
        .then(() => console.log('Orientasi dikunci ke Landscape (Capacitor)'))
        .catch((err) => console.warn('Gagal mengunci orientasi:', err));
    }
  }

  // Restore server URL from localStorage if exists, otherwise fallback to default
  const savedServerUrl = localStorage.getItem('temp_server_url');
  if (savedServerUrl) {
    serverUrlInput.value = savedServerUrl;
  } else {
    serverUrlInput.value = 'https://turnamen.info';
  }

  // Restore token/PIN from localStorage if exists
  const savedToken = localStorage.getItem('temp_token');
  if (savedToken) {
    authTokenInput.value = savedToken;
  }

  const savedData = localStorage.getItem('active_match_data');
  if (savedData) {
    matchData = JSON.parse(savedData);
    setupModal.style.display = 'none';
    mainLayout.style.display = 'flex';
    initMatchPanel();
  } else if (savedToken) {
    // Automatically trigger match list loading on startup if PIN exists
    console.log("[Setup] Menemukan token tersimpan, memuat data pertandingan secara otomatis...");
    btnDownload.click();
  }

  // Handle Offline Tournament Import
  const offlineFileInput = document.getElementById('offline-file-input');
  const offlineMatchSelector = document.getElementById('offline-match-selector');
  const offlineMatchSelect = document.getElementById('offline-match-select');
  const btnStartOffline = document.getElementById('btn-start-offline');
  let offlineTournamentData = null;

  if (offlineFileInput) {
    offlineFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(evt) {
        try {
          const data = JSON.parse(evt.target.result);
          if (data && data.status && data.tournament && Array.isArray(data.matches)) {
            offlineTournamentData = data;
            
            // Populate select, excluding finished matches
            offlineMatchSelect.innerHTML = '';
            const activeMatches = (data.matches || []).filter(m => m.status_pertandingan !== 'selesai');
            if (activeMatches.length === 0) {
              const opt = document.createElement('option');
              opt.value = "";
              opt.textContent = "-- Tidak ada pertandingan berjalan / belum selesai --";
              offlineMatchSelect.appendChild(opt);
            } else {
              activeMatches.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id_jadwal;
                opt.textContent = `[${m.kategori_nama} - ${m.fase}] ${m.team_a_nama} vs ${m.team_b_nama}`;
                offlineMatchSelect.appendChild(opt);
              });
            }

            offlineMatchSelector.style.display = 'block';
            showSetupStatus(`Berhasil memuat turnamen: ${data.tournament.nama_turnamen} (${data.matches.length} pertandingan). Silakan pilih pertandingan dan klik tombol hijau.`, "success");
          } else {
            showSetupStatus("Format file JSON paket kejuaraan tidak valid!", "error");
            offlineMatchSelector.style.display = 'none';
          }
        } catch (err) {
          showSetupStatus("Gagal membaca file JSON kejuaraan!", "error");
          offlineMatchSelector.style.display = 'none';
        }
      };
      reader.readAsText(file);
    });
  }

  if (btnStartOffline) {
    btnStartOffline.addEventListener('click', () => {
      if (!offlineTournamentData) return;
      const selectedId = offlineMatchSelect.value;
      const match = offlineTournamentData.matches.find(m => m.id_jadwal == selectedId);
      if (!match) {
        showSetupStatus("Pertandingan tidak ditemukan di paket offline!", "error");
        return;
      }

      // Simpan data sebagai active match
      matchData = match;
      matchData.serverUrl = localStorage.getItem('temp_server_url') || 'https://turnamen.info';
      matchData.token = localStorage.getItem('temp_token') || 'offline_mode';

      localStorage.setItem('active_match_data', JSON.stringify(matchData));
      localStorage.setItem('sync_queue', JSON.stringify([]));

      initMatchPanel();
      
      // Deteksi status koneksi internet secara dinamis
      updateOnlineStatus();

      showSetupStatus("Memulai pertandingan offline...", "success");
      setTimeout(() => {
        setupModal.style.display = 'none';
        mainLayout.style.display = 'flex';
      }, 1000);
    });
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

  // --- AUTO-BACKUP UI & LOGIC INTEGRATION ---
  const localBackupsContainer = document.getElementById('local-backups-container');
  const localBackupsSelect = document.getElementById('local-backups-select');
  const localBackupsMatchWrapper = document.getElementById('local-backups-match-wrapper');
  const localBackupsMatchSelect = document.getElementById('local-backups-match-select');
  const btnStartLocalBackup = document.getElementById('btn-start-local-backup');
  let loadedBackupData = null;

  function renderAutoBackupsUI() {
    if (!localBackupsContainer || !localBackupsSelect || !fs) return;
    
    const backups = getLocalBackupsList();
    if (backups.length === 0) {
      localBackupsContainer.style.display = 'none';
      return;
    }

    localBackupsSelect.innerHTML = '<option value="">-- Pilih Cadangan Turnamen --</option>';
    backups.forEach(b => {
      const timeStr = new Date(b.mtime).toLocaleString('id-ID', { hour12: false });
      const opt = document.createElement('option');
      opt.value = b.id_turnamen;
      opt.textContent = `${b.nama_turnamen} [${b.cabor_nama}] (${timeStr})`;
      opt.dataset.json = JSON.stringify(b.data);
      localBackupsSelect.appendChild(opt);
    });

    localBackupsContainer.style.display = 'none';
  }

  if (localBackupsSelect) {
    localBackupsSelect.addEventListener('change', () => {
      const selectedOpt = localBackupsSelect.options[localBackupsSelect.selectedIndex];
      if (!selectedOpt || !selectedOpt.value) {
        localBackupsMatchWrapper.style.display = 'none';
        loadedBackupData = null;
        return;
      }

      try {
        const data = JSON.parse(selectedOpt.dataset.json);
        loadedBackupData = data;
        
        // Populate matches of this backup, excluding finished matches
        localBackupsMatchSelect.innerHTML = '';
        const activeMatches = (data.matches || []).filter(m => m.status_pertandingan !== 'selesai');
        if (activeMatches.length === 0) {
          const opt = document.createElement('option');
          opt.value = "";
          opt.textContent = "-- Tidak ada pertandingan berjalan / belum selesai --";
          localBackupsMatchSelect.appendChild(opt);
        } else {
          activeMatches.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id_jadwal;
            opt.textContent = `[${m.kategori_nama} - ${m.fase}] ${m.team_a_nama} vs ${m.team_b_nama}`;
            localBackupsMatchSelect.appendChild(opt);
          });
        }

        localBackupsMatchWrapper.style.display = 'block';
      } catch (err) {
        console.error("Gagal memproses detail data turnamen lokal:", err);
        localBackupsMatchWrapper.style.display = 'none';
        loadedBackupData = null;
      }
    });
  }

  if (btnStartLocalBackup) {
    btnStartLocalBackup.addEventListener('click', () => {
      if (!loadedBackupData) return;
      const selectedId = localBackupsMatchSelect.value;
      const match = loadedBackupData.matches.find(m => m.id_jadwal == selectedId);
      if (!match) {
        showSetupStatus("Pertandingan tidak ditemukan di file cadangan laptop!", "error");
        return;
      }

      // Simpan data sebagai active match
      matchData = match;
      matchData.serverUrl = localStorage.getItem('temp_server_url') || 'https://turnamen.info';
      matchData.token = localStorage.getItem('temp_token') || 'offline_mode';

      localStorage.setItem('active_match_data', JSON.stringify(matchData));
      localStorage.setItem('sync_queue', JSON.stringify([]));

      initMatchPanel();
      
      // Deteksi status koneksi internet secara dinamis
      updateOnlineStatus();

      showSetupStatus("Memulai pertandingan dari cadangan laptop...", "success");
      setTimeout(() => {
        setupModal.style.display = 'none';
        mainLayout.style.display = 'flex';
      }, 1000);
    });
  }

  // Background Auto-Backup Service (Silent download)
  async function runBackgroundBackup() {
    const serverUrl = localStorage.getItem('temp_server_url');
    const token = localStorage.getItem('temp_token');
    
    if (!serverUrl || !token || !navigator.onLine || !fs) return;
    
    try {
      const res = await fetch(`${serverUrl}/api/desktop/active-tournaments`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const result = await res.json();
      if (res.status === 200 && result.status && Array.isArray(result.tournaments)) {
        console.log(`[Auto-Backup] Menemukan ${result.tournaments.length} turnamen aktif untuk dicadangkan...`);
        
        const activeIds = result.tournaments.map(t => Number(t.id_turnamen));
        
        // Hapus berkas cadangan lokal dari turnamen yang sudah tidak aktif / selesai di server
        const currentBackups = getLocalBackupsList();
        currentBackups.forEach(b => {
          if (!activeIds.includes(Number(b.id_turnamen))) {
            try {
              const filePath = path.join(getBackupDirectory(), b.file);
              fs.unlinkSync(filePath);
              console.log(`[Auto-Backup] Menghapus cadangan lama yang sudah selesai: ${b.nama_turnamen}`);
            } catch (err) {
              console.error("Gagal menghapus cadangan lama:", err);
            }
          }
        });

        for (const t of result.tournaments) {
          const detailRes = await fetch(`${serverUrl}/api/desktop/download-tournament/${t.id_turnamen}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          const detailResult = await detailRes.json();
          if (detailRes.status === 200 && detailResult.status) {
            saveLocalBackup(t.id_turnamen, detailResult);
            console.log(`[Auto-Backup] Berhasil mencadangkan turnamen: ${t.nama_turnamen}`);
          }
        }
        renderAutoBackupsUI();
      }
    } catch (e) {
      console.warn("[Auto-Backup] Gagal melakukan pencadangan otomatis di latar belakang:", e);
    }
  }

  // Render cadangan lokal yang sudah ada sebelumnya
  renderAutoBackupsUI();

  // Jalankan backup background (jika online & login terverifikasi)
  runBackgroundBackup();

  // --- QR CODE SCANNER FUNCTIONALITY ---
  const btnScanQr = document.getElementById('btn-scan-qr');
  const qrScannerOverlay = document.getElementById('qr-scanner-overlay');
  const qrVideo = document.getElementById('qr-video');
  const btnCancelScan = document.getElementById('btn-cancel-scan');
  const qrScanError = document.getElementById('qr-scan-error');

  let qrStream = null;
  let qrAnimationId = null;

  if (btnScanQr) {
    btnScanQr.addEventListener('click', () => {
      openQRScanner();
    });
  }

  if (btnCancelScan) {
    btnCancelScan.addEventListener('click', () => {
      closeQRScanner();
    });
  }

  async function openQRScanner() {
    qrScanError.style.display = 'none';
    qrScannerOverlay.style.display = 'flex';

    try {
      qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      qrVideo.srcObject = qrStream;
      qrVideo.setAttribute("playsinline", true); // required to tell iOS safari we don't want fullscreen
      qrVideo.play();
      qrAnimationId = requestAnimationFrame(tickQRScanner);
    } catch (err) {
      console.error("Camera access failed:", err);
      qrScanError.textContent = "Gagal mengakses kamera. Pastikan izin kamera telah diberikan.";
      qrScanError.style.display = 'block';
    }
  }

  function closeQRScanner() {
    if (qrAnimationId) {
      cancelAnimationFrame(qrAnimationId);
      qrAnimationId = null;
    }
    if (qrStream) {
      qrStream.getTracks().forEach(track => track.stop());
      qrStream = null;
    }
    qrVideo.srcObject = null;
    qrScannerOverlay.style.display = 'none';
  }

  function tickQRScanner() {
    if (qrVideo.readyState === qrVideo.HAVE_ENOUGH_DATA) {
      // Create offscreen canvas for decoding
      const canvas = document.createElement('canvas');
      canvas.width = qrVideo.videoWidth;
      canvas.height = qrVideo.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(qrVideo, 0, 0, canvas.width, canvas.height);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // Ensure jsQR is loaded
      if (typeof jsQR !== 'undefined') {
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code) {
          console.log("[QR Scanner] Found code:", code.data);
          let parsedData = parseQRData(code.data);
          if (parsedData) {
            // Success! Populate and trigger download
            serverUrlInput.value = parsedData.server;
            authTokenInput.value = parsedData.pin;
            closeQRScanner();
            btnDownload.click();
            return;
          }
        }
      }
    }
    if (qrScannerOverlay.style.display === 'flex') {
      qrAnimationId = requestAnimationFrame(tickQRScanner);
    }
  }

  function parseQRData(dataStr) {
    dataStr = dataStr.trim();
    // Try parsing as JSON first
    try {
      if (dataStr.startsWith('{')) {
        const obj = JSON.parse(dataStr);
        if (obj.server && obj.pin) {
          return { server: obj.server.trim(), pin: obj.pin.trim() };
        }
      }
    } catch (e) {
      console.warn("JSON parsing failed, trying raw format", e);
    }

    // Try parsing as url-pin style: e.g. "https://turnamen.info|123456"
    if (dataStr.includes('|')) {
      const parts = dataStr.split('|');
      if (parts.length >= 2) {
        return { server: parts[0].trim(), pin: parts[1].trim() };
      }
    }

    // Try parsing as query param style: e.g. "https://turnamen.info/operator?pin=123456" or custom scheme
    try {
      if (dataStr.startsWith('http://') || dataStr.startsWith('https://')) {
        const url = new URL(dataStr);
        const pin = url.searchParams.get('pin');
        if (pin) {
          const server = url.origin + url.pathname.replace(/\/operator\/?$/, '').replace(/\/$/, '');
          return { server: server, pin: pin.trim() };
        }
      }
    } catch (e) {
      console.warn("URL parsing failed", e);
    }

    return null;
  }
});
