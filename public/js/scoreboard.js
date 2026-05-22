const broadcastChannel = new BroadcastChannel('live_score_channel');

// DOM Elements
const sbCabor = document.getElementById('sb-cabor');
const sbTournament = document.getElementById('sb-tournament');
const sbFase = document.getElementById('sb-fase');
const sbPeriod = document.getElementById('sb-period');
const sbTeamA = document.getElementById('sb-team-a');
const sbTeamB = document.getElementById('sb-team-b');
const sbScoreA = document.getElementById('sb-score-a');
const sbScoreB = document.getElementById('sb-score-b');
const sbTimer = document.getElementById('sb-timer');

const setScoresPanel = document.getElementById('set-scores-panel');
const set1Val = document.getElementById('set1-val');
const set2Val = document.getElementById('set2-val');
const set3Val = document.getElementById('set3-val');

const foulBoxA = document.getElementById('foul-box-a');
const foulValA = document.getElementById('sb-foul-a');
const foulBoxB = document.getElementById('foul-box-b');
const foulValB = document.getElementById('sb-foul-b');

const syncIndicator = document.getElementById('sync-indicator');

const eventOverlay = document.getElementById('event-overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayPlayer = document.getElementById('overlay-player');
const overlayTeam = document.getElementById('overlay-team');

let overlayTimeout = null;

// --- SIDE SWAP LOGIC ---
window.toggleSwap = function() {
    const container = document.getElementById('main-board-container');
    container.classList.toggle('reversed');
};
// ---------------------------

// TIMEOUT STATE
let timeoutEndTime = null;
let timeoutBy = null;

// Visual Update Interval
setInterval(() => {
    updateTimeoutDisplay();
}, 1000);

function updateTimeoutDisplay() {
    if (!timeoutEndTime) {
        document.getElementById('timeout-overlay').classList.remove('active');
        return;
    }

    const now = new Date().getTime();
    const diff = Math.ceil((timeoutEndTime - now) / 1000);
    
    if (diff > 0) {
        document.getElementById('timeout-overlay').classList.add('active');
        
        const tmins = Math.floor(diff / 60);
        const tsecs = diff % 60;
        document.getElementById('sb-timeout-countdown').textContent = String(tmins).padStart(2, '0') + ':' + String(tsecs).padStart(2, '0');
        
        let teamLabel = "KEDUA TIM";
        if (timeoutBy === 'A') teamLabel = sbTeamA.textContent;
        else if (timeoutBy === 'B') teamLabel = sbTeamB.textContent;
        
        document.getElementById('sb-timeout-team').textContent = teamLabel;
    } else {
        timeoutEndTime = null;
        document.getElementById('timeout-overlay').classList.remove('active');
    }
}

// --- FULLSCREEN CONTROLS ---
// Toggle fullscreen via Double Click
document.addEventListener('dblclick', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.log(`Error attempting to enable fullscreen: ${err.message}`);
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
});

// Toggle fullscreen via F11
document.addEventListener('keydown', (e) => {
  if (e.key === 'F11') {
    e.preventDefault();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }
});
// ---------------------------

// Mendengarkan instruksi broadcast dari Panel Operator
broadcastChannel.onmessage = (event) => {
  const { type, data } = event.data;

  if (type === 'UPDATE_STATE') {
    updateScoreboardUI(data);
  } else if (type === 'GOAL_CELEBRATION') {
    triggerGoalCelebration(data);
  }
};

