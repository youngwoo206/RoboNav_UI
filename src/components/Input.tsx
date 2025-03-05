import { useState, useEffect } from "react";
import ROSLIB from "roslib";
import Key from "./Key";
import SpeedIndicator from "./SpeedIndicator";

// Define the Twist message interface matching ROS geometry_msgs/Twist
interface TwistMessage {
  linear: {
    x: number;
    y: number;
    z: number;
  };
  angular: {
    x: number;
    y: number;
    z: number;
  };
}

interface RosIntegrationProps {
  ros: ROSLIB.Ros | null;
  connection: boolean;
}

function Input({ ros, connection }: RosIntegrationProps) {
  const [direction, setDirection] = useState<string | null>(null);
  const [removeDirection, setRemoveDirection] = useState<string | null>(null);

  const [overallSpeed, setOverallSpeed] = useState<number>(0);
  const [linearSpeed, setLinearSpeed] = useState<number>(0);
  const [angularSpeed, setAngularSpeed] = useState<number>(0);

  const maxSpeed: number = 4;

  // ROS Topic for Cmd Velocity
  const CMD_VEL_TOPIC = "/husky3/cmd_vel";
  const CMD_VEL_TYPE = "geometry_msgs/Twist";

  // Create a ROS publisher for cmd_vel
  const cmdVelPublisher = ros ? new ROSLIB.Topic({
    ros,
    name: CMD_VEL_TOPIC,
    messageType: CMD_VEL_TYPE
  }) : null;

  // Publish velocity commands to ROS
  const publishVelocityCommand = () => {
    if (!ros || !connection || !cmdVelPublisher) return;

    // Create Twist message with explicit typing
    const twistMsg: TwistMessage = {
      linear: {
        x: linearSpeed,
        y: 0,
        z: 0
      },
      angular: {
        x: 0,
        y: 0,
        z: angularSpeed
      }
    };

    // Modify linear velocity based on direction
    switch (direction) {
      case 'u': // Forward-Left
        twistMsg.linear.x = linearSpeed;
        twistMsg.angular.z = angularSpeed;
        break;
      case 'i': // Forward
        twistMsg.linear.x = linearSpeed;
        break;
      case 'o': // Forward-Right
        twistMsg.linear.x = linearSpeed;
        twistMsg.angular.z = -angularSpeed;
        break;
      case 'j': // Left
        twistMsg.angular.z = angularSpeed;
        break;
      case 'k': // Stop
        twistMsg.linear.x = 0;
        twistMsg.angular.z = 0;
        break;
      case 'l': // Right
        twistMsg.angular.z = -angularSpeed;
        break;
      case 'm': // Backward-Left
        twistMsg.linear.x = -linearSpeed;
        twistMsg.angular.z = angularSpeed;
        break;
      case ',': // Backward
        twistMsg.linear.x = -linearSpeed;
        break;
      case '.': // Backward-Right
        twistMsg.linear.x = -linearSpeed;
        twistMsg.angular.z = -angularSpeed;
        break;
    }

    // Publish the message
    cmdVelPublisher.publish(new ROSLIB.Message(twistMsg));
  };

  // Publish velocity whenever direction or speeds change
  useEffect(() => {
    publishVelocityCommand();
  }, [direction, linearSpeed, angularSpeed, connection]);

  const handleKeyUp = (event: KeyboardEvent) => {
    const key = event.key;
    if (["u", "i", "o", "j", "k", "l", "m", ",", "."].includes(key)) {
      setRemoveDirection(() => key);
      setDirection(() => null);
      
      // Publish stop command when direction is released
      if (cmdVelPublisher) {
        const stopMsg: TwistMessage = {
          linear: { x: 0, y: 0, z: 0 },
          angular: { x: 0, y: 0, z: 0 }
        };
        cmdVelPublisher.publish(new ROSLIB.Message(stopMsg));
      }
    } else if (["q", "z", "w", "x", "e", "c"].includes(key)) {
      const el = document.getElementById(key);
      el?.classList.remove("text-red-500", "scale-96", "shadow-inner");
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const key = event.key;

    // Handle direction keys
    if (["u", "i", "o", "j", "k", "l", "m", ",", "."].includes(key)) {
      setDirection(() => key);
    }
    // Handle overallSpeed (q > increase, z > decrease)
    else if (["q", "z"].includes(key)) {
      const el = document.getElementById(key);
      el?.classList.add("text-red-500", "scale-96", "shadow-inner");
      if (key === "q") {
        setOverallSpeed((prev) => {
          if (prev < maxSpeed) {
            return prev + 1;
          }
          return prev; // No change if maxSpeed is reached
        });
      } else if (key === "z") {
        setOverallSpeed((prev) => {
          if (prev > 0) {
            return prev - 1;
          }
          return prev; // No change if speed is already 0
        });
      }
    }
    // Handle linearSpeed (w > increase, x > decrease)
    else if (["w", "x"].includes(key)) {
      const el = document.getElementById(key);
      el?.classList.add("text-red-500", "scale-96", "shadow-inner");
      if (key === "w") {
        setLinearSpeed((prev) => {
          if (prev < maxSpeed) {
            return prev + 1;
          }
          return prev; // No change if maxSpeed is reached
        });
      } else if (key === "x") {
        setLinearSpeed((prev) => {
          if (prev > 0) {
            return prev - 1;
          }
          return prev; // No change if speed is already 0
        });
      }
    }
    // Handle angularSpeed (e > increase, c > decrease)
    else if (["e", "c"].includes(key)) {
      const el = document.getElementById(key);
      el?.classList.add("text-red-500", "scale-96", "shadow-inner");
      if (key === "e") {
        setAngularSpeed((prev) => {
          if (prev < maxSpeed) {
            return prev + 1;
          }
          return prev; // No change if maxSpeed is reached
        });
      } else if (key === "c") {
        setAngularSpeed((prev) => {
          if (prev > 0) {
            return prev - 1;
          }
          return prev; // No change if speed is already 0
        });
      }
    }
  };

  useEffect(() => {
    if (direction) {
      const el = document.getElementById(direction);
      el?.classList.add("text-red-500", "scale-96", "shadow-inner");
    }
  }, [direction]);

  useEffect(() => {
    if (removeDirection) {
      const el = document.getElementById(removeDirection);
      el?.classList.remove("text-red-500", "scale-96", "shadow-inner");
      setRemoveDirection(() => null);
    }
  }, [removeDirection]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

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
      {/* {!connection && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <p className="text-white">ROS Not Connected</p>
        </div>
      )} */}
    </div>
  );
}

export default Input;
