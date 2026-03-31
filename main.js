const { app, BrowserWindow, screen } = require('electron');
const { AppBarWindow } = require('electron-appbar-window');
const path = require('path');

let mainWindow;

function createWindow() {
  // 1. Get the primary display's size to calculate height
  const primaryDisplay = screen.getPrimaryDisplay();
  const { height } = primaryDisplay.workAreaSize;

  // 2. Create the actual browser window
  mainWindow = new BrowserWindow({
    width: 70,           // Width of your vertical bar
    height: height,      // Make it full screen height
    frame: false,        // Removes the Windows close/minimize bar
    transparent: true,   // Allows for rounded corners/blur
    alwaysOnTop: true,   // Keeps it above other apps
    resizable: false,    // Prevents accidental stretching
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  // 3. Load your HTML file
  mainWindow.loadFile('index.html');

  // 4. Attach as an AppBar (This is the "Snap" logic)
  // This tells Windows to reserve 70px on the right side
  const appBar = new AppBarWindow(mainWindow);
  appBar.attach('right'); 

  // Optional: Open DevTools while you are building/debugging
  // mainWindow.webContents.openDevTools({ mode: 'detach' });
}

// Start the app when Electron is ready
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
