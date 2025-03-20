import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import fs from 'node:fs'


// app.disableHardwareAcceleration();
// app.commandLine.appendSwitch('no-sandbox');
// app.commandLine.appendSwitch('disable-gpu');
// app.commandLine.appendSwitch('disable-software-rasterizer');
// app.commandLine.appendSwitch('disable-gpu-compositing');
// app.commandLine.appendSwitch('disable-gpu-rasterization');
// app.commandLine.appendSwitch('disable-gpu-sandbox');
// const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    title: "RoboNav",
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
    fullscreen: true,
  })

  win.webContents.openDevTools()  //opens the console

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// In main.js or main.ts of your Electron app

// Handle CSV file saving
ipcMain.handle('save-file', async (event, { content, filename, images }) => {
  try {
    // Show save dialog
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: filename,
      filters: [
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (!filePath) return { success: false, message: 'Save cancelled' };
    
    // Write CSV file
    fs.writeFileSync(filePath, content);
    
    // Save images if provided
    if (images && images.camera) {
      const imageData = images.camera.replace(/^data:image\/\w+;base64,/, '');
      const imagePath = path.join(
        path.dirname(filePath),
        `${path.basename(filePath, '.csv')}_camera.png`
      );
      fs.writeFileSync(imagePath, Buffer.from(imageData, 'base64'));
    }
    
    if (images && images.map) {
      const mapData = images.map.replace(/^data:image\/\w+;base64,/, '');
      const mapPath = path.join(
        path.dirname(filePath),
        `${path.basename(filePath, '.csv')}_map.png`
      );
      fs.writeFileSync(mapPath, Buffer.from(mapData, 'base64'));
    }
    
    return { success: true, filePath };
  } catch (error) {
    console.error('Error saving file:', error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
  } else {
      return { success: false, error: String(error) }; // Convert unknown errors to a string
  }
  }
});

// Handle PDF generation and saving
ipcMain.handle('saveAsPDF', async (event, { defect, cameraImage, slamMapImage, filename }) => {
  try {
    // Show save dialog
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: filename,
      filters: [
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (!filePath) return { success: false, message: 'Save cancelled' };
    
    // Create PDF document
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({
      margin: 50,
      font: path.join(__dirname, '../node_modules/pdfkit/js/data/Helvetica.afm')
    });
    const stream = fs.createWriteStream(filePath);

    
    doc.pipe(stream);
    
    // Add title
    doc.fontSize(25).text(`Defect Report: #${defect.id}`, { align: 'center' });
    doc.moveDown();
    
    // Add defect details
    doc.fontSize(12);
    doc.text(`Detected: ${new Date(defect.timestamp).toLocaleString()}`);
    doc.text(`Type: ${defect.type}`);
    doc.text(`Severity: ${defect.severity}`);
    doc.text(`Confidence: ${defect.confidence.toFixed(2)}%`);
    doc.text(`Position: (${defect.position.x.toFixed(2)}, ${defect.position.y.toFixed(2)}, ${defect.position.z.toFixed(2)})`);
    doc.moveDown();
    
    // Add camera image
    if (cameraImage) {
      doc.text('Camera Feed with Defect:', { underline: true });
      doc.moveDown();
      
      const imgData = cameraImage.replace(/^data:image\/\w+;base64,/, '');
      doc.image(Buffer.from(imgData, 'base64'), {
        fit: [500, 300],
        align: 'center'
      });
      doc.moveDown();
    }
    
    // Add SLAM map image
    if (slamMapImage) {
      doc.text('SLAM Map with Defect Location:', { underline: true });
      doc.moveDown();
      
      const mapData = slamMapImage.replace(/^data:image\/\w+;base64,/, '');
      doc.image(Buffer.from(mapData, 'base64'), {
        fit: [500, 300],
        align: 'center'
      });
    }
    
    // Finalize PDF
    doc.end();
    
    return new Promise((resolve) => {
      stream.on('finish', () => {
        resolve({ success: true, filePath });
      });
    });
  } catch (error) {
    console.error('Error creating PDF:', error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
  } else {
      return { success: false, error: String(error) }; // Convert unknown errors to a string
  }
  }
});
app.whenReady().then(createWindow)
