/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useEffect } from 'react';
import { Download, MapPin, Camera, List, PanelBottomClose, ChevronDown, FileText } from 'lucide-react';
import { useDataContext } from "@/context/DataProvider";

// TypeScript interfaces
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

// Define the minimal props we need
interface DefectQueueProps {
  className?: string;
}

// Main DefectQueue component
const DefectQueue: React.FC<DefectQueueProps> = ({
  className = ''
}) => {
  const { 
    defects, 
    exportCSV,
    downloadImages
  } = useDataContext();
  
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);
  
  // Clear selection if defects list changes
  useEffect(() => {
    if (defects.length === 0) {
      setSelectedDefect(null);
    } else if (selectedDefect && !defects.find(d => d.id === selectedDefect.id)) {
      setSelectedDefect(null);
    }
  }, [defects, selectedDefect]);

  // Handle export CSV button click
  const handleExportCSV = async (): Promise<void> => {
    if (!selectedDefect) return;
    
    try {
      await exportCSV(selectedDefect);
    } catch (error) {
      console.error("CSV export failed:", error);
    }
  };

  // Handle download images button click
  const handleDownloadImages = async (): Promise<void> => {
    if (!selectedDefect) return;
    
    try {
      await downloadImages(selectedDefect);
    } catch (error) {
      console.error("Image download failed:", error);
    }
  };

  return (
    <div className={`flex flex-col h-full border rounded-lg shadow-sm ${className}`}>
      {/* Header */}
      <div className="p-3 bg-gray-100 border-b flex justify-between items-center">
        <h2 className="text-lg font-semibold flex items-center">
          <List className="mr-2" size={18} />
          Defects Queue
        </h2>
        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
          {defects.length} detected
        </span>
      </div>
      
      {/* Defects List */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="overflow-y-auto flex-1">
          {defects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 p-6">
              <MapPin size={32} />
              <p className="mt-2">No defects detected</p>
            </div>
          ) : (
            <ul className="divide-y overflow-y-auto h-80">
              {defects.map(defect => (
                <li 
                  key={defect.id}
                  className={`p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedDefect?.id === defect.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                  }`}
                  onClick={() => setSelectedDefect(defect)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">Defect #{defect.id}</h3>
                      <p className="text-sm text-gray-600">
                        {new Date(defect.timestamp).toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        <span className="flex items-center">
                          <MapPin size={14} className="mr-1" />
                          Position: {formatPosition(defect.position)}
                        </span>
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      getDefectSeverityClass(defect.severity)
                    }`}>
                      {defect.severity}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        
        {selectedDefect && (
          <div className="absolute bottom-0 w-xs bg-gray-50 border p-4 overflow-y-auto max-h-1/2 shadow-lg transition-all duration-300">
            <div className="flex justify-between items-center">
              <h3 className="font-medium">#{selectedDefect.id}</h3>
              <button 
                onClick={() => setSelectedDefect(null)} 
                className="flex p-2 rounded-full hover:bg-gray-200 transition-colors"
                title="Close details"
              >
                <ChevronDown size={20}/>
              </button>
              <div className="flex items-center">
                <span className={`px-2 py-1 mr-2 rounded-full text-xs font-medium ${
                  getDefectSeverityClass(selectedDefect.severity)
                }`}>
                  {selectedDefect.severity}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
              <div>
                <span className="text-gray-500">Position:</span> 
                <span className="font-medium ml-1">{formatPosition(selectedDefect.position)}</span>
              </div>
              <div>
                <span className="text-gray-500">Detected:</span>
                <span className="font-medium ml-1">
                  {new Date(selectedDefect.timestamp).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Type:</span>
                <span className="font-medium ml-1">{selectedDefect.type}</span>
              </div>
              <div>
                <span className="text-gray-500">Confidence:</span>
                <span className="font-medium ml-1">{selectedDefect.confidence.toFixed(2)}%</span>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={handleExportCSV}
                className="flex-1 flex items-center justify-center py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                <Download size={16} className="mr-2" />
                Export CSV
              </button>
              <button
                onClick={handleDownloadImages}
                className="flex-1 flex items-center justify-center py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              >
                <Camera size={16} className="mr-2" />
                Download Images
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper functions
const formatPosition = (pos: Position): string => {
  if (!pos) return 'Unknown';
  return `(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`;
};

const getDefectSeverityClass = (severity: string): string => {
  switch (severity.toLowerCase()) {
    case 'critical':
      return 'bg-red-100 text-red-800';
    case 'high':
      return 'bg-orange-100 text-orange-800';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800';
    case 'low':
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export default DefectQueue;