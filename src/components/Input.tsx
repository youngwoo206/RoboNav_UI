/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useEffect, useRef } from "react";
import ROSLIB from "roslib";
import Key from "./Key";
import SpeedIndicator from "./SpeedIndicator";

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
  const [linearSpeed, setLinearSpeed] = useState<number>(1.0);
  const [angularSpeed, setAngularSpeed] = useState<number>(1.0);
  const [keyPressed, setKeyPressed] = useState<Record<string, boolean>>({});
  const [eStopActive, setEStopActive] = useState<boolean>(false);
  const intervalRef = useRef<number | null>(null);
  const maxSpeed: number = 4;

  // ROS Topic for Cmd Velocity
  const CMD_VEL_TOPIC = "/husky3/cmd_vel";
  const CMD_VEL_TYPE = "geometry_msgs/msg/Twist";

  // Create a ROS publisher for cmd_vel
  const cmdVelPublisher = ros ? new ROSLIB.Topic({
    ros,
    name: CMD_VEL_TOPIC,
    messageType: CMD_VEL_TYPE
  }) : null;

  // Send an emergency stop command
  const sendEStopCommand = () => {
    if (!ros || !connection || !cmdVelPublisher) {
      console.error("Cannot send E-Stop command - no ROS connection");
      return;
    }

    // Create a zero velocity twist message
    const stopMsg: TwistMessage = {
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 }
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
        publisher: !!cmdVelPublisher
      });
      return;
    }

    if (eStopActive){
      return;
    }

    // Create Twist message with explicit typing
    const twistMsg: TwistMessage = {
      linear: {
        x: 0,
        y: 0,
        z: 0
      },
      angular: {
        x: 0,
        y: 0,
        z: 0
      }
    };

    // Apply speed modifier
    const speedFactor = Math.max(1, overallSpeed);
    const currentLinearSpeed = linearSpeed * speedFactor;
    const currentAngularSpeed = angularSpeed * speedFactor;

    // Modify velocity based on direction
    if (direction) {
      switch (direction) {
        case 'u': // Forward-Left
          twistMsg.linear.x = currentLinearSpeed;
          twistMsg.angular.z = currentAngularSpeed;
          break;
        case 'i': // Forward
          twistMsg.linear.x = currentLinearSpeed;
          twistMsg.angular.z = 0;
          break;
        case 'o': // Forward-Right
          twistMsg.linear.x = currentLinearSpeed;
          twistMsg.angular.z = -currentAngularSpeed;
          break;
        case 'j': // Left
          twistMsg.linear.x = 0;
          twistMsg.angular.z = currentAngularSpeed;
          break;
        case 'k': // Stop
          twistMsg.linear.x = 0;
          twistMsg.angular.z = 0;
          break;
        case 'l': // Right
          twistMsg.linear.x = 0;
          twistMsg.angular.z = -currentAngularSpeed;
          break;
        case 'm': // Backward-Left
          twistMsg.linear.x = -currentLinearSpeed;
          twistMsg.angular.z = currentAngularSpeed;
          break;
        case ',': // Backward
          twistMsg.linear.x = -currentLinearSpeed;
          twistMsg.angular.z = 0;
          break;
        case '.': // Backward-Right
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
      angular: { x: 0, y: 0, z: 0 }
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

    if (eStopActive){
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
  }, [direction, connection, ros]);

  // Update when speeds change
  useEffect(() => {
    if (direction) {
      publishVelocityCommand();
    }
  }, [linearSpeed, angularSpeed, overallSpeed]);

  const handleKeyUp = (event: KeyboardEvent) => {
    const key = event.key;

    if (key == " " && eStopActive){
      setEStopActive(false);
      return;
    }
    if (["u", "i", "o", "j", "k", "l", "m", ",", "."].includes(key)) {
      setKeyPressed(prev => ({ ...prev, [key]: false }));
      setRemoveDirection(key);
      setDirection(null); // This will trigger the effect to stop the robot

      if (cmdVelPublisher && !eStopActive){
        const stopMsg: TwistMessage = {
          linear: {x: 0, y: 0 , z: 0 },
          angular: {x: 0, y: 0, z: 0}
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

    if (key == " "){
      setEStopActive(true);
      setDirection(null);
      sendEStopCommand();
      return;
    }

    if (eStopActive){
      return;
    }

    // Handle direction keys
    if (["u", "i", "o", "j", "k", "l", "m", ",", "."].includes(key)) {
      setKeyPressed(prev => ({ ...prev, [key]: true }));
      setDirection(key);
    }
    // Handle speed controls
    else if (["q", "z", "w", "x", "e", "c"].includes(key)) {
      const el = document.getElementById(key);
      el?.classList.add("text-red-500", "scale-96", "shadow-inner");
      
      // Overall speed
      if (key === "q") {
        setOverallSpeed(prev => Math.min(prev + 1, maxSpeed));
      } else if (key === "z") {
        setOverallSpeed(prev => Math.max(prev - 1, 0));
      }
      // Linear speed
      else if (key === "w") {
        setLinearSpeed(prev => Math.min(prev + 1, maxSpeed));
      } else if (key === "x") {
        setLinearSpeed(prev => Math.max(prev - 1, 0.1));
      }
      // Angular speed
      else if (key === "e") {
        setAngularSpeed(prev => Math.min(prev + 1, maxSpeed));
      } else if (key === "c") {
        setAngularSpeed(prev => Math.max(prev - 1, 0.1));
      }
    }
  };

  // Visual feedback for key presses
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
      setRemoveDirection(null);
    }
  }, [removeDirection]);

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
  }, []);

  //debugging
  useEffect(() => {
    console.log("ROS Connection Status:", connection)
  }, [connection]);

  useEffect(() => {
    if (ros&&connection){
      console.log("ROS is connected, publisher available", !!cmdVelPublisher);
    }
  }, [ros, connection]);



  return (
    <div className="rounded-lg bg-gray-100 w-165 h-80 justify-center p-5 relative mx-auto">
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
      <div 
        id="e-stop"
        className={`h-10 w-72 ${eStopActive ? 'bg-red-500 text-black' : 'bg-green-500 text-white'} rounded-md px-3 font-semibold mx-auto mt-3 text-center flex items-center justify-center cursor-pointer transition-colors- duration-300 ease-in-out border-2 ${eStopActive ? 'border-red-700' : 'border-green-700'}`}
        onClick={toggleEStop}
        >
          {eStopActive ? "E-STOP ACTIVE(CLICK TO RELEASE E-STOP)" : "PRESS SPACE FOR E-STOP"}
      </div>
      {/* {!connection && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg">
          <p className="text-white font-bold">ROS Not Connected</p>
        </div>
      )} */}
    </div>
  );
}

export default Input;
