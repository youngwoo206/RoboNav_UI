import ROSLIB, { Ros } from "roslib";
import { useEffect, useState } from "react";

interface CameraProps {
  connection: boolean;
  ros: Ros | null;
}

function Camera({ connection, ros }: CameraProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  const CAMERA_TOPIC = "/husky3/camera_0/image_raw/compressed"; // Ensure this topic exists
  const MESSAGE_TYPE = "sensor_msgs/CompressedImage";

  useEffect(() => {
    if (ros) {
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
    }
  }, [ros]);

  return (
    <div className="rounded-lg bg-gray-100 w-165 h-80">
      {imageSrc ? (
        <img
          src={imageSrc}
          alt="Robot Camera Feed"
          className="rounded-lg shadow-md w-full"
        />
      ) : (
        <p className="text-gray-500">Waiting for camera feed...</p>
      )}
    </div>
  );
}

export default Camera;
