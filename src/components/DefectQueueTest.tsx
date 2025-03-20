import React, { useState } from 'react';
import DefectQueue from './DefectExport'; // Import your existing component
import { Download } from 'lucide-react';

// Mock defect data
const mockDefects = [
  {
    id: "DEF-001",
    timestamp: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
    position: { x: 12.45, y: 3.78, z: 0.25 },
    severity: "Critical",
    type: "Crack",
    confidence: 97.5
  },
  {
    id: "DEF-002",
    timestamp: Date.now() - 1000 * 60 * 30, // 30 minutes ago
    position: { x: 8.32, y: 5.16, z: 0.18 },
    severity: "High",
    type: "Surface Defect",
    confidence: 92.3
  },
  {
    id: "DEF-003",
    timestamp: Date.now() - 1000 * 60 * 10, // 10 minutes ago
    position: { x: 15.67, y: 2.91, z: 0.45 },
    severity: "Medium",
    type: "Corrosion",
    confidence: 85.1
  },
  {
    id: "DEF-004",
    timestamp: Date.now() - 1000 * 60 * 5, // 5 minutes ago
    position: { x: 6.12, y: 9.04, z: 0.32 },
    severity: "Low",
    type: "Discoloration",
    confidence: 78.9
  },{
    id: "DEF-009",
    timestamp: Date.now() - 1000 * 60 * 5, // 5 minutes ago
    position: { x: 6.12, y: 9.04, z: 0.32 },
    severity: "Low",
    type: "Discoloration",
    confidence: 78.9
  }

];

// Mock placeholder image data
const placeholderImageBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const DefectQueueTest: React.FC = () => {
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  // Mock export handler
  const handleExport = async (data: any) => {
    setExportStatus(`Exporting ${data.defect.id} as ${data.format}...`);
    
    // Simulate API call
    try {
      if (data.format === 'csv') {
        // Mock using the electron API
        const result = await window.electronAPI.saveFile(
          generateCSV(data.defect),
          `defect-${data.defect.id}.csv`,
          { camera: data.cameraImage, map: data.slamMapImage }
        );
        setExportStatus(`CSV Export ${result.success ? 'completed' : 'failed'}`);
      } else {
        // Mock using the electron API for PDF
        const result = await window.electronAPI.saveAsPDF(
          data.defect,
          data.cameraImage,
          data.slamMapImage,
          `defect-${data.defect.id}.pdf`
        );
        setExportStatus(`PDF Export ${result.success ? 'completed' : 'failed'}`);
      }
    } catch (error) {
      console.error("Export error:", error);
      setExportStatus("Export failed");
    }
    
    // Clear status after 3 seconds
    setTimeout(() => {
      setExportStatus(null);
    }, 3000);
  };

  // Mock function to get camera screenshot
  const getCameraScreenshot = async (defectId: string): Promise<string> => {
    console.log(`Getting camera image for defect ${defectId}`);
    // In a real app, this would fetch the actual image
    return placeholderImageBase64;
  };

  // Mock function to get SLAM map screenshot
  const getSlamMapScreenshot = async (position: any): Promise<string> => {
    console.log(`Getting SLAM map for position (${position.x}, ${position.y}, ${position.z})`);
    // In a real app, this would render the map with the position marked
    return placeholderImageBase64;
  };

  // Helper function to generate mock CSV data
  const generateCSV = (defect: any): string => {
    return `id,timestamp,type,severity,confidence,x,y,z
${defect.id},${defect.timestamp},${defect.type},${defect.severity},${defect.confidence},${defect.position.x},${defect.position.y},${defect.position.z}`;
  };

  return (
    <div className="p-0 max-w-full mx-0">
      {exportStatus && (
        <div className="mb-2 p-2 bg-blue-100 text-blue-800 rounded flex items-center text-sm">
          <Download className="mr-2" size={16} />
          {exportStatus}
        </div>
      )}
      <DefectQueue 
        defects={mockDefects}
        onExport={handleExport}
        getCameraScreenshot={getCameraScreenshot}
        getSlamMapScreenshot={getSlamMapScreenshot}
        className="h-full" // Remove min-height constraint
      />
    </div>
  );
};

export default DefectQueueTest;