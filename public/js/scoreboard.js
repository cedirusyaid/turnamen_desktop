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
const sbLogoA = document.getElementById('sb-logo-a');
const sbLogoB = document.getElementById('sb-logo-b');

const eventOverlay = document.getElementById('event-overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayPlayer = document.getElementById('overlay-player');
const overlayTeam = document.getElementById('overlay-team');

let overlayTimeout = null;

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
  
  // Ambil huruf pertama sebagai logo inisial tim
  sbLogoA.textContent = (data.teamAName || 'A').charAt(0).toUpperCase();
  sbLogoB.textContent = (data.teamBName || 'B').charAt(0).toUpperCase();

  sbScoreA.textContent = data.scoreA;
  sbScoreB.textContent = data.scoreB;
  sbTimer.textContent = data.timerText;
}

// 2. CELEBRATION EFFECT (GOL!)
function triggerGoalCelebration(data) {
  // Clear timeout lama jika gol beruntun terjadi cepat
  if (overlayTimeout) {
    clearTimeout(overlayTimeout);
  }

  overlayTitle.textContent = "GOAL!!!";
  overlayPlayer.textContent = data.player;
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
