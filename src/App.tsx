import { useState, useEffect, useRef } from "react";
import Camera from "./components/Camera";
// import Camera from "./components/Camera";
import SewerDetection from "./components/SewerDetection";
import SLAM from "./components/SLAM";
// import DefectQueue from "./components/DefectExport";
import Dashboard from "./components/Dashboard";
import ROSLIB, { Ros } from "roslib";
import DefectQueueTest from "./components/DefectQueueTest";
import { DataProvider } from "./context/DataProvider";

// Define interfaces for your defect data
interface Position {
  x: number;
  y: number;
  z: number;
}

interface Defect {
  id: string;
  timestamp: number;
  position: Position;
  severity: string;
  type: string;
  confidence: number;
}

function App() {
  const [connected, setConnected] = useState<boolean>(false);
  const [ros, setRos] = useState<null | Ros>(null);
  const [defects, setDefects] = useState<Defect[]>([]);
  
  // Refs to access camera and SLAM components
  const cameraRef = useRef<any>(null);
  const slamRef = useRef<any>(null);

  useEffect(() => {
    // Create a new ROSLIB.Ros object
    const newRos = new ROSLIB.Ros({
      url: "ws://localhost:9090",
    });

    newRos.on("connection", () => {
      setConnected(true);
      console.log("Connected to ros websocket");
      
      // Subscribe to defect detection topic once connected
      subscribeToDefects(newRos);
    });

    newRos.on("error", (error) => {
      console.log("Error: ", error);
    });

    newRos.on("close", () => {
      setConnected(false);
      console.log("Connection to websocket server closed");
    });

    setRos(newRos);

    return () => {
      newRos.close();
    };
  }, []);

  // Function to subscribe to defect detection ROS topic
  const subscribeToDefects = (rosInstance: Ros) => {
    if (!rosInstance) return;
    
    // Replace these with your actual topic name and message type
    const defectTopic = new ROSLIB.Topic({
      ros: rosInstance,
      name: '/defect_detection/results',
      messageType: 'defect_msgs/DefectArray'
    });

    defectTopic.subscribe((message: any) => {
      // Process incoming defect messages and update state
      // This is an example - adjust according to your actual message format
      const newDefects: Defect[] = (message.defects as Defect[]).map((defect) => ({
        id: defect.id,
        timestamp: Date.now(),
        position: {
          x: defect.position.x,
          y: defect.position.y,
          z: defect.position.z
        },
        severity: defect.severity,
        type: defect.type,
        confidence: defect.confidence * 100 // Assuming confidence comes as 0-1
      }));
      
      setDefects(prevDefects => {
        // Merge new defects with existing ones, avoiding duplicates
        const merged = [...prevDefects];
        newDefects.forEach(newDefect => {
          const existingIndex = merged.findIndex(d => d.id === newDefect.id);
          if (existingIndex >= 0) {
            merged[existingIndex] = newDefect; // Update existing
          } else {
            merged.push(newDefect); // Add new
          }
        });
        return merged;
      });
    });
  };

  // Functions to get screenshots from components
  const getCameraScreenshot = async (defectId: string): Promise<string> => {
    if (cameraRef.current && cameraRef.current.captureScreenshot) {
      return cameraRef.current.captureScreenshot(defectId);
    }
    // Fallback if method not available
    return '';
  };
  
  const getSlamMapScreenshot = async (position: Position): Promise<string> => {
    if (slamRef.current && slamRef.current.captureMapView) {
      return slamRef.current.captureMapView(position);
    }
    // Fallback if method not available
    return '';
  };

  // Handle export from DefectQueue
  const handleExport = async ({defect, cameraImage, slamMapImage, format}: {
    defect: Defect;
    cameraImage: string;
    slamMapImage: string;
    format: 'csv' | 'pdf';
  }) => {
    // Access Electron's API through the window object
    // Make sure your preload.js exposes these methods
    const electronAPI = (window as any).electron;
    
    if (!electronAPI) {
      console.error("Electron API not available");
      return;
    }
    
    try {
      if (format === 'csv') {
        // Generate CSV content
        const csvContent = `Defect ID,${defect.id}
Timestamp,${new Date(defect.timestamp).toISOString()}
Position,"(${defect.position.x.toFixed(2)}, ${defect.position.y.toFixed(2)}, ${defect.position.z.toFixed(2)})"
Type,${defect.type}
Severity,${defect.severity}
Confidence,${defect.confidence.toFixed(2)}%
`;
        
        // Use Electron to save file
        await electronAPI.saveFile({
          content: csvContent,
          filename: `defect-${defect.id}.csv`,
          images: {
            camera: cameraImage,
            map: slamMapImage
          }
        });
      } else {
        // For PDF, we'll need to use a PDF generation library
        // This would typically be handled in the main Electron process
        await electronAPI.saveAsPDF({
          defect,
          cameraImage,
          slamMapImage,
          filename: `defect-${defect.id}.pdf`
        });
      }
      
      console.log(`Exported defect #${defect.id} as ${format}`);
    } catch (error) {
      console.error("Export failed:", error);
    }
  };

  return (
    
    <div className="flex justify-center ">
      <div className="grid grid-cols-2 gap-5 w-[95%] mt-5 justify-center">
        {/* <Camera connection={connected} ros={ros} /> */}
        {/* <FaceDetection connection={connected} ros={ros} /> */}
        <SewerDetection connection={connected} ros={ros} />
        <SLAM connection={true} ros={ros} />
        <Dashboard connection={connected} ros={ros} />
      </div>
    </div>
    
  );
}

export default App;