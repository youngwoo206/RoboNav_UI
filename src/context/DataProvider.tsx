import { createContext, useContext, ReactNode, useState, useRef, useCallback } from "react";

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

// Update to match SewerDetection component's format
export interface TrackedDefect {
  id: number;
  box: number[]; // [x1, y1, x2, y2, confidence]
  lastSeen: number;
}

export interface ExportData {
  defect: Defect;
  cameraImage: string; // Base64 or blob URL
  slamMapImage: string; // Base64 or blob URL
  format: 'csv' | 'pdf';
}

export interface DataContextType {
  defects: Defect[];
  addDefect: (defectData: TrackedDefect) => void; 
  handleExport: (data: ExportData) => void; 
  exportCSV: (defect: Defect) => Promise<void>;
  downloadImages: (defect: Defect) => Promise<void>;
  getCameraScreenshot: (defectId: string) => Promise<string>;
  getSlamMapScreenshot: (position: Position) => Promise<string>;
  setCurrentCameraImage: (image: string) => void;
  setCurrentOverlayCanvas: (canvas: HTMLCanvasElement | null) => void;
}

// Create the context with a default undefined value
const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  // Defects management
  const [defects, setDefects] = useState<Defect[]>([]);
  
  // References to current camera state for screenshots
  const currentCameraImageRef = useRef<string | null>(null);
  const currentOverlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Track processed defect boxes instead of just IDs
  const processedBoxesRef = useRef<number[][]>([]);
  
  // Add a cooldown to prevent rapid additions
  const lastAddTimeRef = useRef<number>(0);
  const COOLDOWN_MS = 2000; // 2 seconds cooldown between additions
  
  // IoU threshold for considering a defect as duplicate
  const IOU_THRESHOLD = 0.5;
  
  // Function to calculate IoU (Intersection over Union) between two boxes
  const calculateIoU = (boxA: number[], boxB: number[]): number => {
    // Get coordinates (first 4 values are x1,y1,x2,y2)
    const [x1A, y1A, x2A, y2A] = boxA;
    const [x1B, y1B, x2B, y2B] = boxB;

    // Calculate intersection area
    const xLeft = Math.max(x1A, x1B);
    const yTop = Math.max(y1A, y1B);
    const xRight = Math.min(x2A, x2B);
    const yBottom = Math.min(y2A, y2B);

    if (xRight < xLeft || yBottom < yTop) {
      return 0; // No intersection
    }

    const intersectionArea = (xRight - xLeft) * (yBottom - yTop);

    // Calculate areas of both boxes
    const boxAArea = (x2A - x1A) * (y2A - y1A);
    const boxBArea = (x2B - x1B) * (y2B - y1B);

    // Calculate IoU
    const unionArea = boxAArea + boxBArea - intersectionArea;

    return intersectionArea / unionArea;
  };
  
  // Add a new defect to the queue - updated to work with SewerDetection
  const addDefect = useCallback((defectData: TrackedDefect) => {
    const now = Date.now();
    
    // Apply cooldown to prevent rapid additions
    if (now - lastAddTimeRef.current < COOLDOWN_MS) {
      return;
    }
    
    // Check if this defect overlaps significantly with any we've already processed
    const isDuplicate = processedBoxesRef.current.some(existingBox => 
      calculateIoU(defectData.box, existingBox) > IOU_THRESHOLD
    );
    
    if (isDuplicate) {
      console.log("Duplicate defect detected, skipping");
      return;
    }
    
    // Store the defect box for future duplicate checks
    processedBoxesRef.current.push([...defectData.box]);
    
    // Update the last add time
    lastAddTimeRef.current = now;
    
    // Transform defect detection into defect format for the queue
    const newDefect: Defect = {
      id: `DEF-${defectData.id}-${now.toString().slice(-4)}`, // Make IDs more unique
      timestamp: now,
      position: {
        // Map the box coordinates [x1, y1, x2, y2] to position
        // Use center coordinates for position
        x: (defectData.box[0] + defectData.box[2]) / 2 / 640, // Normalize to 0-1 range, assuming 640x640 input
        y: (defectData.box[1] + defectData.box[3]) / 2 / 640,
        z: 0 // Placeholder until you have real Z data
      },
      severity: determineSeverity(defectData.box[4]), // Based on confidence
      type: "Sewer Defect", // Default type for sewer defects
      confidence: defectData.box[4] * 100 // Convert to percentage
    };
    
    // Add to defects state
    setDefects(prev => [...prev, newDefect]);
    
    console.log("Added new defect:", newDefect.id);
  }, []);
  
  // Helper function to determine severity based on confidence
  const determineSeverity = (confidence: number): string => {
    if (confidence > 0.9) return "critical";
    if (confidence > 0.8) return "high";
    if (confidence > 0.7) return "medium";
    return "low";
  };
  
  // Set current camera image for screenshots
  const setCurrentCameraImage = useCallback((image: string) => {
    currentCameraImageRef.current = image;
  }, []);
  
  // Set current overlay canvas for screenshots with bounding boxes
  const setCurrentOverlayCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    currentOverlayCanvasRef.current = canvas;
  }, []);
  
  // Get camera screenshot for a specific defect
  const getCameraScreenshot = async (defectId: string): Promise<string> => {
    if (!currentCameraImageRef.current) {
      console.warn("No camera image available for screenshot");
      return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; // 1x1 transparent PNG
    }
    
    try {
      // Create a composite image with both the camera feed and the detection overlay
      const img = new Image();
      img.src = currentCameraImageRef.current;
      
      // Wait for the image to load
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load camera image"));
      });
      
      // Create a canvas to draw both the image and overlay
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error("Could not get canvas context");
      }
      
      // Draw the camera image
      ctx.drawImage(img, 0, 0);
      
      // Draw the overlay if available
      if (currentOverlayCanvasRef.current) {
        ctx.drawImage(currentOverlayCanvasRef.current, 0, 0, canvas.width, canvas.height);
      }
      
      // Add a text label with the defect ID
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(10, canvas.height - 40, 180, 30);
      ctx.fillStyle = "white";
      ctx.font = "bold 16px Arial";
      ctx.fillText(`Defect: ${defectId}`, 20, canvas.height - 20);
      
      // Return as data URL
      return canvas.toDataURL('image/png');
      
    } catch (error) {
      console.error("Error creating camera screenshot:", error);
      return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; // 1x1 transparent PNG
    }
  };
  
  // Get SLAM map screenshot for a specific position
  const getSlamMapScreenshot = async (position: Position): Promise<string> => {
    try {
      // Create a simple placeholder SLAM map visualization
      // In a real implementation, this would render the actual SLAM map
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error("Could not get canvas context");
      }
      
      // Draw a simple grid
      ctx.fillStyle = "#f0f0f0";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw grid lines
      ctx.strokeStyle = "#cccccc";
      ctx.lineWidth = 1;
      
      // Vertical lines
      for (let x = 0; x <= canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      
      // Horizontal lines
      for (let y = 0; y <= canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
      
      // Draw a marker at the defect position
      // Scale position to canvas coordinates
      const markerX = position.x * canvas.width;
      const markerY = position.y * canvas.height;
      
      // Draw position marker
      ctx.fillStyle = "#ff0000";
      ctx.beginPath();
      ctx.arc(markerX, markerY, 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw position coordinates
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(markerX - 70, markerY - 40, 140, 30);
      ctx.fillStyle = "white";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      ctx.fillText(
        `(${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`, 
        markerX, 
        markerY - 20
      );
      
      // Return as data URL
      return canvas.toDataURL('image/png');
      
    } catch (error) {
      console.error("Error creating SLAM map screenshot:", error);
      return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; // 1x1 transparent PNG
    }
  };
  
  // Export CSV data only
  const exportCSV = useCallback(async (defect: Defect) => {
    try {
      // Create CSV content
      const csvContent = [
        // Header row
        ["Defect ID", "Timestamp", "Position X", "Position Y", "Position Z", "Severity", "Type", "Confidence (%)"].join(","),
        // Data row
        [
          defect.id,
          new Date(defect.timestamp).toISOString(),
          defect.position.x.toFixed(4),
          defect.position.y.toFixed(4),
          defect.position.z.toFixed(4),
          defect.severity,
          defect.type,
          defect.confidence.toFixed(2)
        ].join(",")
      ].join("\n");
      
      // Create a Blob with the CSV data
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      
      // Create a download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `defect_${defect.id}_data.csv`;
      
      // Append to body, click, and remove
      document.body.appendChild(link);
      link.click();
      
      // Use setTimeout to prevent immediate garbage collection
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
      
      console.log("CSV exported successfully");
      
    } catch (error) {
      console.error("Error exporting CSV:", error);
      alert("Error exporting CSV. See console for details.");
    }
  }, []);

  // Download images only
  const downloadImages = useCallback(async (defect: Defect) => {
    try {
      // Get the images
      const cameraImageData = await getCameraScreenshot(defect.id);
      
      // Create a download link for camera image
      const link = document.createElement('a');
      link.href = cameraImageData;
      link.download = `defect_${defect.id}_camera.png`;
      document.body.appendChild(link);
      link.click();
      
      // Clean up and prepare for SLAM map download
      setTimeout(() => {
        document.body.removeChild(link);
        
        // After a short delay, download the SLAM map
        setTimeout(async () => {
          const slamMapImageData = await getSlamMapScreenshot(defect.position);
          const mapLink = document.createElement('a');
          mapLink.href = slamMapImageData;
          mapLink.download = `defect_${defect.id}_slam_map.png`;
          document.body.appendChild(mapLink);
          mapLink.click();
          
          // Final cleanup
          setTimeout(() => {
            document.body.removeChild(mapLink);
          }, 100);
        }, 500); // Half-second delay between downloads
      }, 100);
      
      console.log("Images download initiated");
      
    } catch (error) {
      console.error("Error downloading images:", error);
      alert("Error downloading images. See console for details.");
    }
  }, [getCameraScreenshot, getSlamMapScreenshot]);
  
  // Keep handleExport for backward compatibility
  const handleExport = useCallback(async (exportData: ExportData) => {
    const { defect, format } = exportData;
    
    if (format === 'csv') {
      await exportCSV(defect);
    } else if (format === 'pdf') {
      console.log("PDF export not yet implemented");
      alert("PDF export is not yet implemented");
    }
  }, [exportCSV]);

  // Providing the actual values to the context
  const contextValue: DataContextType = {
    defects,
    addDefect,
    handleExport,
    exportCSV,
    downloadImages,
    getCameraScreenshot,
    getSlamMapScreenshot,
    setCurrentCameraImage,
    setCurrentOverlayCanvas
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