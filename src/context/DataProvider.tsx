// DataContext.tsx
import { createContext, useContext, ReactNode, useState } from "react";

// Define all the required types
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

// Create the context with a default undefined value
const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  // Defects management
  const [defects, setDefects] = useState<Defect[]>([]);
  
  // Add a new defect to the queue
  const addDefect = (faceData: TrackedFace) => {
    // Transform face detection into defect format
    const newDefect: Defect = {
      id: `DEF-${faceData.id}`,
      timestamp: Date.now(),
      position: {
        x: faceData.box[0], // x1 coordinate 
        y: faceData.box[1], // y1 coordinate
        z: 0 // Placeholder until you have real Z data
      },
      severity: determineSeverity(faceData.box[4]), // Based on confidence
      type: "Visual Defect", // Default type
      confidence: faceData.box[4] * 100 // Convert to percentage
    };
    
    // Add to defects state
    setDefects(prev => [...prev, newDefect]);
  };
  
  // Helper function to determine severity based on confidence
  const determineSeverity = (confidence: number): string => {
    if (confidence > 0.9) return "critical";
    if (confidence > 0.8) return "high";
    if (confidence > 0.7) return "medium";
    return "low";
  };
  
  // Export functionality
  const handleExport = (exportData: ExportData) => {
    // Handle export logic
    console.log("Exporting:", exportData);
    // Implement your export logic here
  };
  
  // Screenshot functionality
  const getCameraScreenshot = async (defectId: string): Promise<string> => {
    // Could capture from your current camera feed
    // For now returning placeholder
    return "data:image/png;base64,...";
  };
  
  const getSlamMapScreenshot = async (position: Position): Promise<string> => {
    // Get SLAM map screenshot based on position
    // For now returning placeholder
    return "data:image/png;base64,...";
  };

  // Providing the actual values to the context
  const contextValue: DataContextType = {
    defects,
    addDefect,
    handleExport,
    getCameraScreenshot,
    getSlamMapScreenshot,
  };

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  );
}

export function useDataContext(): DataContextType {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useDataContext must be used within a DataProvider");
  }
  return context;
}