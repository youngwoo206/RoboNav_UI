// In @/utilities/types.ts
export interface Position {
    x: number;
    y: number;
    z: number;
  }
  
  export interface Defect {
    id: string;
    timestamp: number;
    position: Position;
    severity: string;
    type: string;
    confidence: number;
  }
  
  export interface TrackedFace {
    id: number;
    box: number[]; // [x1, y1, x2, y2, confidence]
    lastSeen: number;
  }
  
  export interface ExportData {
    defect: Defect;
    cameraImage: string;
    slamMapImage: string;
    format: 'csv' | 'pdf';
  }
  
  export interface DataContextType {
    defects: Defect[];
    addDefect: (faceData: TrackedFace) => void;
    handleExport: (data: ExportData) => void;
    getCameraScreenshot: (defectId: string) => Promise<string>;
    getSlamMapScreenshot: (position: Position) => Promise<string>;
  }
