const broadcastChannel = new BroadcastChannel('live_score_channel');

// Helper to set monospaced segments with digital ghost segments for Orbitron
function setSegmentedText(element, text, charWidth = '0.85ch') {
  if (!element) return;
  element.innerHTML = '';
  const chars = String(text).split('');
  chars.forEach(char => {
    const container = document.createElement('span');
    container.className = 'digit-container';
    container.style.display = 'inline-block';
    container.style.textAlign = 'center';
    container.style.position = 'relative';
    
    if (char === ':') {
      container.style.width = '0.3ch';
      
      const valSpan = document.createElement('span');
      valSpan.textContent = ':';
      valSpan.className = 'digit-val';
      container.appendChild(valSpan);
    } else if (char === ' ') {
      container.style.width = charWidth;
      // Empty spacer
    } else {
      container.style.width = charWidth;
      
      // Active segment (nilai asli)
      const valSpan = document.createElement('span');
      valSpan.textContent = char;
      valSpan.className = 'digit-val';
      container.appendChild(valSpan);
    }
    
    element.appendChild(container);
  });
}

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

const shotClockBox = document.getElementById('shot-clock-box');
const sbShotClock = document.getElementById('sb-shot-clock');

const eventOverlay = document.getElementById('event-overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayPlayer = document.getElementById('overlay-player');
const overlayTeam = document.getElementById('overlay-team');

let overlayTimeout = null;
let prevScoreA = 0;
let prevScoreB = 0;

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

// TIMEOUT OVERLAY DISPLAY SINKRONISASI
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
  
  const idCabor = parseInt(data.id_cabor || 0);
  const maxSet = parseInt(data.max_set || 3);
  const curPeriod = (data.currentPeriod || '').toUpperCase();
  
  if (sbPeriod) {
    sbPeriod.textContent = data.currentPeriod || 'BABAK 1';
  }
  
  sbTeamA.textContent = data.teamAName || 'TEAM A';
  sbTeamB.textContent = data.teamBName || 'TEAM B';

  const setsWonA = parseInt(data.scoreA) || 0;
  const setsWonB = parseInt(data.scoreB) || 0;

  // Deteksi Set Aktif
  let activeSetNum = 1;
  if (curPeriod.indexOf('SET 2') !== -1 || curPeriod.indexOf('BABAK 2') !== -1) {
    activeSetNum = 2;
  } else if (curPeriod.indexOf('SET 3') !== -1 || curPeriod.indexOf('BABAK 3') !== -1) {
    activeSetNum = 3;
  } else if (curPeriod.indexOf('SET 4') !== -1 || curPeriod.indexOf('BABAK 4') !== -1) {
    activeSetNum = 4;
  } else if (curPeriod.indexOf('SET 5') !== -1 || curPeriod.indexOf('BABAK 5') !== -1) {
    activeSetNum = 5;
  }

  // Tentukan Display Skor Utama
  let mainScoreA = 0;
  let mainScoreB = 0;

  if (idCabor === 10) {
    // Tennis: Display besar adalah hasil set aktif
    mainScoreA = parseInt(data['s' + activeSetNum + '_1']) || 0;
    mainScoreB = parseInt(data['s' + activeSetNum + '_2']) || 0;
  } else {
    // Normal: Display besar adalah skor utama / sets won (bulutangkis/tenismeja)
    mainScoreA = setsWonA;
    mainScoreB = setsWonB;
  }

  if (mainScoreA > prevScoreA) {
    animateScoreChange(sbScoreA);
  }
  if (mainScoreB > prevScoreB) {
    animateScoreChange(sbScoreB);
  }

  prevScoreA = mainScoreA;
  prevScoreB = mainScoreB;

  setSegmentedText(sbScoreA, mainScoreA, '0.85ch');
  setSegmentedText(sbScoreB, mainScoreB, '0.85ch');
  
  // Set-based Cabor UI
  const setBottomPanel = document.getElementById('set_bottom_panel');
  const setsWonBoxA = document.getElementById('sets-won-box-a');
  const setsWonBoxB = document.getElementById('sets-won-box-b');
  const tennisPointBoxA = document.getElementById('tennis-point-box-a');
  const tennisPointBoxB = document.getElementById('tennis-point-box-b');
  
  const container = document.querySelector('.scoreboard-container');
  if (data.tipe_skor === 'set') {
    if (container) container.classList.add('mode-set');
    // Sembunyikan Timer Utama
    sbTimer.style.display = 'none';
    
    // Tampilkan Panel Set
    if (setBottomPanel) {
      setBottomPanel.style.display = 'flex';
      
      // Update label set berjalan
      const activeSetLbl = document.getElementById('active_set_lbl');
      if (activeSetLbl) {
        activeSetLbl.textContent = 'SET ' + activeSetNum;
      }
      
      // Tampilkan set 4 dan 5 hanya jika maxSet mencukupi
      const set4Box = document.getElementById('set4_box');
      const set5Box = document.getElementById('set5_box');
      if (set4Box) set4Box.style.display = (maxSet >= 4) ? 'block' : 'none';
      if (set5Box) set5Box.style.display = (maxSet >= 5) ? 'block' : 'none';
      
      // Update skor masing-masing set card & opacity
      for (let i = 1; i <= 5; i++) {
        const valElem = document.getElementById(`set${i}_val`);
        const boxElem = document.getElementById(`set${i}_box`);
        if (valElem && boxElem) {
          const sValA = data[`s${i}_1`] || 0;
          const sValB = data[`s${i}_2`] || 0;
          const textVal = `${sValA} - ${sValB}`;
          valElem.textContent = textVal;
          
          // Set Active class & dynamic opacity
          if (i === activeSetNum) {
            boxElem.classList.add('active');
            boxElem.style.opacity = '1';
          } else {
            boxElem.classList.remove('active');
            if (sValA === 0 && sValB === 0) {
              boxElem.style.opacity = '0.4';
            } else {
              boxElem.style.opacity = '0.8';
            }
          }
        }
      }
    }
    
    // Tampilkan Sets Won Box (kotak emas)
    if (setsWonBoxA) {
      setsWonBoxA.style.display = 'inline-flex';
      setSegmentedText(document.getElementById('sets_won_1'), setsWonA, '0.85ch');
    }
    if (setsWonBoxB) {
      setsWonBoxB.style.display = 'inline-flex';
      setSegmentedText(document.getElementById('sets_won_2'), setsWonB, '0.85ch');
    }

    // Tennis Point Box (kotak cyan)
    if (idCabor === 10) {
      if (tennisPointBoxA) tennisPointBoxA.style.display = 'inline-flex';
      if (tennisPointBoxB) tennisPointBoxB.style.display = 'inline-flex';
      
      // Parsing tennis point game ini dari currentPeriod
      let txt1 = "0";
      let txt2 = "0";
      if (curPeriod.indexOf('[') !== -1 && curPeriod.indexOf(']') !== -1) {
        let parts = data.currentPeriod.split('[')[1].split(']')[0].split('-');
        txt1 = parts[0].trim();
        txt2 = parts[1].trim();
      } else if (curPeriod.indexOf('DEUCE') !== -1) {
        txt1 = "40";
        txt2 = "40";
      }
      
      const pt1 = document.getElementById('tennis_pt_1');
      const pt2 = document.getElementById('tennis_pt_2');
      if (pt1) setSegmentedText(pt1, txt1, '0.85ch');
      if (pt2) setSegmentedText(pt2, txt2, '0.85ch');
    } else {
      if (tennisPointBoxA) tennisPointBoxA.style.display = 'none';
      if (tennisPointBoxB) tennisPointBoxB.style.display = 'none';
    }
    
  } else {
    if (container) container.classList.remove('mode-set');
    // Normal Cabor (akumulasi)
    sbTimer.style.display = 'block';
    setSegmentedText(sbTimer, data.timerText, '0.85ch');
    
    if (setBottomPanel) setBottomPanel.style.display = 'none';
    if (setsWonBoxA) setsWonBoxA.style.display = 'none';
    if (setsWonBoxB) setsWonBoxB.style.display = 'none';
    if (tennisPointBoxA) tennisPointBoxA.style.display = 'none';
    if (tennisPointBoxB) tennisPointBoxB.style.display = 'none';
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
    if (footerTimer) footerTimer.style.display = 'flex';
  } else {
    if (footerTimer) footerTimer.style.display = 'flex';
  }

  // Handle Team Fouls (Futsal / Basket)
  if (data.hasFoul) {
    if (container) container.classList.add('has-foul');
    if (foulBoxA) foulBoxA.style.display = 'inline-flex';
    if (foulBoxB) foulBoxB.style.display = 'inline-flex';
    
    if (foulValA) {
        setSegmentedText(foulValA, data.foulA, '0.85ch');
        if (data.foulA >= 5) {
            foulBoxA.style.borderColor = '#ff3838';
            foulBoxA.style.boxShadow = 'inset 0 0 10px rgba(0,0,0,0.9), 0 0 15px rgba(255, 56, 56, 0.4)';
            foulValA.style.color = '#ff3838';
        } else {
            foulBoxA.style.borderColor = '#2d3748';
            foulBoxA.style.boxShadow = 'inset 0 0 10px rgba(0,0,0,0.9)';
            foulValA.style.color = '#ffa502';
        }
    }
    if (foulValB) {
        setSegmentedText(foulValB, data.foulB, '0.85ch');
        if (data.foulB >= 5) {
            foulBoxB.style.borderColor = '#ff3838';
            foulBoxB.style.boxShadow = 'inset 0 0 10px rgba(0,0,0,0.9), 0 0 15px rgba(255, 56, 56, 0.4)';
            foulValB.style.color = '#ff3838';
        } else {
            foulBoxB.style.borderColor = '#2d3748';
            foulBoxB.style.boxShadow = 'inset 0 0 10px rgba(0,0,0,0.9)';
            foulValB.style.color = '#ffa502';
        }
    }
  } else {
    if (container) container.classList.remove('has-foul');
    if (foulBoxA) foulBoxA.style.display = 'none';
    if (foulBoxB) foulBoxB.style.display = 'none';
  }

  // Update Shot Clock (Basket Only)
  if (data.showShotClock) {
    if (shotClockBox) shotClockBox.style.display = 'block';
    if (sbShotClock) {
      setSegmentedText(sbShotClock, data.shotClock, '0.85ch');
      if (data.shotClock <= 5) {
        sbShotClock.style.color = '#ff3838';
        if (shotClockBox) {
          shotClockBox.style.borderColor = '#ff3838';
          shotClockBox.style.boxShadow = 'inset 0 0 10px rgba(0,0,0,0.9), 0 0 15px rgba(255, 56, 56, 0.4)';
        }
      } else {
        sbShotClock.style.color = '#ffa502';
        if (shotClockBox) {
          shotClockBox.style.borderColor = '#ffa502';
          shotClockBox.style.boxShadow = 'inset 0 0 10px rgba(0,0,0,0.9), 0 0 15px rgba(255, 165, 2, 0.3)';
        }
      }
    }
  } else {
    if (shotClockBox) shotClockBox.style.display = 'none';
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

  overlayTimeout = setTimeout(() => {
    eventOverlay.classList.remove('active');
  }, 5000);
}

function animateScoreChange(el) {
  if (!el) return;
  el.classList.remove('score-pop');
  void el.offsetWidth; // Trigger reflow
  el.classList.add('score-pop');
}

// REQUEST SEEDED STATE ON LOAD
window.addEventListener('load', () => {
  broadcastChannel.postMessage({ type: 'REQUEST_STATE' });
});
