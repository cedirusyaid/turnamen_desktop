const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

let operatorWindow = null;
let scoreboardWindow = null;

function createOperatorWindow() {
  operatorWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    title: "Panel Operator Match Updater",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  operatorWindow.loadFile(path.join(__dirname, 'public/operator.html'));

  operatorWindow.on('closed', () => {
    if (scoreboardWindow) scoreboardWindow.close();
    operatorWindow = null;
  });
}

function openScoreboardWindow() {
  if (scoreboardWindow) {
    scoreboardWindow.focus();
    return;
  }

  const displays = screen.getAllDisplays();
  // Cari monitor eksternal (layar kedua), jika tidak ada gunakan monitor utama
  const externalDisplay = displays.find((display) => {
    return display.bounds.x !== 0 || display.bounds.y !== 0;
  });

  const windowOptions = {
    width: 1280,
    height: 720,
    title: "Papan Skor Videotron",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  };

  if (externalDisplay) {
    // Posisikan di layar kedua
    windowOptions.x = externalDisplay.bounds.x;
    windowOptions.y = externalDisplay.bounds.y;
    windowOptions.fullscreen = true;
  }

  scoreboardWindow = new BrowserWindow(windowOptions);
  scoreboardWindow.loadFile(path.join(__dirname, 'public/scoreboard.html'));

  scoreboardWindow.on('closed', () => {
    scoreboardWindow = null;
    if (operatorWindow) {
      operatorWindow.webContents.send('scoreboard-status', false);
    }
  });
}

ipcMain.on('open-scoreboard', () => {
  openScoreboardWindow();
  if (operatorWindow) {
    operatorWindow.webContents.send('scoreboard-status', true);
  }
});

ipcMain.on('close-scoreboard', () => {
  if (scoreboardWindow) {
    scoreboardWindow.close();
  }
});

ipcMain.on('start-google-login', (event, serverUrl) => {
  const loginUrl = `${serverUrl}/api/desktop/google-login`;
  
  const authWindow = new BrowserWindow({
    width: 600,
    height: 700,
    parent: operatorWindow,
    modal: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  authWindow.loadURL(loginUrl);
  authWindow.once('ready-to-show', () => {
    authWindow.show();
  });

  const handleCallback = (url) => {
    if (url.includes('/api/desktop/google-success-page')) {
      try {
        const parsedUrl = new URL(url);
        const token = parsedUrl.searchParams.get('token');
        const id_user = parsedUrl.searchParams.get('id_user');
        if (token) {
          event.reply('google-login-success', { token, id_user });
        } else {
          event.reply('google-login-failed', 'Token tidak ditemukan.');
        }
      } catch (e) {
        event.reply('google-login-failed', 'Gagal memproses callback URL.');
      }
      setTimeout(() => {
        if (!authWindow.isDestroyed()) {
          authWindow.destroy();
        }
      }, 1500);
    }
  };

  authWindow.webContents.on('will-navigate', (e, url) => {
    handleCallback(url);
  });

  authWindow.webContents.on('did-redirect-navigation', (e, url) => {
    handleCallback(url);
  });

  authWindow.webContents.on('did-navigate', (e, url) => {
    handleCallback(url);
  });
});

app.whenReady().then(() => {
  createOperatorWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOperatorWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
