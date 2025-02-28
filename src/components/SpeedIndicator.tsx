interface SpeedIndicatorProps {
  speed: number;
  maxSpeed: number;
}

function SpeedIndicator({ speed, maxSpeed }: SpeedIndicatorProps) {
  const speeds = [];

  for (let i = 0; i < speed + 1; i++) {
    speeds.push(maxSpeed - i + 1);
  }

  return (
    <div className="w-15 h-15 flex justify-center">
      <div
        className={`w-6 h-15 bg-slate-50 grid grid-rows-${
          maxSpeed + 1
        } grid-cols-1`}
        style={{
          gridTemplateRows: `repeat(${maxSpeed + 1}, minmax(0, 1fr))`, // Dynamically set rows
        }}
      >
        {speeds.map((row_id) => (
          <div
            key={row_id}
            className={`w-6 h-3 bg-amber-300 row-start-${row_id}`}
          />
        ))}
      </div>
    </div>
  );
}

export default SpeedIndicator;
