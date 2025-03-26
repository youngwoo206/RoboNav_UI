import { useState, useEffect, useRef } from "react";
import ROSLIB from "roslib";
import Telemetry from "./Telemetry";
import ImprovedKeypad from "./keypad";
import DefectExport from "./DefectExport";
import MockDefectData from "./MockDefect"; // Import the mock data component
import { motion } from "framer-motion";

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
  const [overallSpeed, setOverallSpeed] = useState<number>(0);
  const [linearSpeed, setLinearSpeed] = useState<number>(1.0);
  const [angularSpeed, setAngularSpeed] = useState<number>(1.0);
  const [keyPressed, setKeyPressed] = useState<Record<string, boolean>>({});
  const [eStopActive, setEStopActive] = useState<boolean>(false);
  const intervalRef = useRef<number | null>(null);
  const maxSpeed: number = 4;
  
  // Flag to enable/disable mock data - set to !connection to automatically use
  // mock data when disconnected, or set to true to always use mock data
  const useMockData = !connection;

  // ROS Topic for Cmd Velocity
  const CMD_VEL_TOPIC = "/husky3/cmd_vel";
  const CMD_VEL_TYPE = "geometry_msgs/msg/Twist";

  // Create a ROS publisher for cmd_vel
  const cmdVelPublisher = ros
    ? new ROSLIB.Topic({
        ros,
        name: CMD_VEL_TOPIC,
        messageType: CMD_VEL_TYPE,
      })
    : null;

  // Send an emergency stop command
  const sendEStopCommand = () => {
    if (!ros || !connection || !cmdVelPublisher) {
      console.error("Cannot send E-Stop command - no ROS connection");
      return;
    }

    // Create a zero velocity twist message
    const stopMsg: TwistMessage = {
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    };

    // Send multiple stop commands to ensure they are received
    cmdVelPublisher.publish(new ROSLIB.Message(stopMsg));

    // Send additional stop commands with slight delays for redundancy
    setTimeout(() => {
      if (cmdVelPublisher) cmdVelPublisher.publish(new ROSLIB.Message(stopMsg));
    }, 50);

    setTimeout(() => {
      if (cmdVelPublisher) cmdVelPublisher.publish(new ROSLIB.Message(stopMsg));
    }, 100);

    console.log("E-STOP command sent");
  };

  // Toggle E-Stop state
  const toggleEStop = () => {
    const newEStopState = !eStopActive;
    setEStopActive(newEStopState);

    if (newEStopState) {
      // Activating E-Stop
      setDirection(null);
      sendEStopCommand();
    }
    // When deactivating, don't need to do anything special - just allow commands again
  };

  // Publish velocity commands to ROS
  const publishVelocityCommand = () => {
    if (!ros || !connection || !cmdVelPublisher) {
      console.error("Cannot publish", {
        ros: !!ros,
        connection,
        publisher: !!cmdVelPublisher,
      });
      return;
    }

    if (eStopActive) {
      return;
    }

    // Create Twist message with explicit typing
    const twistMsg: TwistMessage = {
      linear: {
        x: 0,
        y: 0,
        z: 0,
      },
      angular: {
        x: 0,
        y: 0,
        z: 0,
      },
    };

    // Apply speed modifier
    const speedFactor = Math.max(1, overallSpeed);
    const currentLinearSpeed = linearSpeed * speedFactor;
    const currentAngularSpeed = angularSpeed * speedFactor;

    // Modify velocity based on direction
    if (direction) {
      switch (direction) {
        case "u": // Forward-Left
          twistMsg.linear.x = currentLinearSpeed;
          twistMsg.angular.z = currentAngularSpeed;
          break;
        case "i": // Forward
          twistMsg.linear.x = currentLinearSpeed;
          twistMsg.angular.z = 0;
          break;
        case "o": // Forward-Right
          twistMsg.linear.x = currentLinearSpeed;
          twistMsg.angular.z = -currentAngularSpeed;
          break;
        case "j": // Left
          twistMsg.linear.x = 0;
          twistMsg.angular.z = currentAngularSpeed;
          break;
        case "k": // Stop
          twistMsg.linear.x = 0;
          twistMsg.angular.z = 0;
          break;
        case "l": // Right
          twistMsg.linear.x = 0;
          twistMsg.angular.z = -currentAngularSpeed;
          break;
        case "m": // Backward-Left
          twistMsg.linear.x = -currentLinearSpeed;
          twistMsg.angular.z = currentAngularSpeed;
          break;
        case ",": // Backward
          twistMsg.linear.x = -currentLinearSpeed;
          twistMsg.angular.z = 0;
          break;
        case ".": // Backward-Right
          twistMsg.linear.x = -currentLinearSpeed;
          twistMsg.angular.z = -currentAngularSpeed;
          break;
      }
    }

    // Publish the message
    cmdVelPublisher.publish(new ROSLIB.Message(twistMsg));
    console.log("Publishing Command:", JSON.stringify(twistMsg));
  };

  // Explicitly send a stop command
  const sendStopCommand = () => {
    if (!ros || !connection || !cmdVelPublisher) return;

    const stopMsg: TwistMessage = {
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    };

    // Send stop command multiple times to ensure it's received
    cmdVelPublisher.publish(new ROSLIB.Message(stopMsg));
    setTimeout(() => {
      if (cmdVelPublisher) cmdVelPublisher.publish(new ROSLIB.Message(stopMsg));
    }, 50);
    setTimeout(() => {
      if (cmdVelPublisher) cmdVelPublisher.publish(new ROSLIB.Message(stopMsg));
    }, 100);
  };

  // Update interval when direction changes
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (eStopActive) {
      return;
    }

    // If there's a direction, start publishing
    if (direction) {
      intervalRef.current = window.setInterval(() => {
        publishVelocityCommand();
      }, 100) as unknown as number;
    } else {
      // If no direction, send a stop command
      sendStopCommand();
    }

    // Cleanup on unmount or direction change
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [direction, connection, ros, eStopActive]);

  // Update when speeds change
  useEffect(() => {
    if (direction) {
      publishVelocityCommand();
    }
  }, [linearSpeed, angularSpeed, overallSpeed]);

  const handleKeyUp = (event: KeyboardEvent) => {
    const key = event.key;

    if (key === " " && eStopActive) {
      setEStopActive(false);
      return;
    }
    
    if (["u", "i", "o", "j", "k", "l", "m", ",", "."].includes(key)) {
      setKeyPressed((prev) => ({ ...prev, [key]: false }));
      setDirection(null); // This will trigger the effect to stop the robot

      if (cmdVelPublisher && !eStopActive) {
        sendStopCommand();
      }
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const key = event.key;

    if (key === " ") {
      setEStopActive(true);
      setDirection(null);
      sendEStopCommand();
      return;
    }

    if (eStopActive) {
      return;
    }

    // Handle direction keys
    if (["u", "i", "o", "j", "k", "l", "m", ",", "."].includes(key)) {
      setKeyPressed((prev) => ({ ...prev, [key]: true }));
      setDirection(key);
    }
    // Handle speed controls
    else if (["q", "z", "w", "x", "e", "c"].includes(key)) {
      // Overall speed
      if (key === "q") {
        setOverallSpeed((prev) => Math.min(prev + 1, maxSpeed));
      } else if (key === "z") {
        setOverallSpeed((prev) => Math.max(prev - 1, 0));
      }
      // Linear speed
      else if (key === "w") {
        setLinearSpeed((prev) => Math.min(prev + 1, maxSpeed));
      } else if (key === "x") {
        setLinearSpeed((prev) => Math.max(prev - 1, 0.1));
      }
      // Angular speed
      else if (key === "e") {
        setAngularSpeed((prev) => Math.min(prev + 1, maxSpeed));
      } else if (key === "c") {
        setAngularSpeed((prev) => Math.max(prev - 1, 0.1));
      }
    }
  };

  // Add event listeners
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);

      // Make sure to send a stop command when unmounting
      sendStopCommand();
    };
  }, [eStopActive]);

  return (
    <div className="w-full bg-gray-400">
      {/* Include the mock data component when connection is not available */}
      {/* {useMockData && <MockDefectData enabled={true} />} */}
      
      <div className="bg-gray-400 w-full">
        <div className="grid grid-cols-3 gap-5">
          {/* Column 1: Telemetry */}
          <div className="bg-gray-300 rounded-lg p-4">
            <Telemetry connection={connection} direction={direction} />
          </div>
          
          {/* Column 2: Controls */}
          <div className="bg-gray-300 rounded-lg p-4">
            <ImprovedKeypad 
              directionKeys={keyPressed}
              eStopActive={eStopActive}
              overallSpeed={overallSpeed}
              linearSpeed={linearSpeed}
              angularSpeed={angularSpeed}
              maxSpeed={maxSpeed}
              toggleEStop={toggleEStop}
            />
          </div>
          
          {/* Column 3: Defect Queue */}
          <div className="bg-gray-300 rounded-lg p-4">
            <DefectExport />
          </div>
        </div>
      </div>
      
      {/* Connection status indicator - Optional */}
      {/* {!connection && (
        <div className="mt-2 text-center text-sm text-white bg-indigo-800 rounded-lg py-1 mx-auto w-max px-3">
          Using mock defect data (No connection)
        </div>
      )} */}
    </div>
  );
}

export default Input;