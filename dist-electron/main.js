import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
function createWindow() {
  win = new BrowserWindow({
    title: "RoboNav",
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs")
    },
    fullscreen: true
  });
  win.webContents.openDevTools();
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
ipcMain.handle("save-file", async (event, { content, filename, images }) => {
  try {
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: filename,
      filters: [
        { name: "CSV Files", extensions: ["csv"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (!filePath) return { success: false, message: "Save cancelled" };
    fs.writeFileSync(filePath, content);
    if (images && images.camera) {
      const imageData = images.camera.replace(/^data:image\/\w+;base64,/, "");
      const imagePath = path.join(
        path.dirname(filePath),
        `${path.basename(filePath, ".csv")}_camera.png`
      );
      fs.writeFileSync(imagePath, Buffer.from(imageData, "base64"));
    }
    if (images && images.map) {
      const mapData = images.map.replace(/^data:image\/\w+;base64,/, "");
      const mapPath = path.join(
        path.dirname(filePath),
        `${path.basename(filePath, ".csv")}_map.png`
      );
      fs.writeFileSync(mapPath, Buffer.from(mapData, "base64"));
    }
    return { success: true, filePath };
  } catch (error) {
    console.error("Error saving file:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    } else {
      return { success: false, error: String(error) };
    }
  }
});
ipcMain.handle("saveAsPDF", async (event, { defect, cameraImage, slamMapImage, filename }) => {
  try {
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: filename,
      filters: [
        { name: "PDF Files", extensions: ["pdf"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (!filePath) return { success: false, message: "Save cancelled" };
    const PDFDocument2 = require("pdfkit");
    const doc = new PDFDocument2({
      margin: 50,
      font: path.join(__dirname, "../node_modules/pdfkit/js/data/Helvetica.afm")
    });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    doc.fontSize(25).text(`Defect Report: #${defect.id}`, { align: "center" });
    doc.moveDown();
    doc.fontSize(12);
    doc.text(`Detected: ${new Date(defect.timestamp).toLocaleString()}`);
    doc.text(`Type: ${defect.type}`);
    doc.text(`Severity: ${defect.severity}`);
    doc.text(`Confidence: ${defect.confidence.toFixed(2)}%`);
    doc.text(`Position: (${defect.position.x.toFixed(2)}, ${defect.position.y.toFixed(2)}, ${defect.position.z.toFixed(2)})`);
    doc.moveDown();
    if (cameraImage) {
      doc.text("Camera Feed with Defect:", { underline: true });
      doc.moveDown();
      const imgData = cameraImage.replace(/^data:image\/\w+;base64,/, "");
      doc.image(Buffer.from(imgData, "base64"), {
        fit: [500, 300],
        align: "center"
      });
      doc.moveDown();
    }
    if (slamMapImage) {
      doc.text("SLAM Map with Defect Location:", { underline: true });
      doc.moveDown();
      const mapData = slamMapImage.replace(/^data:image\/\w+;base64,/, "");
      doc.image(Buffer.from(mapData, "base64"), {
        fit: [500, 300],
        align: "center"
      });
    }
    doc.end();
    return new Promise((resolve) => {
      stream.on("finish", () => {
        resolve({ success: true, filePath });
      });
    });
  } catch (error) {
    console.error("Error creating PDF:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    } else {
      return { success: false, error: String(error) };
    }
  }
});
app.whenReady().then(createWindow);
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
