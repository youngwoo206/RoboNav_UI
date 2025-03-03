import React from "react";

import { useEffect, useState } from "react";
import ROSLIB from "roslib";

const ROSBRIDGE_URL = "ws://localhost:9090"; // Change this acoording to ROS YAML
const CAMERA_TOPIC = "/camera/image_raw/compressed"; // Ensure this topic exists
const MESSAGE_TYPE = "sensor_msgs/CompressedImage";

const CameraFeed: React.FC = () => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  useEffect(() => {
    // Connect to ROS Bridge WebSocket
    const ros = new ROSLIB.Ros({ url: ROSBRIDGE_URL });

    ros.on("connection", () => console.log("Connected to ROSBridge"));
    ros.on("error", (error) => console.error("ROSBridge error:", error));
    ros.on("close", () => console.warn("Disconnected from ROSBridge"));

    // Subscribe to the camera topic
    const listener = new ROSLIB.Topic({
      ros,
      name: CAMERA_TOPIC,
      messageType: MESSAGE_TYPE,
    });

    listener.subscribe((message) => {
      // Type assertion to make sure the message has the correct structure
      const imageMessage = message as { data: string };
      const imageData = `data:image/jpeg;base64,${imageMessage.data}`;
      setImageSrc(imageData);
    });

    // Cleanup on unmount
    return () => {
      listener.unsubscribe();
      ros.close();
    };
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold">Camera Feed</h2>
      {imageSrc ? (
        <img src={imageSrc} alt="Robot Camera Feed" className="rounded-lg shadow-md w-full" />
      ) : (
        <p className="text-gray-500">Waiting for camera feed...</p>
      )}
    </div>
  );
};

export default CameraFeed;