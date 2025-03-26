import React from "react";

interface KeyProps {
  letter: string;
  label?: string;
  size?: "normal" | "large";
  icon?: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  type?: "direction" | "speed" | "default";
}

function EnhancedKey({ 
  letter, 
  label, 
  size = "normal", 
  icon, 
  active = false,
  disabled = false,
  className = "",
  type = "default"
}: KeyProps) {
  
  // Convert comma and period to more readable symbols
  const displaySymbol = letter === "," ? "," : letter === "." ? "." : letter;
  
  // Create a label from the letter if none provided
  const keyLabel = label || getDefaultLabel(letter);
  
  // Define color schemes based on type and state
  const getColorScheme = () => {
    if (disabled) return "opacity-50 cursor-not-allowed";
    
    if (active) {
      switch(type) {
        case "direction":
          return "bg-gradient-to-br from-indigo-700 to-indigo-900 text-white transform scale-95 shadow-inner";
        case "speed":
          return "bg-gradient-to-br from-orange-400 to-orange-500 text-white transform scale-95 shadow-inner";
        default:
          return "bg-gradient-to-br from-indigo-600 to-indigo-800 text-white transform scale-95 shadow-inner";
      }
    } else {
      switch(type) {
        case "direction":
          return "bg-gradient-to-br from-gray-100 to-gray-300 text-indigo-900 hover:from-indigo-100 hover:to-indigo-200";
        case "speed":
          return "bg-gradient-to-br from-gray-100 to-gray-300 text-indigo-900 hover:from-orange-100 hover:to-orange-200";
        default:
          return "bg-gradient-to-br from-gray-100 to-gray-300 text-indigo-900 hover:from-gray-200 hover:to-gray-300";
      }
    }
  };
  
  // Define shadow styles based on active state
  const getShadowStyle = () => {
    return active 
      ? { boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.3)' }
      : { boxShadow: '0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.2)' };
  };
  
  return (
    <div
      id={letter}
      className={`
        relative rounded-lg flex flex-col items-center justify-center
        ${size === "large" ? "p-4" : "p-3"}
        ${getColorScheme()}
        transition-all duration-150 ease-in-out
        border ${active ? 'border-gray-600' : 'border-gray-300'}
        ${className}
      `}
      style={getShadowStyle()}
    >
      <div className="text-xl font-bold mb-1">{displaySymbol}</div>
      {icon && <div className="text-lg mb-1">{icon}</div>}
      <div className="text-xs text-center font-medium">{keyLabel}</div>
      
      {/* Pulse effect when active */}
      {active && (
        <div className="absolute inset-0 rounded-lg bg-white opacity-10 animate-pulse"></div>
      )}
    </div>
  );
}

// Helper function to get default labels based on key
function getDefaultLabel(key: string): string {
  const labels: Record<string, string> = {
    "u": "Forward Left",
    "i": "Forward",
    "o": "Forward Right",
    "j": "Turn Left",
    "k": "Stop",
    "l": "Turn Right",
    "m": "Back Left",
    ",": "Backward",
    ".": "Back Right",
    "q": "Speed +",
    "z": "Speed -",
    "w": "Linear +",
    "x": "Linear -",
    "e": "Angular +",
    "c": "Angular -"
  };
  
  return labels[key] || key.toUpperCase();
}

export default EnhancedKey;