// 1. UPDATE DISPLAY PAPAN SKOR
function updateScoreboardUI(data) {
  sbCabor.textContent = data.cabor || 'CABOR';
  if (sbTournament) {
    sbTournament.textContent = data.namaTurnamen || 'TURNAMEN';
  }
  sbFase.textContent = data.fase || 'PERTANDINGAN';
  if (sbPeriod) {
    sbPeriod.textContent = data.currentPeriod || 'BABAK 1';
  }
  
  sbTeamA.textContent = data.teamAName || 'TEAM A';
  sbTeamB.textContent = data.teamBName || 'TEAM B';

  sbScoreA.textContent = data.scoreA;
  sbScoreB.textContent = data.scoreB;
  
  // Update Set Scores
  if (data.tipe_skor === 'set') {
    if (setScoresPanel) {
        setScoresPanel.style.display = 'flex';
        if (set1Val) set1Val.textContent = (data.s1_1 || 0) + '-' + (data.s1_2 || 0);
        if (set2Val) set2Val.textContent = (data.s2_1 || 0) + '-' + (data.s2_2 || 0);
        if (set3Val) set3Val.textContent = (data.s3_1 || 0) + '-' + (data.s3_2 || 0);
    }
    sbTimer.textContent = 'VS';
    sbTimer.style.fontSize = '15vh';
  } else {
    if (setScoresPanel) setScoresPanel.style.display = 'none';
    sbTimer.textContent = data.timerText;
    sbTimer.style.fontSize = '10vh';
  }

  // Sync Timeout State
  if (data.isTimeout) {
    timeoutEndTime = data.timeoutEndTime;
    timeoutBy = data.timeoutBy;
  } else {
    timeoutEndTime = null;
    timeoutBy = null;
  }

  // Auto-hide Timer Footer for set-based sports
  const footerTimer = document.querySelector('.sb-footer');
  if (data.tipe_skor === 'set') {
    // In set mode, we might want to keep the footer for consistent layout but show VS
    if (footerTimer) footerTimer.style.display = 'flex';
  } else {
    if (footerTimer) footerTimer.style.display = 'flex';
  }

  if (data.hasFoul) {
    if (foulBoxA) foulBoxA.style.display = 'inline-block';
    if (foulBoxB) foulBoxB.style.display = 'inline-block';
    
    if (foulValA) {
        foulValA.textContent = data.foulA;
        foulValA.className = data.foulA >= 5 ? 'foul-val text-danger' : 'foul-val text-warning';
    }
    if (foulValB) {
        foulValB.textContent = data.foulB;
        foulValB.className = data.foulB >= 5 ? 'foul-val text-danger' : 'foul-val text-warning';
    }
  } else {
    if (foulBoxA) foulBoxA.style.display = 'none';
    if (foulBoxB) foulBoxB.style.display = 'none';
  }

  if (syncIndicator) {
      syncIndicator.style.transition = 'opacity 0.5s';
      syncIndicator.style.opacity = '0';
      setTimeout(() => {
          syncIndicator.style.display = 'none';
      }, 500);
  }
}

// 2. CELEBRATION EFFECT (GOL!)
function triggerGoalCelebration(data) {
  // Clear timeout lama jika gol beruntun terjadi cepat
  if (overlayTimeout) {
    clearTimeout(overlayTimeout);
  }

  const isTimeOut = data.player === 'TIME OUT';
  
  overlayTitle.textContent = data.player || "GOAL!!!";
  overlayTitle.style.color = isTimeOut ? '#ffa502' : '#2ed573';
  overlayTitle.style.textShadow = isTimeOut ? '0 0 40px #ffa502' : '0 0 40px #2ed573';
  
  overlayPlayer.textContent = isTimeOut ? '' : data.player;
  overlayTeam.textContent = data.teamName;

  eventOverlay.classList.add('active');

  // Matikan overlay otomatis setelah 5 detik
  overlayTimeout = setTimeout(() => {
    eventOverlay.classList.remove('active');
  }, 5000);
}

// REQUEST SEEDED STATE ON LOAD
// Apabila layar videotron dibuka belakangan, ia meminta state terakhir dari operator
window.addEventListener('load', () => {
  // Broadcast request ke operator agar dikirimkan state terkini
  broadcastChannel.postMessage({ type: 'REQUEST_STATE' });
});
