import ROSLIB, { Ros } from "roslib";
import { useEffect, useState, useRef } from "react";
import * as ort from "onnxruntime-web";

interface CameraProps {
  connection: boolean;
  ros: Ros | null;
}

function DefectDetection({ connection, ros }: CameraProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  const sessionRef = useRef<ort.InferenceSession | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastInferenceTimeRef = useRef<number>(0); //for throttling
  const imageRef = useRef<HTMLImageElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const CAMERA_TOPIC = "/husky3/camera_0/color/image_raw/compressed";
  const MESSAGE_TYPE = "sensor_msgs/msg/CompressedImage";
  const MODEL_PATH = "./model/faces.onnx";
  const THROTTLE_INTERVAL = 5000;
  const THRESHOLD = 0.7; //70% confidence

  // Load the ONNX model
  useEffect(() => {
    async function loadModel() {
      try {
        // Create inference session
        console.log("LOADING ONNX");
        const session = await ort.InferenceSession.create(MODEL_PATH, {
          executionProviders: ["webgl", "wasm"],
          graphOptimizationLevel: "all",
        });

        sessionRef.current = session;
        console.log("ONNX model loaded successfully");
        console.log("Model input names:", session.inputNames);
        console.log("Model output names:", session.outputNames);
        setModelLoaded(true);
      } catch (err) {
        console.error("Failed to load ONNX model:", err);
      }
    }

    loadModel();
  }, []);

  // Preprocess image and run inference
  async function runInference(imageUrl: string) {
    if (!sessionRef.current || !canvasRef.current) {
      return;
    }

    const now = Date.now();

    //throttling
    if (now - lastInferenceTimeRef.current < THROTTLE_INTERVAL) {
      return;
    }

    lastInferenceTimeRef.current = now;

    try {
      // Get input name from session
      const inputName = sessionRef.current.inputNames[0];

      // Load the image
      const img = new Image();
      img.src = imageUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
      });

      // Draw image to canvas for processing
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Set canvas dimensions to 320x240 as specified in preprocessing
      canvas.width = 320;
      canvas.height = 240;
      ctx.drawImage(img, 0, 0, 320, 240);

      // Get image data
      const imageData = ctx.getImageData(0, 0, 320, 240);
      const { data, width, height } = imageData;

      // Create a Float32Array for the tensor
      const tensor = new Float32Array(1 * 3 * height * width);

      // Preprocess:
      // 1. BGR to RGB conversion (since original is BGR8)
      // 2. Normalize with mean [127,127,127] and scale by 1/128
      // 3. Transpose from HWC to CHW format with batch dimension
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pixelOffset = (y * width + x) * 4; // RGBA

          // Canvas gives us RGB, but we need to treat it as BGR because
          // the original format is BGR8, matching the Python cv2.COLOR_BGR2RGB conversion
          const b = (data[pixelOffset] - 127) / 128; // R channel in canvas is B in original
          const g = (data[pixelOffset + 1] - 127) / 128; // G remains G
          const r = (data[pixelOffset + 2] - 127) / 128; // B channel in canvas is R in original

          // Map to CHW format (matching the Python np.transpose([2, 0, 1]))
          tensor[0 * height * width + y * width + x] = r; // R channel first
          tensor[height * width + y * width + x] = g; // G channel second
          tensor[2 * height * width + y * width + x] = b; // B channel third
        }
      }

      // Create tensor and run inference
      const inputTensor = new ort.Tensor("float32", tensor, [
        1,
        3,
        height,
        width,
      ]);
      const feeds = { [inputName]: inputTensor };
      const results = await sessionRef.current.run(feeds);

      //boxes
      const boxesData = new Float32Array(results.boxes.data);
      const boxesReshaped: number[][] = [];
      for (let i = 0; i < boxesData.length; i += 4) {
        boxesReshaped.push([
          boxesData[i],
          boxesData[i + 1],
          boxesData[i + 2],
          boxesData[i + 3],
        ]);
      }

      //scores
      const scoresData = new Float32Array(results.scores.data);
      const confidenceBoxes: number[] = [];
      for (let i = 0; i < scoresData.length / 2; i++) {
        // Each box has a corresponding score at index i*2+1 (assuming class 1 is face)
        if (scoresData[i * 2 + 1] > THRESHOLD) {
          confidenceBoxes.push(i);
        }
      }

      //draw boxes
      drawFaces(scoresData, boxesReshaped, confidenceBoxes);
    } catch (error) {
      console.error("Inference error:", error);
    }
  }

  useEffect(() => {
    if (ros && connection) {
      const listener = new ROSLIB.Topic({
        ros,
        name: CAMERA_TOPIC,
        messageType: MESSAGE_TYPE,
      });

      listener.subscribe((message) => {
        try {
          // Process compressed image from ROS
          const compressedImage = message as {
            format: string;
            data: Uint8Array;
          };
          const base64 = btoa(
            Array.from(compressedImage.data)
              .map((byte) => String.fromCharCode(byte))
              .join("")
          );

          // Handle the ROS-specific format string with metadata
          // The format is typically "jpeg compressed bgr8" or similar
          let format = compressedImage.format;

          // Default to jpeg if format is unclear
          if (!format || format.includes("bgr8") || format.includes("rgb8")) {
            format = "jpeg";
          }

          const imageUrl = `data:image/${format};base64,${base64}`;
          setImageSrc(imageUrl);

          // Run inference if model is loaded
          if (modelLoaded) {
            runInference(imageUrl);
          }
        } catch (error) {
          console.error("Error processing image message:", error);
        }
      });

      return () => {
        listener.unsubscribe();
      };
    }
  }, [ros, connection, modelLoaded]);

  const handleImageLoad = () => {
    if (imageRef.current && overlayCanvasRef.current) {
      // Make the overlay canvas match the displayed image dimensions
      overlayCanvasRef.current.width = imageRef.current.clientWidth;
      overlayCanvasRef.current.height = imageRef.current.clientHeight;
    }
  };

  function drawFaces(
    scoresData,
    boxesReshaped: number[][],
    confidenceBoxes: number[]
  ) {
    if (!overlayCanvasRef.current || !imageRef.current) return;

    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // If no faces detected, just return
    if (confidenceBoxes.length === 0) return;

    // Original image dimensions from preprocessing
    const origWidth = 320;
    const origHeight = 240;

    // Display dimensions
    const displayWidth = canvas.width;
    const displayHeight = canvas.height;

    // Scale factors
    const scaleX = displayWidth / origWidth;
    const scaleY = displayHeight / origHeight;

    // Setup drawing style
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255, 100, 0, 0.8)";
    ctx.fillStyle = "rgba(255, 100, 0, 0.3)";

    // Draw each detected face
    for (const boxIdx of confidenceBoxes) {
      // Get the box coordinates - these are likely normalized [0-1]
      const box = boxesReshaped[boxIdx];
      const [x1, y1, x2, y2] = box;

      // Convert normalized coordinates to pixel coordinates
      const imgX1 = x1 * origWidth;
      const imgY1 = y1 * origHeight;
      const imgX2 = x2 * origWidth;
      const imgY2 = y2 * origHeight;

      // Make the box square (similar to scale() in Python)
      const width = imgX2 - imgX1;
      const height = imgY2 - imgY1;
      const maximum = Math.max(width, height);
      const dx = (maximum - width) / 2;
      const dy = (maximum - height) / 2;

      const squareBox = [imgX1 - dx, imgY1 - dy, imgX2 + dx, imgY2 + dy];

      // Scale to display dimensions
      const displayX1 = squareBox[0] * scaleX;
      const displayY1 = squareBox[1] * scaleY;
      const displayWidth = (squareBox[2] - squareBox[0]) * scaleX;
      const displayHeight = (squareBox[3] - squareBox[1]) * scaleY;

      // Draw bounding box
      ctx.beginPath();
      ctx.rect(displayX1, displayY1, displayWidth, displayHeight);
      ctx.fill();
      ctx.stroke();

      // Add confidence score text if available
      if (boxIdx * 2 + 1 < scoresData.length) {
        const confidence = scoresData[boxIdx * 2 + 1];
        ctx.fillStyle = "white";
        ctx.font = "16px Arial";
        ctx.fillText(
          `${(confidence * 100).toFixed(1)}%`,
          displayX1 + 5,
          displayY1 + 20
        );
        ctx.fillStyle = "rgba(255, 100, 0, 0.3)";
      }
    }

    // Add count of faces
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(10, 10, 200, 30);
    ctx.fillStyle = "white";
    ctx.font = "bold 16px Arial";
    ctx.fillText(`Faces detected: ${confidenceBoxes.length}`, 20, 30);
  }

  return (
    <div className="bg-gray-300 w-[100%] relative">
      {imageSrc ? (
        <>
          <img
            ref={imageRef}
            src={imageSrc}
            alt="Robot Camera Feed"
            className="shadow-md w-[100%]"
            onLoad={handleImageLoad}
          />
          {/* Overlay canvas for drawing bounding boxes */}
          <canvas
            ref={overlayCanvasRef}
            className="absolute top-0 left-0 w-[100%] h-[100%]"
            style={{ pointerEvents: "none" }}
          />
          {/* Hidden canvas for image processing */}
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </>
      ) : (
        <p className="text-gray-500">Waiting for camera feed...</p>
      )}
      {!modelLoaded && (
        <p className="text-yellow-600">Loading face detection model...</p>
      )}
    </div>
  );
}

export default DefectDetection;
