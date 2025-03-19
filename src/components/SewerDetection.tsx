import ROSLIB, { Ros } from "roslib";
import { useEffect, useState, useRef } from "react";
import * as ort from "onnxruntime-web";

interface CameraProps {
  connection: boolean;
  ros: Ros | null;
}

interface TrackedDefect {
  id: number;
  box: number[]; // [x1, y1, x2, y2, confidence]
  lastSeen: number; // timestamp
  class?: number; // Class ID for different types of defects
  className?: string; // Class name if available
}

function SewerDetection({ connection, ros }: CameraProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  const [trackedDefects, setTrackedDefects] = useState<TrackedDefect[]>([]);
  const [lastDetectionTime, setLastDetectionTime] = useState<number>(0);
  const [nextId, setNextId] = useState<number>(1); // For generating unique defect IDs

  const sessionRef = useRef<ort.InferenceSession | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastInferenceTimeRef = useRef<number>(0);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const CAMERA_TOPIC = "/husky3/camera_0/color/image_raw/compressed";
  const MESSAGE_TYPE = "sensor_msgs/msg/CompressedImage";
  const MODEL_PATH = "./model/sewer_light.onnx";
  const THROTTLE_INTERVAL = 500;
  const THRESHOLD = 0.25; // Lowered threshold for testing
  const DEFECT_PERSISTENCE_TIMEOUT = 2000; // Time in ms to keep defect displayed after detection
  const IOU_THRESHOLD = 0.1; // Minimum IoU to consider the same defect

  // Class names for sewer defects (update these with your actual classes)
  const CLASS_NAMES = [
    "Background",
    "Crack",
    "Root",
    "Deposit",
    "Joint Damage",
    "Connection",
    "Surface Damage",
    "Deformation",
    "Obstacle",
  ];

  // Load the ONNX model
  useEffect(() => {
    async function loadModel() {
      try {
        console.log("LOADING SEWER DETECTION MODEL");
        const session = await ort.InferenceSession.create(MODEL_PATH, {
          executionProviders: ["webgl", "wasm"],
          graphOptimizationLevel: "all",
        });

        sessionRef.current = session;
        console.log("ONNX model loaded successfully");
        console.log("Model input names:", session.inputNames);
        console.log("Model output names:", session.outputNames);

        // Log model metadata if available
        if (session.inputNames.length > 0) {
          const inputName = session.inputNames[0];
          const inputInfo = session.inputNames.map((name) => ({
            name,
            dims: session._inputs[name].dims,
            type: session._inputs[name].type,
          }));
          console.log("Input details:", inputInfo);
        }

        if (session.outputNames.length > 0) {
          const outputInfo = session.outputNames.map((name) => ({
            name,
            dims: session._outputs[name]?.dims || "unknown",
            type: session._outputs[name]?.type || "unknown",
          }));
          console.log("Output details:", outputInfo);
        }

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

  // Preprocess image and run inference with debug logging
  async function runInference(imageUrl: string) {
    if (!sessionRef.current || !canvasRef.current) {
      return;
    }

    const now = Date.now();

    // throttling
    if (now - lastInferenceTimeRef.current < THROTTLE_INTERVAL) {
      checkDefectTimeout();
      return;
    }

    lastInferenceTimeRef.current = now;

    try {
      // Get input name from session - should be "images"
      const inputName = sessionRef.current.inputNames[0];
      console.log("Using input name:", inputName);

      // Load the image
      const img = new Image();
      img.src = imageUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
      });

      // Draw image to canvas for processing at 640x640
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Set canvas dimensions to 640x640 as required by the new model
      canvas.width = 640;
      canvas.height = 640;
      ctx.drawImage(img, 0, 0, 640, 640);

      // Get image data
      const imageData = ctx.getImageData(0, 0, 640, 640);
      const { data, width, height } = imageData;
      console.log("Processing image dimensions:", width, "x", height);

      // Create a Float32Array for the tensor
      const tensor = new Float32Array(1 * 3 * height * width);

      // Preprocess image data
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pixelOffset = (y * width + x) * 4; // RGBA

          // Normalize pixel values to [0,1] range (sewer models often use 0-1 normalization)
          const r = data[pixelOffset] / 255.0;
          const g = data[pixelOffset + 1] / 255.0;
          const b = data[pixelOffset + 2] / 255.0;

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

      console.log("Running inference...");
      console.time("inference");
      const results = await sessionRef.current.run(feeds);
      console.timeEnd("inference");

      console.log("Model output keys:", Object.keys(results));

      // Log detailed information about each output tensor
      for (const outputName in results) {
        const outputTensor = results[outputName];
        console.log(`Output "${outputName}":`);
        console.log("  - Shape:", outputTensor.dims);
        console.log("  - Type:", outputTensor.type);
        console.log("  - Data length:", outputTensor.data.length);

        // Log a sample of the data
        const dataArray = Array.from(outputTensor.data as Float32Array);
        console.log("  - First 20 values:", dataArray.slice(0, 20));

        // YOLOv5/v8 typically outputs data in the format [num_boxes, 5 + num_classes]
        // where 5 represents [x, y, width, height, confidence]
        if (outputTensor.dims.length === 3) {
          console.log(
            "  - Appears to be YOLOv5/v8 output format (batch, num_boxes, data)"
          );
          const [batch, boxes, data_per_box] = outputTensor.dims;
          console.log(
            `  - Batch: ${batch}, Boxes: ${boxes}, Data per box: ${data_per_box}`
          );

          // Assuming output is in format [cx, cy, w, h, conf, class_probs...]
          const numClasses = data_per_box - 5;
          console.log(`  - Detected ${numClasses} classes in output`);
        }
      }

      // Now we need to process the output based on its structure
      // For YOLO models, output is typically an array of bounding boxes
      if (results["output0"]) {
        const outputData = results["output0"].data as Float32Array;
        const outputShape = results["output0"].dims;
        processYoloOutput(outputData, outputShape);
      } else {
        console.error("Expected output 'output0' not found in results");
      }
    } catch (error) {
      console.error("Inference error:", error);
    }
  }

  // Process YOLO model output (used by many object detection models)
  function processYoloOutput(outputData: Float32Array, outputShape: number[]) {
    console.log("Processing YOLO output with shape:", outputShape);

    // Determine the format based on the shape
    if (outputShape.length === 3) {
      // Typical YOLOv5/v8 format: [batch, num_boxes, box_data]
      const [batch, numDetections, boxDataLength] = outputShape;
      const numClasses = boxDataLength - 5; // 5 for x, y, w, h, confidence

      console.log(
        `Found ${numDetections} potential detections with ${numClasses} classes`
      );

      const detections: any = [];

      // Process each detection
      for (let i = 0; i < numDetections; i++) {
        const offset = i * boxDataLength;

        // YOLOv5/v8 outputs are typically centerX, centerY, width, height
        const x = outputData[offset + 0]; // centerX
        const y = outputData[offset + 1]; // centerY
        const w = outputData[offset + 2]; // width
        const h = outputData[offset + 3]; // height
        const confidence = outputData[offset + 4]; // confidence

        // Convert centerX, centerY, width, height to x1, y1, x2, y2
        const x1 = x - w / 2;
        const y1 = y - h / 2;
        const x2 = x + w / 2;
        const y2 = y + h / 2;

        // Find class with highest probability
        let maxClassProb = 0;
        let maxClassIdx = 0;

        for (let c = 0; c < numClasses; c++) {
          const classProb = outputData[offset + 5 + c];
          if (classProb > maxClassProb) {
            maxClassProb = classProb;
            maxClassIdx = c;
          }
        }

        // Calculate final score (confidence * class probability)
        const score = confidence * maxClassProb;

        // Log detailed information for higher confidence detections
        if (score > 0.1) {
          console.log(`Detection ${i}:`);
          console.log(
            `  Position: (${x.toFixed(4)}, ${y.toFixed(4)}), Size: ${w.toFixed(
              4
            )}x${h.toFixed(4)}`
          );
          console.log(
            `  Box: [${x1.toFixed(4)}, ${y1.toFixed(4)}, ${x2.toFixed(
              4
            )}, ${y2.toFixed(4)}]`
          );
          console.log(`  Confidence: ${confidence.toFixed(4)}`);
          console.log(
            `  Class: ${maxClassIdx} (${CLASS_NAMES[maxClassIdx] || "Unknown"})`
          );
          console.log(`  Class Probability: ${maxClassProb.toFixed(4)}`);
          console.log(`  Final Score: ${score.toFixed(4)}`);
        }

        // Add to detections if above threshold
        if (score > THRESHOLD) {
          detections.push([x1, y1, x2, y2, score, maxClassIdx]);
        }
      }

      console.log(
        `Found ${detections.length} detections above threshold ${THRESHOLD}`
      );

      // Update tracked defects
      if (detections.length > 0) {
        updateTrackedDefects(detections);
      } else {
        checkDefectTimeout();
      }
    } else if (outputShape.length === 2) {
      // Older YOLO formats: [num_boxes, box_data]
      console.log("Processing 2D output format");
      // Similar processing for 2D output would go here
    } else {
      console.warn("Unrecognized output format with shape:", outputShape);
    }

    // Always draw tracked defects
    drawTrackedDefects();
  }

  // Update tracked defects using IoU matching
  function updateTrackedDefects(newDetections: number[][]) {
    const currentTime = Date.now();
    let updatedDefs = [...trackedDefects];
    const matchedNewDetections = new Set<number>();
    const matchedExistingDetections = new Set<number>();
    let idCounter = nextId;

    console.log(
      "Updating tracked defects with new detections:",
      newDetections.length
    );

    for (let newIdx = 0; newIdx < newDetections.length; newIdx++) {
      if (matchedNewDetections.has(newIdx)) continue;

      const newBox = newDetections[newIdx].slice(0, 5); // Use just the box and score
      const classId = newDetections[newIdx][5] || 0;
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
        updatedDefs[bestMatchIndex].class = classId;
        updatedDefs[bestMatchIndex].className =
          CLASS_NAMES[classId] || "Unknown";
        matchedExistingDetections.add(bestMatchIndex);
        matchedNewDetections.add(newIdx);
      }
    }

    for (let newIdx = 0; newIdx < newDetections.length; newIdx++) {
      if (matchedNewDetections.has(newIdx)) continue;

      let tooClose = false;

      for (let i = 0; i < updatedDefs.length; i++) {
        const iou = calculateIoU(
          newDetections[newIdx].slice(0, 5),
          updatedDefs[i].box
        );

        if (iou > IOU_THRESHOLD / 2) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        const classId = newDetections[newIdx][5] || 0;
        updatedDefs.push({
          id: idCounter++,
          box: newDetections[newIdx].slice(0, 5),
          lastSeen: currentTime,
          class: classId,
          className: CLASS_NAMES[classId] || "Unknown",
        });
      }
    }

    // Update the next ID counter
    setNextId(idCounter);
    // Update the defect state
    setTrackedDefects(updatedDefs);
    setLastDetectionTime(currentTime);
  }

  function checkDefectTimeout() {
    const now = Date.now();
    if (trackedDefects.length > 0) {
      // Remove defects that haven't been seen recently
      const updatedDefects = trackedDefects.filter(
        (defect) => now - defect.lastSeen <= DEFECT_PERSISTENCE_TIMEOUT
      );

      if (updatedDefects.length < trackedDefects.length) {
        setTrackedDefects(updatedDefects);
      }
    }
  }

  // Set up timer to regularly check for defect timeout
  useEffect(() => {
    const timer = setInterval(() => {
      checkDefectTimeout();
    }, 500); // Check every 500ms

    return () => clearInterval(timer);
  }, [trackedDefects]);

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

      // Redraw defects if there are any
      if (trackedDefects.length > 0) {
        drawTrackedDefects();
      }
    }
  };

  // Draw tracked defects
  function drawTrackedDefects() {
    if (!overlayCanvasRef.current || !imageRef.current) return;

    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (trackedDefects.length === 0) return;

    // Original image dimensions from preprocessing
    const origWidth = 640;
    const origHeight = 640;

    // Display dimensions
    const displayWidth = canvas.width;
    const displayHeight = canvas.height;

    // Scale factors
    const scaleX = displayWidth / origWidth;
    const scaleY = displayHeight / origHeight;

    // Draw each tracked defect
    for (const defect of trackedDefects) {
      const [x1, y1, x2, y2, confidence] = defect.box;
      const className = defect.className || "Unknown";

      // Generate a color based on the class ID
      const classId = defect.class || 0;
      const hue = (classId * 30) % 360;
      const color = `hsl(${hue}, 100%, 50%)`;

      ctx.lineWidth = 3;
      ctx.strokeStyle = color;

      // Convert normalized coordinates to pixel coordinates
      const imgX1 = x1 * origWidth;
      const imgY1 = y1 * origHeight;
      const imgX2 = x2 * origWidth;
      const imgY2 = y2 * origHeight;

      // Scale to display dimensions
      const displayX1 = imgX1 * scaleX;
      const displayY1 = imgY1 * scaleY;
      const displayWidth = (imgX2 - imgX1) * scaleX;
      const displayHeight = (imgY2 - imgY1) * scaleY;

      // Draw bounding box with transparent fill
      ctx.beginPath();
      ctx.rect(displayX1, displayY1, displayWidth, displayHeight);
      ctx.stroke(); // Only stroke, no fill

      // Add colored background for text
      const labelText = `${className}: ${(confidence * 100).toFixed(1)}%`;
      const textWidth = ctx.measureText(labelText).width + 10;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(displayX1, displayY1 - 25, textWidth, 25);
      ctx.globalAlpha = 1.0;

      // Add label with class name and confidence score
      ctx.fillStyle = "white";
      ctx.font = "bold 16px Arial";
      ctx.fillText(labelText, displayX1 + 5, displayY1 - 7);
    }

    // Add count of defects
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(10, 10, 240, 30);
    ctx.fillStyle = "white";
    ctx.font = "bold 16px Arial";
    ctx.fillText(`Defects tracked: ${trackedDefects.length}`, 20, 30);
  }

  // Effect to ensure boxes are redrawn when state changes
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
      {!modelLoaded && (
        <p className="text-yellow-600">Loading sewer detection model...</p>
      )}
    </div>
  );
}

export default SewerDetection;
