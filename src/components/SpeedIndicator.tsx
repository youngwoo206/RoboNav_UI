interface SpeedIndicatorProps {
  speed: number;
  maxSpeed: number;
}

function SpeedIndicator({ speed, maxSpeed }: SpeedIndicatorProps) {
  const speeds = [];

  for (let i = 0; i < speed + 1; i++) {
    speeds.push(maxSpeed - i + 1);
  }

  //NOTE: grid-rows-maxSpeed is hardcoded

  return (
    <div className="w-15 h-15 flex justify-center">
      <div className={`w-6 h-15 bg-slate-50 grid grid-rows-5 grid-cols-1`}>
        {speeds.map((row_id) => {
          return (
            <div
              key={row_id}
              className="w-6 h-3 bg-amber-300"
              style={{ gridRowStart: row_id }}
            />
          );
        })}
      </div>
    </div>
  );
}

export default SpeedIndicator;
