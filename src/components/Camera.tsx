import ROSLIB, { Ros } from "roslib";
import { useEffect, useState, useRef } from "react";
import * as ort from "onnxruntime-web";

interface CameraProps {
  connection: boolean;
  ros: Ros | null;
}

interface Detection {
  bbox: [number, number, number, number];
  class: number;
  confidence: number;
}

//@ts-expect-error
ort.env.wasm.wasmPaths = {
  "ort-wasm.wasm": "/wasm/ort-wasm.wasm",
  "ort-wasm-threaded.wasm": "/wasm/ort-wasm-threaded.wasm",
};

function Camera({ connection, ros }: CameraProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  const [session, setSession] = useState<ort.InferenceSession | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [frameCount, setFrameCount] = useState(0);

  const FRAME_SKIP = 2; // Process every 3rd frame

  const CAMERA_TOPIC = "/husky3/camera_0/color/image_raw/compressed";
  const MESSAGE_TYPE = "sensor_msgs/msg/CompressedImage";

  const CLASSES = ["brick obstruction"];
  const CONFIDENCE_THRESHOLD = 0.5;

  // Initialize ONNX Runtime and load model
  useEffect(() => {
    async function loadModel() {
      try {
        // Set up ONNX Runtime options
        const options = {
          executionProviders: ["wasm"],
          graphOptimizationLevel: "all",
        };

        // Load your trained model (you'll need to host this file)
        const modelUrl = "/model/best.onnx";
        const inferenceSession = await ort.InferenceSession.create(
          modelUrl,
          options
        );
        setSession(inferenceSession);
        setModelLoaded(true);
        console.log("YOLOv10 model loaded successfully");
      } catch (error) {
        console.error("Failed to load the model:", error);
      }
    }

    loadModel();
  }, []);

  // Subscribe to ROS camera topic
  useEffect(() => {
    if (ros && connection) {
      const listener = new ROSLIB.Topic({
        ros,
        name: CAMERA_TOPIC,
        messageType: MESSAGE_TYPE,
      });

      listener.subscribe((message) => {
        // Type assertion to make sure the message has the correct structure
        const compressedImage = message as { format: string; data: Uint8Array };
        const base64 = btoa(
          Array.from(compressedImage.data)
            .map((byte) => String.fromCharCode(byte))
            .join("")
        );

        const imageData = `data:image/${compressedImage.format};base64,${base64}`;
        setImageSrc(imageData);
      });

      return () => {
        listener.unsubscribe();
      };
    }
  }, [ros, connection]);

  // Process each frame for object detection
  useEffect(() => {
    if (!imageSrc || !modelLoaded || !session || isProcessing) return;

    const processImage = async () => {
      try {
        setIsProcessing(true);

        // Create an image element to get dimensions and pixel data
        const img = new Image();
        img.onload = async () => {
          // Process through the model
          const detections = await runDetection(img, session);
          setDetections(detections);
          setIsProcessing(false);
        };
        img.src = imageSrc;
      } catch (error) {
        console.error("Error processing image:", error);
        setIsProcessing(false);
      }
    };

    setFrameCount((prev) => {
      const newCount = prev + 1;
      if (newCount % FRAME_SKIP !== 0) return newCount;

      processImage();
      return newCount;
    });
  }, [imageSrc, modelLoaded, session, isProcessing]);

  // Helper function to run detection
  const runDetection = async (
    image: HTMLImageElement,
    model: ort.InferenceSession
  ): Promise<Detection[]> => {
    // Create a canvas to draw the image and get pixel data
    const canvas = document.createElement("canvas");
    canvas.width = 640; // YOLOv10 typically uses 640x640
    canvas.height = 640;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not get canvas context");
    }

    // Draw and resize the image to model input size
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Preprocess the image
    const tensor = preprocessImage(imageData);

    // Run inference
    const results = await model.run({ images: tensor });

    // Parse results to get detections
    return processResults(results, image.width, image.height);
  };

  // Preprocess image for YOLOv10
  const preprocessImage = (imageData: ImageData): ort.Tensor => {
    const { data, width, height } = imageData;
    const inputTensor = new Float32Array(1 * 3 * width * height);

    // Normalize pixel values and rearrange to NCHW format
    // YOLOv10 typically expects RGB input normalized to 0-1
    let inputIndex = 0;
    for (let c = 0; c < 3; c++) {
      for (let h = 0; h < height; h++) {
        for (let w = 0; w < width; w++) {
          const pixelIndex = (h * width + w) * 4 + c;
          inputTensor[inputIndex++] = data[pixelIndex] / 255.0;
        }
      }
    }

    return new ort.Tensor("float32", inputTensor, [1, 3, height, width]);
  };

  // Process YOLOv10 output
  const processResults = (
    results: Record<string, ort.Tensor>,
    imageWidth: number,
    imageHeight: number
  ): Detection[] => {
    // This function needs to be adapted to your specific YOLO model output format
    // Example with common YOLO output structure
    const output = results.output; // Adjust based on your model's output name
    const data = output.data as Float32Array;

    // YOLOv10 typically outputs [batch, num_detections, classes+5] tensor
    // where the last dimension consists of [x, y, width, height, confidence, class_scores...]
    const detections: Detection[] = [];
    const numDetections = data.length / (CLASSES.length + 5);

    for (let i = 0; i < numDetections; i++) {
      const base = i * (CLASSES.length + 5);

      // Extract confidence score
      const confidence = data[base + 4];
      if (confidence < CONFIDENCE_THRESHOLD) continue;

      // Find class with highest score
      let maxClassScore = 0;
      let classIndex = 0;
      for (let c = 0; c < CLASSES.length; c++) {
        const classScore = data[base + 5 + c];
        if (classScore > maxClassScore) {
          maxClassScore = classScore;
          classIndex = c;
        }
      }

      // Calculate final confidence
      const finalConfidence = confidence * maxClassScore;
      if (finalConfidence < CONFIDENCE_THRESHOLD) continue;

      // Extract bounding box coordinates (YOLO outputs normalized coordinates)
      const x = data[base] * imageWidth;
      const y = data[base + 1] * imageHeight;
      const width = data[base + 2] * imageWidth;
      const height = data[base + 3] * imageHeight;

      detections.push({
        bbox: [x - width / 2, y - height / 2, width, height], // Convert from center format to [x, y, width, height]
        class: classIndex,
        confidence: finalConfidence,
      });
    }

    return detections;
  };

  // Draw detected objects on canvas
  useEffect(() => {
    if (!imageSrc || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Set canvas dimensions to match image
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw the camera feed
      ctx.drawImage(img, 0, 0);

      // Draw detections
      detections.forEach((detection) => {
        const [x, y, width, height] = detection.bbox;
        const label = CLASSES[detection.class];

        // Draw bounding box
        ctx.strokeStyle = "#FF0000";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);

        // Draw label background
        ctx.fillStyle = "rgba(255, 0, 0, 0.7)";
        const textWidth = ctx.measureText(
          `${label}: ${detection.confidence.toFixed(2)}`
        ).width;
        ctx.fillRect(x, y - 20, textWidth + 10, 20);

        // Draw text
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "14px Arial";
        ctx.fillText(
          `${label}: ${detection.confidence.toFixed(2)}`,
          x + 5,
          y - 5
        );
      });
    };
    img.src = imageSrc;
  }, [imageSrc, detections]);

  return (
    <div className="bg-gray-300 w-[100%]">
      {imageSrc ? (
        <div style={{ position: "relative" }}>
          <canvas ref={canvasRef} className="shadow-md w-[100%]" />
          {!modelLoaded && (
            <div className="absolute top-0 left-0 bg-black bg-opacity-50 text-white p-2">
              Loading YOLOv10 model...
            </div>
          )}
        </div>
      ) : (
        <p className="text-gray-500">Waiting for camera feed...</p>
      )}
    </div>
  );
}

export default Camera;
