interface BatteryIndicatorProps {
  level: number;
  isCharging?: boolean;
}

function BatteryIndicator({ level, isCharging }: BatteryIndicatorProps) {
  const batteryLevel = Math.max(0, Math.min(100, level));

  const getBackgroundColor = () => {
    if (batteryLevel <= 20) return "bg-red-400";
    if (batteryLevel <= 50) return "bg-yellow-400";
    return "bg-green-400";
  };

  const getTextColor = () => {
    return "text-gray-600";
  };

  return (
    <div className="flex items-center bg-gray-200">
      <div className="relative flex items-center w-16 h-8">
        <div className="h-7 w-14 rounded border-4 border-zinc-300 overflow-hidden flex items-center">
          <div
            className={`h-full ${getBackgroundColor()} transition-all duration-300 ease-in-out`}
            style={{ width: `${batteryLevel}%` }}
          ></div>

          <span
            className={`absolute inset-0 flex items-center justify-center ${getTextColor()} text-xs font-bold z-10`}
          >
            {batteryLevel}%
          </span>
        </div>

        <div className="h-4 w-1.5 bg-zinc-300 rounded-r"></div>

        {isCharging && (
          <div className="absolute inset-y-0 right-0 flex items-center justify-center pr-6">
            <svg
              className="text-black drop-shadow-md"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M11 15H6.75L13 9H9L11 3.5L17.25 9H13L11 15Z" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

export default BatteryIndicator;
