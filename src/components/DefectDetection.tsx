/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unused-vars */
import ROSLIB, { Ros } from "roslib";
import { useEffect, useState, useRef } from "react";
import * as ort from "onnxruntime-web";
import {useDataContext} from "@/context/DataProvider";

interface CameraProps {
  connection: boolean;
  ros: Ros | null;
}

//Define a tracked face interface with unique ID
interface TrackedFace {
  id: number;
  box: number[]; // [x1, y1, x2, y2, confidence]
  lastSeen: number; // timestamp
}

function DefectDetection({ connection, ros }: CameraProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  // Changed to use TrackedFace interface with IDs
  const [trackedFaces, setTrackedFaces] = useState<TrackedFace[]>([]);
  const [lastDetectionTime, setLastDetectionTime] = useState<number>(0);
  const [nextId, setNextId] = useState<number>(1); // For generating unique face IDs

  const sessionRef = useRef<ort.InferenceSession | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastInferenceTimeRef = useRef<number>(0);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const CAMERA_TOPIC = "/husky3/camera_0/color/image_raw/compressed";
  const MESSAGE_TYPE = "sensor_msgs/msg/CompressedImage";
  const MODEL_PATH = "./model/faces.onnx";
  const THROTTLE_INTERVAL = 500;
  const THRESHOLD = 0.7; // 70% confidence
  const FACE_PERSISTENCE_TIMEOUT = 2000; // Time in ms to keep faces displayed after detection
  const IOU_THRESHOLD = 0.1; // Minimum IoU to consider the same face
  const { addDefect, setCurrentCameraImage, setCurrentOverlayCanvas } = useDataContext();

  useEffect(() => {
    if (imageSrc){
      setCurrentCameraImage(imageSrc);
    }
  }, [imageSrc, setCurrentCameraImage]);

  useEffect(() => {
    if (overlayCanvasRef.current){
      setCurrentOverlayCanvas(overlayCanvasRef.current);
    }
  }, [trackedFaces, setCurrentOverlayCanvas]);
  useEffect(() => {
    console.log(trackedFaces)
  }, [trackedFaces])

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

  // Calculate IoU between two boxes
  function calculateIoU(boxA: number[], boxB: number[]): number {
    // Get coordinates (first 4 values are x1,y1,x2,y2)
    const [x1A, y1A, x2A, y2A] = boxA;
    const [x1B, y1B, x2B, y2B] = boxB;

    // Calculate intersection area
    const xLeft = Math.max(x1A, x1B);
    const yTop = Math.max(y1A, y1B);
    const xRight = Math.min(x2A, x2B);
    const yBottom = Math.min(y2A, y2B);

    if (xRight < xLeft || yBottom < yTop) {
      return 0; // No intersection
    }

    const intersectionArea = (xRight - xLeft) * (yBottom - yTop);

    // Calculate areas of both boxes
    const boxAArea = (x2A - x1A) * (y2A - y1A);
    const boxBArea = (x2B - x1B) * (y2B - y1B);

    // Calculate IoU
    const unionArea = boxAArea + boxBArea - intersectionArea;

    return intersectionArea / unionArea;
  }

  // Preprocess image and run inference
  async function runInference(imageUrl: string) {
    if (!sessionRef.current || !canvasRef.current) {
      return;
    }

    const now = Date.now();

    // throttling
    if (now - lastInferenceTimeRef.current < THROTTLE_INTERVAL) {
      // Check if we need to clear faces due to timeout
      checkFaceTimeout();
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

      // Preprocess image data
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pixelOffset = (y * width + x) * 4; // RGBA

          const b = (data[pixelOffset] - 127) / 128;
          const g = (data[pixelOffset + 1] - 127) / 128;
          const r = (data[pixelOffset + 2] - 127) / 128;

          // Map to CHW format
          tensor[0 * height * width + y * width + x] = r;
          tensor[height * width + y * width + x] = g;
          tensor[2 * height * width + y * width + x] = b;
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

      // Process boxes
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

      // Process scores
      const scoresData = new Float32Array(results.scores.data);
      const confidenceBoxes: number[] = [];
      for (let i = 0; i < scoresData.length / 2; i++) {
        if (scoresData[i * 2 + 1] > THRESHOLD) {
          confidenceBoxes.push(i);
        }
      }

      // Match and update faces based on IoU
      if (confidenceBoxes.length > 0) {
        // Extract the actual face boxes with confidence scores
        const newDetections = confidenceBoxes.map((idx) => {
          const box = boxesReshaped[idx];
          const confidence = scoresData[idx * 2 + 1];
          return [...box, confidence]; // [x1, y1, x2, y2, confidence]
        });

        // Update tracked faces using IoU
        updateTrackedFaces(newDetections);
      } else {
        // Check if we should clear faces due to timeout
        checkFaceTimeout();
      }

      // Always draw tracked faces
      drawTrackedFaces();
    } catch (error) {
      console.error("Inference error:", error);
    }
  }

  // Update tracked faces using IoU matching
  function updateTrackedFaces(newDetections: number[][]) {
    const currentTime = Date.now();
    let updatedFaces = [...trackedFaces];
    const matchedNewDetections = new Set<number>();
    const matchedExistingDetections = new Set<number>();
    let idCounter = nextId;

    for(let newIdx=0; newIdx < newDetections.length; newIdx++){
      if (matchedNewDetections.has(newIdx)) continue;

      const newBox = newDetections[newIdx]
      let bestMatchIndex = -1
      let bestIoU = 0.1

      for(let i=0; i<updatedFaces.length; i++){
        if(matchedExistingDetections.has(i)) continue

        const iou = calculateIoU(newBox, updatedFaces[i].box)

        if(iou > bestIoU) {
          bestIoU = iou
          bestMatchIndex = i
        }
      }

      if(bestMatchIndex !== -1) {
        updatedFaces[bestMatchIndex].box = newBox
        updatedFaces[bestMatchIndex].lastSeen = currentTime
        matchedExistingDetections.add(bestMatchIndex)
        matchedNewDetections.add(newIdx)
      }
    }

    for(let newIdx=0; newIdx<newDetections.length; newIdx++){
      if(matchedNewDetections.has(newIdx)) continue

      let tooClose = false
      
      for(let i=0; i<updatedFaces.length; i++){
        const iou = calculateIoU(newDetections[newIdx], updatedFaces[i].box)
        if(iou > 0.05){
          tooClose = true
          break
        }
      }

      if (!tooClose) {
        const newFace = {
          id: idCounter++,
          box: newDetections[newIdx],
          lastSeen: currentTime
        };
        updatedFaces.push(newFace);

        // Notify context about the new defect
        addDefect(newFace);
      }
    }

    setNextId(idCounter);
    // Update the face state
    setTrackedFaces(updatedFaces);
    setLastDetectionTime(currentTime);
  }

  // Check if we should clear faces due to timeout
  function checkFaceTimeout() {
    const now = Date.now();
    if (trackedFaces.length > 0) {
      // Remove faces that haven't been seen recently
      const updatedFaces = trackedFaces.filter(
        (face) => now - face.lastSeen <= FACE_PERSISTENCE_TIMEOUT
      );

      // Only update state if faces were actually removed
      if (updatedFaces.length < trackedFaces.length) {
        setTrackedFaces(updatedFaces);
      }
    }
  }

  // Set up timer to regularly check for face timeout
  useEffect(() => {
    const timer = setInterval(() => {
      checkFaceTimeout();
    }, 500); // Check every 500ms

    return () => clearInterval(timer);
  }, [trackedFaces]);

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

      // Redraw faces if there are any
      if (trackedFaces.length > 0) {
        drawTrackedFaces();
      }
    }
  };

  // Draw tracked faces
  function drawTrackedFaces() {
    if (!overlayCanvasRef.current || !imageRef.current) return;

    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (trackedFaces.length === 0) return;

    // Original image dimensions from preprocessing
    const origWidth = 320;
    const origHeight = 240;

    // Display dimensions
    const displayWidth = canvas.width;
    const displayHeight = canvas.height;

    // Scale factors
    const scaleX = displayWidth / origWidth;
    const scaleY = displayHeight / origHeight;

    // Setup drawing style - RED border with TRANSPARENT fill
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255, 0, 0, 0.9)"; // Red border

    // Draw each tracked face
    for (const face of trackedFaces) {
      const [x1, y1, x2, y2, confidence] = face.box;

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

      // Draw bounding box with transparent fill
      ctx.beginPath();
      ctx.rect(displayX1, displayY1, displayWidth, displayHeight);
      ctx.stroke(); // Only stroke, no fill

      // Add label with ID and confidence score
      ctx.fillStyle = "rgba(255, 0, 0, 0.9)"; // Red text
      ctx.font = "bold 16px Arial";
      ctx.fillText(
        `Face #${face.id}: ${(confidence * 100).toFixed(1)}%`,
        displayX1 + 5,
        displayY1 + 20
      );
    }

    // Add count of faces
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(10, 10, 240, 30);
    ctx.fillStyle = "white";
    ctx.font = "bold 16px Arial";
    ctx.fillText(`Faces tracked: ${trackedFaces.length}`, 20, 30);
  }

  // Effect to ensure boxes are redrawn when state changes
  useEffect(() => {
    if (trackedFaces.length > 0) {
      drawTrackedFaces();
    }
  }, [trackedFaces]);

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
