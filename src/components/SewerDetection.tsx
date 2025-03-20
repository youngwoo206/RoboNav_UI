import ROSLIB, { Ros } from "roslib";
import { useEffect, useState, useRef } from "react";
import * as ort from "onnxruntime-web";
import { useDataContext } from "@/context/DataProvider"; // Import the data context

interface CameraProps {
  connection: boolean;
  ros: Ros | null;
}

interface TrackedDefect {
  id: number;
  box: number[]; // [x1, y1, x2, y2, confidence]
  lastSeen: number;
}

function SewerDetection({ connection, ros }: CameraProps) {
  // Get functions from the data context
  const { addDefect, setCurrentCameraImage, setCurrentOverlayCanvas } = useDataContext();

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  const [trackedDefects, setTrackedDefects] = useState<TrackedDefect[]>([]);
  const [lastDetectionTime, setLastDetectionTime] = useState<number>(0);
  const [nextId, setNextId] = useState<number>(1);
  const [modelError, setModelError] = useState<string | null>(null);

  const sessionRef = useRef<ort.InferenceSession | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastInferenceTimeRef = useRef<number>(0);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const CAMERA_TOPIC = "/husky3/camera_0/color/image_raw/compressed";
  const MESSAGE_TYPE = "sensor_msgs/msg/CompressedImage";
  const MODEL_PATH = "./model/sewer_light.onnx";
  const THROTTLE_INTERVAL = 1000;
  const THRESHOLD = 0.1; // 70% confidence
  const DEFECT_PERSISTENCE_TIMEOUT = 2000;
  const IOU_THRESHOLD = 0.1;

  // Load the ONNX model
  useEffect(() => {
    async function loadModel() {
      try {
        console.log("Loading sewer detection model");
        const session = await ort.InferenceSession.create(MODEL_PATH, {
          executionProviders: ["webgl", "wasm"],
          graphOptimizationLevel: "all",
        });

        sessionRef.current = session;
        console.log("ONNX model loaded successfully");
        console.log("Model input names:", session.inputNames);
        console.log("Model output names:", session.outputNames);
        setModelLoaded(true);
        setModelError(null);
      } catch (err) {
        console.error("Failed to load ONNX model:", err);
        setModelError("Failed to load model");
      }
    }

    loadModel();
  }, []);

  // Calculate IoU between two boxes
  function calculateIoU(boxA: number[], boxB: number[]): number {
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
    const boxAArea = (x2A - x1A) * (y2A - y1A);
    const boxBArea = (x2B - x1B) * (y2B - y1B);
    const unionArea = boxAArea + boxBArea - intersectionArea;

    return intersectionArea / unionArea;
  }

  // Process YOLO output and extract bounding boxes
  function processYoloOutput(outputData: Float32Array, outputShape: number[]) {
    // YOLOv8 output format is [batch, values_per_point, num_points]
    if (outputShape.length === 3) {
      const [batch, values_per_point, num_points] = outputShape;
      console.log(
        `YOLOv8 output shape: [${batch}, ${values_per_point}, ${num_points}]`
      );

      const detections: number[][] = [];

      // Process each potential detection point
      for (let point = 0; point < num_points; point++) {
        // Get objectness score to filter low-confidence detections early
        const confidence = outputData[4 * num_points + point];

        // Only process high confidence detections
        if (confidence > THRESHOLD) {
          // Get coordinates (x, y, width, height)
          const x = outputData[0 * num_points + point];
          const y = outputData[1 * num_points + point];
          const w = outputData[2 * num_points + point];
          const h = outputData[3 * num_points + point];

          // Find highest scoring class
          let maxClassScore = 0;
          let maxClassIdx = 0;

          const numClasses = values_per_point - 5;
          for (let cls = 0; cls < numClasses; cls++) {
            const classScore = outputData[(5 + cls) * num_points + point];
            if (classScore > maxClassScore) {
              maxClassScore = classScore;
              maxClassIdx = cls;
            }
          }

          // Calculate final score
          const score = confidence * maxClassScore;

          // Convert from center coordinates to corner coordinates
          const x1 = Math.max(0, x - w / 2);
          const y1 = Math.max(0, y - h / 2);
          const x2 = Math.min(640, x + w / 2);
          const y2 = Math.min(640, y + h / 2);

          console.log(
            `Detection at point ${point}: [${x1.toFixed(1)},${y1.toFixed(
              1
            )},${x2.toFixed(1)},${y2.toFixed(1)}], ` +
              `Confidence: ${confidence.toFixed(
                4
              )}, Class: ${maxClassIdx}, Final score: ${score.toFixed(4)}`
          );

          // Add detection if it passes our threshold
          detections.push([x1, y1, x2, y2, confidence]);
        }
      }

      console.log(
        `Found ${detections.length} detections above threshold ${THRESHOLD}`
      );

      // Update tracked defects if any were found
      if (detections.length > 0) {
        updateTrackedDefects(detections);
      } else {
        checkDefectTimeout();
      }
    }
  }
  // Run inference with the YOLO model
  async function runInference(imageUrl: string) {
    if (!sessionRef.current || !canvasRef.current) {
      return;
    }

    const now = Date.now();
    if (now - lastInferenceTimeRef.current < THROTTLE_INTERVAL) {
      checkDefectTimeout();
      return;
    }

    lastInferenceTimeRef.current = now;

    try {
      // Use "images" as the input name for YOLO model
      const inputName = "images";

      // Load the image
      const img = new Image();
      img.src = imageUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
      });

      // Draw to canvas at correct input size (640x640)
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Set canvas dimensions to 640x640 for YOLO model
      canvas.width = 640;
      canvas.height = 640;
      ctx.drawImage(img, 0, 0, 640, 640);

      // Get image data
      const imageData = ctx.getImageData(0, 0, 640, 640);
      const { data, width, height } = imageData;

      // Create tensor for YOLO model (normalized to 0-1)
      const tensor = new Float32Array(1 * 3 * height * width);

      // Normalize to 0-1 range for YOLO
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pixelOffset = (y * width + x) * 4; // RGBA

          // Map to CHW format with 0-1 normalization
          tensor[0 * height * width + y * width + x] =
            data[pixelOffset] / 255.0; // R
          tensor[height * width + y * width + x] =
            data[pixelOffset + 1] / 255.0; // G
          tensor[2 * height * width + y * width + x] =
            data[pixelOffset + 2] / 255.0; // B
        }
      }

      // Run inference with YOLO model
      const inputTensor = new ort.Tensor("float32", tensor, [
        1,
        3,
        height,
        width,
      ]);
      const feeds = {};
      feeds[inputName] = inputTensor;

      console.log("Running inference...");
      const results = await sessionRef.current.run(feeds);

      // Process YOLO output
      if (results.output0) {
        const outputTensor = results.output0;
        const outputData = outputTensor.data as Float32Array;
        const outputShape = outputTensor.dims;

        // Process the output to get bounding boxes
        processYoloOutput(outputData, outputShape);
      }

      // Always redraw tracked defects
      drawTrackedDefects();
    } catch (error) {
      console.error("Inference error:", error);
    }
  }

  // Update tracked defects using IoU matching
  function updateTrackedDefects(newDetections: number[][]) {
    const currentTime = Date.now();
    let updatedDefs = [...trackedDefects];
    const matchedNewDetections = new Set<number>();
    const matchedExistingDetections = new Set<number>();
    let idCounter = nextId;

    // First pass: match new detections with existing ones
    for (let newIdx = 0; newIdx < newDetections.length; newIdx++) {
      if (matchedNewDetections.has(newIdx)) continue;

      const newBox = newDetections[newIdx];
      let bestMatchIndex = -1;
      let bestIoU = IOU_THRESHOLD;

      for (let i = 0; i < updatedDefs.length; i++) {
        if (matchedExistingDetections.has(i)) continue;

        const iou = calculateIoU(newBox, updatedDefs[i].box);

        if (iou > bestIoU) {
          bestIoU = iou;
          bestMatchIndex = i;
        }
      }

      if (bestMatchIndex !== -1) {
        updatedDefs[bestMatchIndex].box = newBox;
        updatedDefs[bestMatchIndex].lastSeen = currentTime;
        matchedExistingDetections.add(bestMatchIndex);
        matchedNewDetections.add(newIdx);
      }
    }

    // Second pass: add new defects
    for (let newIdx = 0; newIdx < newDetections.length; newIdx++) {
      if (matchedNewDetections.has(newIdx)) continue;

      let tooClose = false;
      for (let i = 0; i < updatedDefs.length; i++) {
        const iou = calculateIoU(newDetections[newIdx], updatedDefs[i].box);
        if (iou > IOU_THRESHOLD / 2) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        // Create new tracked defect
        const newDefect = {
          id: idCounter++,
          box: newDetections[newIdx],
          lastSeen: currentTime,
        };
        
        // Add to local tracked defects
        updatedDefs.push(newDefect);
        
        // Also add to the defect queue through context
        addDefect(newDefect);
      }
    }

    // Update states
    setNextId(idCounter);
    setTrackedDefects(updatedDefs);
    setLastDetectionTime(currentTime);
  }

  // Check and remove timed-out defects
  function checkDefectTimeout() {
    const now = Date.now();
    if (trackedDefects.length > 0) {
      const updatedDefects = trackedDefects.filter(
        (defect) => now - defect.lastSeen <= DEFECT_PERSISTENCE_TIMEOUT
      );

      if (updatedDefects.length < trackedDefects.length) {
        setTrackedDefects(updatedDefects);
      }
    }
  }

  // Set up timeout checker
  useEffect(() => {
    const timer = setInterval(() => {
      checkDefectTimeout();
    }, 500);
    return () => clearInterval(timer);
  }, [trackedDefects]);

  // Share current camera image with context whenever it changes
  useEffect(() => {
    if (imageSrc) {
      setCurrentCameraImage(imageSrc);
    }
  }, [imageSrc, setCurrentCameraImage]);

  // Share overlay canvas with context whenever tracked defects change
  useEffect(() => {
    if (overlayCanvasRef.current) {
      setCurrentOverlayCanvas(overlayCanvasRef.current);
    }
  }, [trackedDefects, setCurrentOverlayCanvas]);

  // Subscribe to ROS camera topic
  useEffect(() => {
    if (ros && connection) {
      const listener = new ROSLIB.Topic({
        ros,
        name: CAMERA_TOPIC,
        messageType: MESSAGE_TYPE,
      });

      listener.subscribe((message) => {
        try {
          const compressedImage = message as {
            format: string;
            data: Uint8Array;
          };
          const base64 = btoa(
            Array.from(compressedImage.data)
              .map((byte) => String.fromCharCode(byte))
              .join("")
          );

          let format = compressedImage.format;
          if (!format || format.includes("bgr8") || format.includes("rgb8")) {
            format = "jpeg";
          }

          const imageUrl = `data:image/${format};base64,${base64}`;
          setImageSrc(imageUrl);

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
  }, [ros, connection, modelLoaded, setCurrentCameraImage]);

  // Handle image load and setup canvas
  const handleImageLoad = () => {
    if (imageRef.current && overlayCanvasRef.current) {
      overlayCanvasRef.current.width = imageRef.current.clientWidth;
      overlayCanvasRef.current.height = imageRef.current.clientHeight;

      if (trackedDefects.length > 0) {
        drawTrackedDefects();
      }
    }
  };

  // Draw tracked defects on the canvas
  function drawTrackedDefects() {
    if (!overlayCanvasRef.current || !imageRef.current) return;

    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (trackedDefects.length === 0) return;

    // Original image dimensions from preprocessing (640x640 for YOLO)
    const origWidth = 640;
    const origHeight = 640;

    // Display dimensions
    const displayWidth = canvas.width;
    const displayHeight = canvas.height;

    // Scale factors
    const scaleX = displayWidth / origWidth;
    const scaleY = displayHeight / origHeight;

    // Setup drawing style
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255, 0, 0, 0.9)"; // Red border

    // Draw each tracked defect
    for (const defect of trackedDefects) {
      const [x1, y1, x2, y2, confidence] = defect.box;

      // IMPORTANT CHANGE: Don't multiply by origWidth/origHeight
      // as coordinates are already in pixel space
      const imgX1 = x1;
      const imgY1 = y1;
      const imgX2 = x2;
      const imgY2 = y2;

      // Scale to display dimensions
      const displayX1 = imgX1 * scaleX;
      const displayY1 = imgY1 * scaleY;
      const displayWidth = (imgX2 - imgX1) * scaleX;
      const displayHeight = (imgY2 - imgY1) * scaleY;

      // Debug logs
      console.log(
        `Drawing box: [${displayX1}, ${displayY1}, ${displayWidth}, ${displayHeight}]`
      );

      // Draw bounding box (red outline)
      ctx.beginPath();
      ctx.rect(displayX1, displayY1, displayWidth, displayHeight);
      ctx.stroke();

      // Add label with ID and confidence score
      ctx.fillStyle = "rgba(255, 0, 0, 0.9)"; // Red text
      ctx.font = "bold 16px Arial";
      ctx.fillText(
        `Defect #${defect.id}: ${(confidence * 100).toFixed(1)}%`,
        displayX1 + 5,
        displayY1 + 20
      );
    }

    // Add count of defects
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(10, 10, 240, 30);
    ctx.fillStyle = "white";
    ctx.font = "bold 16px Arial";
    ctx.fillText(`Defects tracked: ${trackedDefects.length}`, 20, 30);
  }

  // Redraw when tracked defects change
  useEffect(() => {
    if (trackedDefects.length > 0) {
      drawTrackedDefects();
    }
  }, [trackedDefects]);

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
          <canvas
            ref={overlayCanvasRef}
            className="absolute top-0 left-0 w-[100%] h-[100%]"
            style={{ pointerEvents: "none" }}
          />
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </>
      ) : (
        <p className="text-gray-500">Waiting for camera feed...</p>
      )}
      {!modelLoaded && !modelError && (
        <p className="text-yellow-600">Loading sewer detection model...</p>
      )}
      {modelError && <p className="text-red-600">Error: {modelError}</p>}
    </div>
  );
}

export default SewerDetection;