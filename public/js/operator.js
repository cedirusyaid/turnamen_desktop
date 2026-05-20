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

// DOM ELEMENTS - SETUP
const setupModal = document.getElementById('setup-modal');
const serverUrlInput = document.getElementById('server-url');
const matchIdInput = document.getElementById('match-id');
const authTokenInput = document.getElementById('auth-token');
const btnDownload = document.getElementById('btn-download');
const setupStatus = document.getElementById('setup-status');

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

const playerSelectA = document.getElementById('player-select-a');
const eventTypeA = document.getElementById('event-type-a');
const btnSubmitEventA = document.getElementById('btn-submit-event-a');

const playerSelectB = document.getElementById('player-select-b');
const eventTypeB = document.getElementById('event-type-b');
const btnSubmitEventB = document.getElementById('btn-submit-event-b');

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

// 4. DOWNLOAD DATA PERTANDINGAN (PRE-MATCH)
btnDownload.addEventListener('click', async () => {
  const serverUrl = serverUrlInput.value.trim();
  const matchId = matchIdInput.value.trim();
  const token = authTokenInput.value.trim();

  if (!serverUrl || !matchId || !token) {
    showSetupStatus("Semua input wajib diisi!", "error");
    return;
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
  faseBadge.textContent = matchData.kategori_nama;

  currentScoreA = parseInt(matchData.skor_a || 0);
  currentScoreB = parseInt(matchData.skor_b || 0);
  scoreADisplay.textContent = currentScoreA;
  scoreBDisplay.textContent = currentScoreB;

  // Isi dropdown pemain
  populatePlayers();

  // Load sync queue dari storage
  const savedQueue = localStorage.getItem('sync_queue');
  syncQueue = savedQueue ? JSON.parse(savedQueue) : [];
  updateSyncBadge();

  // Load event-log bawaan
  renderTimeline();

  updateOnlineStatus();
  broadcastState();
}

function populatePlayers() {
  // Pemain Tim A
  playerSelectA.innerHTML = '<option value="">Pilih Pemain...</option>';
  if (matchData.players_a) {
    matchData.players_a.forEach(p => {
      playerSelectA.innerHTML += `<option value="${p.id_personil}">${p.nama} (${p.nomor_punggung || '-'})</option>`;
    });
  }

  // Pemain Tim B
  playerSelectB.innerHTML = '<option value="">Pilih Pemain...</option>';
  if (matchData.players_b) {
    matchData.players_b.forEach(p => {
      playerSelectB.innerHTML += `<option value="${p.id_personil}">${p.nama} (${p.nomor_punggung || '-'})</option>`;
    });
  }
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
      fase: matchData ? matchData.kategori_nama : 'FASE',
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

// 9. SUBMIT EVENT (GOL/KARTU)
btnSubmitEventA.addEventListener('click', () => {
  submitEvent('A', playerSelectA, eventTypeA);
});

btnSubmitEventB.addEventListener('click', () => {
  submitEvent('B', playerSelectB, eventTypeB);
});

function submitEvent(team, selectElem, typeElem) {
  const personilId = selectElem.value;
  const eventType = typeElem.value;

  if (!personilId) {
    alert("Harap pilih pemain terlebih dahulu!");
    return;
  }

  const selectedText = selectElem.options[selectElem.selectedIndex].text;
  const teamName = team === 'A' ? matchData.team_a_nama : matchData.team_b_nama;
  const elapsedMinutes = Math.floor(timerSeconds / 60);

  const eventPayload = {
    id_event: generateUUID(),
    id_jadwal: matchData.id_jadwal,
    id_personil: personilId,
    id_team: team === 'A' ? matchData.id_team_a : matchData.id_team_b,
    jenis: eventType,
    menit: elapsedMinutes,
    playerName: selectedText,
    teamType: team
  };

  // Tambahkan ke log timeline lokal
  if (!matchData.events) matchData.events = [];
  matchData.events.unshift(eventPayload);
  localStorage.setItem('active_match_data', JSON.stringify(matchData));
  
  renderTimeline();

  // Jika kejadian berupa gol, picu animasi selebrasi di Videotron
  if (eventType === 'gol') {
    // Tambah skor otomatis jika gol dicatat
    if (team === 'A') {
      currentScoreA++;
      scoreADisplay.textContent = currentScoreA;
    } else {
      currentScoreB++;
      scoreBDisplay.textContent = currentScoreB;
    }
    saveMatchScoreLocally();
    broadcastState();

    broadcastChannel.postMessage({
      type: 'GOAL_CELEBRATION',
      data: {
        player: selectedText,
        teamName: teamName
      }
    });

    // Kirim sinkronisasi skor dan event
    queueSyncAction('/api/desktop/sync-score', { id_jadwal: matchData.id_jadwal, skor_a: currentScoreA, skor_b: currentScoreB });
  }

  // Queue event ke server
  queueSyncAction('/api/desktop/add-event', eventPayload);

  // Reset dropdown
  selectElem.value = "";
}

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
    let badgeText = "Gol";
    
    if (e.jenis === 'kartu_kuning') {
      badgeClass = "kartu";
      badgeText = "Kuning";
    } else if (e.jenis === 'kartu_merah') {
      badgeClass = "kartu_merah";
      badgeText = "Merah";
    } else if (e.jenis === 'assist') {
      badgeClass = "gol";
      badgeText = "Assist";
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

// Expose deleteEvent ke scope global window agar onclick bisa diakses
window.deleteEventLocally = function(eventId) {
  if (!confirm("Hapus kejadian ini?")) return;

  const eventIndex = matchData.events.findIndex(e => e.id_event === eventId);
  if (eventIndex > -1) {
    const deletedEvent = matchData.events[eventIndex];
    
    // Kurangi skor otomatis jika gol dihapus
    if (deletedEvent.jenis === 'gol') {
      if (deletedEvent.teamType === 'A' && currentScoreA > 0) {
        currentScoreA--;
        scoreADisplay.textContent = currentScoreA;
      } else if (deletedEvent.teamType === 'B' && currentScoreB > 0) {
        currentScoreB--;
        scoreBDisplay.textContent = currentScoreB;
      }
      saveMatchScoreLocally();
      broadcastState();
      queueSyncAction('/api/desktop/sync-score', { id_jadwal: matchData.id_jadwal, skor_a: currentScoreA, skor_b: currentScoreB });
    }

    matchData.events.splice(eventIndex, 1);
    localStorage.setItem('active_match_data', JSON.stringify(matchData));
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
