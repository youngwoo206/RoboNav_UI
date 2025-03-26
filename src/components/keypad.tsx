import React from "react";
import EnhancedKey from "./Key";

interface KeypadProps {
  directionKeys: Record<string, boolean>;
  eStopActive: boolean;
  overallSpeed: number;
  linearSpeed: number;
  angularSpeed: number;
  maxSpeed: number;
  toggleEStop: () => void;
}

function ImprovedKeypad({
  directionKeys,
  eStopActive,
  overallSpeed,
  linearSpeed,
  angularSpeed,
  maxSpeed,
  toggleEStop
}: KeypadProps) {
  // Convert RGB string to usable color
  const secondaryColor = "rgb(232,156,56)"; // Orange color
  const primaryColor = "bg-indigo-900"; // Dark indigo

  // Render speed indicator dots
  const renderSpeedDots = (current: number, max: number, colorType: "primary" | "secondary" = "primary") => {
    const activeColor = colorType === "primary" ? "bg-indigo-600" : "bg-orange-500";
    
    return (
      <div className="flex space-x-1 mt-1">
        {Array.from({ length: max }).map((_, index) => (
          <div
            key={index}
            className={`h-2 w-2 rounded-full ${
              index < current ? activeColor : "bg-gray-300"
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="p-6 bg-gray-300 rounded-xl">
      <div className="grid grid-cols-2 gap-8">
        {/* Movement Control Pad */}
        <div className="space-y-4">
          <h3 className="text-center text-lg font-semibold text-black mb-3">Movement Controls</h3>
          
          <div className="grid grid-cols-3 gap-2 p-4 bg-indigo-900 bg-opacity-40 rounded-lg shadow-inner">
            <EnhancedKey 
              letter="u" 
              label="↖" 
              active={directionKeys["u"]} 
              disabled={eStopActive}
              type="direction"
            />
            <EnhancedKey 
              letter="i" 
              label="↑" 
              active={directionKeys["i"]} 
              disabled={eStopActive}
              type="direction"
            />
            <EnhancedKey 
              letter="o" 
              label="↗" 
              active={directionKeys["o"]} 
              disabled={eStopActive}
              type="direction"
            />
            
            <EnhancedKey 
              letter="j" 
              label="←" 
              active={directionKeys["j"]} 
              disabled={eStopActive}
              type="direction"
            />
            <EnhancedKey 
              letter="k" 
              label="■" 
              active={directionKeys["k"]} 
              disabled={eStopActive}
              type="direction"
            />
            <EnhancedKey 
              letter="l" 
              label="→" 
              active={directionKeys["l"]} 
              disabled={eStopActive}
              type="direction"
            />
            
            <EnhancedKey 
              letter="m" 
              label="↙" 
              active={directionKeys["m"]} 
              disabled={eStopActive}
              type="direction"
            />
            <EnhancedKey 
              letter="," 
              label="↓" 
              active={directionKeys[","]} 
              disabled={eStopActive}
              type="direction"
            />
            <EnhancedKey 
              letter="." 
              label="↘" 
              active={directionKeys["."]} 
              disabled={eStopActive}
              type="direction"
            />
          </div>
        </div>

        {/* Speed Control Pad */}
        <div className="space-y-4">
          <h3 className="text-center text-lg font-semibold text-black mb-3">Speed Settings</h3>
          
          <div className="grid grid-cols-3 gap-4 p-4 bg-indigo-900 bg-opacity-40 rounded-lg shadow-inner">
            <div className="space-y-2">
              <div className="text-center text-sm font-medium text-gray-200">Overall</div>
              <div className="flex flex-col space-y-2">
                <EnhancedKey 
                  letter="q" 
                  label="+" 
                  disabled={eStopActive || overallSpeed >= maxSpeed}
                  type="speed"
                />
                <div className="text-center font-bold text-lg text-white">{overallSpeed}</div>
                {renderSpeedDots(overallSpeed, maxSpeed, "secondary")}
                <EnhancedKey 
                  letter="z" 
                  label="-" 
                  disabled={eStopActive || overallSpeed <= 0}
                  type="speed"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="text-center text-sm font-medium text-gray-200">Linear</div>
              <div className="flex flex-col space-y-2">
                <EnhancedKey 
                  letter="w" 
                  label="+" 
                  disabled={eStopActive || linearSpeed >= maxSpeed}
                  type="speed"
                />
                <div className="text-center font-bold text-lg text-white">{linearSpeed.toFixed(1)}</div>
                {renderSpeedDots(linearSpeed, maxSpeed, "secondary")}
                <EnhancedKey 
                  letter="x" 
                  label="-" 
                  disabled={eStopActive || linearSpeed <= 0.1}
                  type="speed"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="text-center text-sm font-medium text-gray-200">Angular</div>
              <div className="flex flex-col space-y-2">
                <EnhancedKey 
                  letter="e" 
                  label="+" 
                  disabled={eStopActive || angularSpeed >= maxSpeed}
                  type="speed"
                />
                <div className="text-center font-bold text-lg text-white">{angularSpeed.toFixed(1)}</div>
                {renderSpeedDots(angularSpeed, maxSpeed, "secondary")}
                <EnhancedKey 
                  letter="c" 
                  label="-" 
                  disabled={eStopActive || angularSpeed <= 0.1}
                  type="speed"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* E-Stop Button */}
      <div className="mt-6">
        <button
          id="e-stop"
          onClick={toggleEStop}
          className={`
            w-full py-4 rounded-lg font-bold text-center transition-all duration-300
            ${eStopActive 
              ? "bg-gradient-to-r from-red-600 to-red-700 text-white border-2 border-red-800 shadow-inner" 
              : "bg-gradient-to-r from-gray-100 to-gray-300 text-indigo-900 border-2 border-gray-400 hover:from-red-100 hover:to-red-200"
            }
            relative overflow-hidden
          `}
        >
          {eStopActive && (
            <div className="absolute inset-0 bg-red-500 opacity-20 animate-ping"></div>
          )}
          {eStopActive 
            ? "⚠️ E-STOP ACTIVE - CLICK TO RELEASE ⚠️" 
            : "PRESS SPACE FOR EMERGENCY STOP"}
        </button>
        <div className="text-xs text-center mt-2 text-gray-300">
          Keyboard shortcut: Spacebar
        </div>
      </div>
    </div>
  );
}

export default ImprovedKeypad;