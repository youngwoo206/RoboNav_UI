import ROSLIB, { Ros } from "roslib";
import { useEffect, useRef, useState } from "react";

interface CameraProps {
  connection: boolean;
  ros: Ros | null;
}

function FastCamera({ connection, ros }: CameraProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const frameProcessorRef = useRef<{
    lastTimestamp: number;
    fps: number;
    frameCount: number;
  }>({
    lastTimestamp: 0,
    fps: 0,
    frameCount: 0,
  });

  const CAMERA_TOPIC = "/husky3/camera_0/color/image_raw/compressed"; // Ensure this topic exists
  const MESSAGE_TYPE = "sensor_msgs/msg/CompressedImage";

  useEffect(() => {
    if (!ros || !connection) {
      setIsConnected(false);
      return;
    }

    // Set up canvas
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) return;

    // Track connection state
    setIsConnected(true);

    // Set up message processing
    const processFrame = async (imageData: Uint8Array, format: string) => {
      try {
        // Track FPS
        const now = performance.now();
        const processor = frameProcessorRef.current;
        processor.frameCount++;

        if (now - processor.lastTimestamp > 1000) {
          processor.fps = processor.frameCount;
          processor.frameCount = 0;
          processor.lastTimestamp = now;
        }

        // Create blob directly from Uint8Array
        const blob = new Blob([imageData], { type: `image/${format}` });

        // Use createImageBitmap for faster decoding (hardware accelerated when available)
        const bitmap = await createImageBitmap(blob);

        // Ensure canvas is sized correctly, but only update dimensions when needed
        if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
        }

        // Clear and draw new frame
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0);

        // Display FPS in corner
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(5, 5, 60, 20);
        ctx.fillStyle = "#ffffff";
        ctx.font = "12px Arial";
        ctx.fillText(`FPS: ${processor.fps}`, 10, 20);

        // Release bitmap to free memory
        bitmap.close();
      } catch (error) {
        console.error("Error processing video frame:", error);
      }
    };

    // Set up ROS subscriber
    const listener = new ROSLIB.Topic({
      ros,
      name: CAMERA_TOPIC,
      messageType: MESSAGE_TYPE,
    });

    listener.subscribe((message) => {
      // Use requestAnimationFrame to sync with browser refresh rate
      requestAnimationFrame(() => {
        const compressedImage = message as { format: string; data: Uint8Array };
        // Process the frame directly without React state updates
        processFrame(compressedImage.data, compressedImage.format || "jpeg");
      });
    });

    // Cleanup on unmount
    return () => {
      listener.unsubscribe();
      setIsConnected(false);
    };
  }, [ros, connection]);

  return (
    <div className="bg-gray-300 w-[100%]">
      <canvas
        ref={canvasRef}
        className="shadow-md w-[100%]"
        style={{ display: isConnected ? "block" : "none" }}
      />
      {!isConnected && (
        <p className="text-gray-500">Waiting for camera feed...</p>
      )}
    </div>
  );
}

export default FastCamera;
