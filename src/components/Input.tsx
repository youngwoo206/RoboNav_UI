import { useEffect, useState } from "react";
import ROSLIB from "roslib";
import Key from "./Key";
import SpeedIndicator from "./SpeedIndicator";

interface RosIntegrationProps {
  ros: ROSLIB.Ros | null;
  connection: boolean;
}

const Input = ({ ros, connection }: RosIntegrationProps) => {
  const [keysPressed, setKeysPressed] = useState<Record<string, boolean>>({});
  const [direction, setDirection] = useState<string | null>(null);
  const [cmdVelPublisher, setCmdVelPublisher] = useState<ROSLIB.Topic | null>(null);
  const [overallSpeed, setOverallSpeed] = useState<number>(0);
  const [linearSpeed, setLinearSpeed] = useState<number>(1.0);
  const [angularSpeed, setAngularSpeed] = useState<number>(1.0);
  const maxSpeed: number = 4;
  useEffect(() => {
    if (ros && connection) {
      const publisher = new ROSLIB.Topic({
        ros,
        name: "/cmd_vel",
        messageType: "geometry_msgs/Twist",
      });
      setCmdVelPublisher(publisher);
    }
  }, [ros, connection]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      if (["u", "i", "o", "j", "k", "l", "m", ",", "."].includes(key)) {
        setKeysPressed((prev) => ({ ...prev, [key]: true }));
        setDirection(key);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key;
      if (["u", "i", "o", "j", "k", "l", "m", ",", "."].includes(key)) {
        setKeysPressed((prev) => ({ ...prev, [key]: false }));
        setDirection(null);

        if (cmdVelPublisher) {
          const stopMsg = new ROSLIB.Message({
            linear: { x: 0, y: 0, z: 0 },
            angular: { x: 0, y: 0, z: 0 },
          });
          cmdVelPublisher.publish(stopMsg);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [cmdVelPublisher]);

  useEffect(() => {
    if (direction && cmdVelPublisher) {
      let moveMsg;
      switch (direction) {
        case "i": // Forward
          moveMsg = { linear: { x: 1, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } };
          break;
        case "k": // Backward
          moveMsg = { linear: { x: -1, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } };
          break;
        case "j": // Left
          moveMsg = { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 1 } };
          break;
        case "l": // Right
          moveMsg = { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: -1 } };
          break;
        default:
          moveMsg = { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } };
      }
      cmdVelPublisher.publish(new ROSLIB.Message(moveMsg));
    }
  }, [direction, cmdVelPublisher]);

  return (
    <div className="rounded-lg bg-gray-100 w-165 h-80 justify-center p-5">
      <div className="flex items-center justify-between gap-5">
        <div className="w-70 h-60 rounded-lg bg-gray-200 grid grid-cols-3 grid-rows-3 gap-5 p-5 align-middle justify-center">
          <Key letter="q" />
          <Key letter="w" />
          <Key letter="e" />
          <SpeedIndicator speed={overallSpeed} maxSpeed={maxSpeed} />
          <SpeedIndicator speed={linearSpeed} maxSpeed={maxSpeed} />
          <SpeedIndicator speed={angularSpeed} maxSpeed={maxSpeed} />
          <Key letter="z" />
          <Key letter="x" />
          <Key letter="c" />
        </div>
        <div className="w-70 h-60 rounded-lg bg-gray-200 grid grid-cols-3 grid-rows-3 gap-5 p-5 align-middle justify-center">
          <Key letter="u" />
          <Key letter="i" />
          <Key letter="o" />
          <Key letter="j" />
          <Key letter="k" />
          <Key letter="l" />
          <Key letter="m" />
          <Key letter="," />
          <Key letter="." />
        </div>
      </div>
      <div className="h-10 w-72 bg-red-200 rounded-md px-3 font-semibold mx-auto mt-3 text-center">
        Space for E-Stop
      </div>
    </div>
  );
};

export default Input;


//   return (
//     <div className="rounded-lg bg-gray-100 w-165 h-80 justify-center p-5">
//       <div className="flex items-center justify-between gap-5">
//         <div className="w-70 h-60 rounded-lg bg-gray-200 grid grid-cols-3 grid-rows-3 gap-5 p-5 align-middle justify-center">
//           <Key letter="q" />
//           <Key letter="w" />
//           <Key letter="e" />
//           <SpeedIndicator speed={overallSpeed} maxSpeed={maxSpeed} />
//           <SpeedIndicator speed={linearSpeed} maxSpeed={maxSpeed} />
//           <SpeedIndicator speed={angularSpeed} maxSpeed={maxSpeed} />
//           <Key letter="z" />
//           <Key letter="x" />
//           <Key letter="c" />
//         </div>
//         <div className="w-70 h-60 rounded-lg bg-gray-200 grid grid-cols-3 grid-rows-3 gap-5 p-5 align-middle justify-center">
//           <Key letter="u" />
//           <Key letter="i" />
//           <Key letter="o" />
//           <Key letter="j" />
//           <Key letter="k" />
//           <Key letter="l" />
//           <Key letter="m" />
//           <Key letter="," />
//           <Key letter="." />
//         </div>
//       </div>
//       <div className="h-10 w-72 bg-red-200 rounded-md px-3 font-semibold mx-auto mt-3 text-center">
//         Space for E-Stop
//       </div>
//     </div>
//   );
// }

// export default Input;
