import ROSLIB, { Ros } from "roslib";
import { useEffect, useState } from "react";
import BatteryIndicator from "./BatteryIndicator";

interface StatsProps {
  connection: boolean;
  ros: Ros | null;
}

function Stats({ connection, ros }: StatsProps) {
  const [batteryLevel, setBatteryLevel] = useState<number>(0);

  const BATTERY_TOPIC = "/husky3/platform/mcu/status/power";
  const MESSAGE_TYPE = "clearpath_platform_msgs/msg/Power";

  useEffect(() => {
    if (ros && connection) {
      const listener = new ROSLIB.Topic({
        ros,
        name: BATTERY_TOPIC,
        messageType: MESSAGE_TYPE,
      });

      listener.subscribe((message) => {
        console.log("BATTERY: ", message);
      });

      // Cleanup on unmount
      return () => {
        listener.unsubscribe();
      };
    }
  }, [ros, connection]);

  return (
    <div className="rounded-lg bg-gray-100 w-165 h-80 p-5">
      <div className="h-10 rounded-lg bg-gray-200 flex justify-between items-center px-5">
        <div className="flex items-center">
          <p className="font-semibold ">{"Connection Status:"}</p>
          {connection ? (
            <span className="h-3.5 w-3.5 rounded-2xl bg-green-400 mx-2" />
          ) : (
            <span className="h-3.5 w-3.5 rounded-2xl bg-red-400 mx-2" />
          )}
        </div>
        <BatteryIndicator level={batteryLevel} />
      </div>
    </div>
  );
}

export default Stats;
