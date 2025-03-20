/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`
// interface IpcRenderer {
//   on(channel: string, listener: (event: any, ...args: any[]) => void): void;
//   off(channel: string, listener: (event: any, ...args: any[]) => void): void;
//   send(channel: string, ...args: any[]): void;
//   invoke(channel: string, ...args: any[]): Promise<any>;
// }

// interface ElectronAPI {
//   saveFile: (content: string, filename: string, images: any) => Promise<any>;
//   saveAsPDF: (defect: any, cameraImage: string, slamMapImage: string, filename: string) => Promise<any>;
// }

// declare interface Window {
//   ipcRenderer: IpcRenderer;
//   electronAPI: ElectronAPI;
// }
interface ElectronAPI {
  saveFile: (content: string, filename: string, images: { 
    camera?: string;
    map?: string;
  }) => Promise<{ 
    success: boolean; 
    filePath?: string;
    message?: string;
    error?: string;
  }>;
  
  saveAsPDF: (
    defect: {
      id: string;
      timestamp: number;
      position: { x: number; y: number; z: number };
      severity: string;
      type: string;
      confidence: number;
    }, 
    cameraImage: string, 
    slamMapImage: string, 
    filename: string
  ) => Promise<{ 
    success: boolean; 
    filePath?: string;
    message?: string;
    error?: string;
  }>;
}

interface IpcRenderer {
  on(channel: string, listener: (event: any, ...args: any[]) => void): void;
  off(channel: string, listener: (event: any, ...args: any[]) => void): void;
  send(channel: string, ...args: any[]): void;
  invoke(channel: string, ...args: any[]): Promise<any>;
}

declare interface Window {
  electronAPI: ElectronAPI;
  ipcRenderer: IpcRenderer;
}
