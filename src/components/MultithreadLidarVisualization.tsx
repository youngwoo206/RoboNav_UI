import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import ROSLIB from "roslib";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface LidarVisualizationProps {
  ros: ROSLIB.Ros | null;
  connection: boolean;
}

function MultithreadedLidarVisualization({
  ros,
  connection,
}: LidarVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const pathLineRef = useRef<THREE.Line | null>(null);
  const robotMarkerRef = useRef<THREE.Mesh | null>(null);
  const statsRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const fpsCounterRef = useRef<{
    count: number;
    lastTime: number;
    value: number;
  }>({
    count: 0,
    lastTime: 0,
    value: 0,
  });
  const renderTimeRef = useRef<number>(0);
  const lastMessageTimeRef = useRef<number>(0);

  const [decimationFactor, setDecimationFactor] = useState<number>(2);
  const [qualityLevel, setQualityLevel] = useState<string>("medium");
  const [showPath, setShowPath] = useState<boolean>(true);
  const [isVisible, setIsVisible] = useState<boolean>(true);

  const MAX_PATH_POINTS = 500;
  const MIN_UPDATE_INTERVAL = 100; // ms between point cloud updates
  const MIN_PATH_UPDATE_INTERVAL = 200; // ms between path updates

  // Optimization: Move topic definitions to useMemo
  const topics = useMemo(
    () => ({
      SLAM_TOPIC: "/map",
      MESSAGE_TYPE: "sensor_msgs/msg/PointCloud2",
      PATH_TOPIC: "/path",
      PATH_MESSAGE_TYPE: "nav_msgs/Path",
      CURRENT_POSITION_TOPIC: "/current_pose",
      CURRENT_POSITION_MESSAGE_TYPE: "geometry_msgs/PoseStamped",
    }),
    []
  );

  // Path buffer optimization: pre-allocated with circular buffer pattern
  const pathBufferRef = useRef({
    positions: new Float32Array(MAX_PATH_POINTS * 3),
    attribute: null as THREE.BufferAttribute | null,
    currentLength: 0,
    needsUpdate: false,
  });

  // Performance settings - automatically adjust based on FPS
  const performanceSettingsRef = useRef({
    targetFPS: 30,
    adaptiveDecimation: true,
    dynamicLOD: true,
    lastAdjustment: 0,
    adjustmentInterval: 2000, // ms between performance adjustments
  });

  // Initialize Three.js scene
  useEffect(() => {
    if (!canvasRef.current) return;

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    sceneRef.current = scene;

    // Camera with optimized near/far planes
    const camera = new THREE.PerspectiveCamera(
      75,
      canvasRef.current.clientWidth / canvasRef.current.clientHeight,
      0.1, // Near plane
      50 // Far plane - reduced from 1000 for better depth precision
    );
    camera.position.set(5, 5, 5);
    cameraRef.current = camera;

    // High-performance renderer settings
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: false, // Disable antialiasing for performance
      powerPreference: "high-performance",
      precision: "mediump",
      alpha: false, // Disable alpha for performance
      stencil: false, // Disable stencil for performance
      depth: true, // Keep depth testing
    });

    // Set size with device pixel ratio capping
    const pixelRatio = Math.min(window.devicePixelRatio, 1.5); // Cap at 1.5 for performance
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(
      canvasRef.current.clientWidth,
      canvasRef.current.clientHeight
    );

    // Optimize renderer
    renderer.shadowMap.enabled = false;
    rendererRef.current = renderer;

    // Optimized controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1; // Increased for smoother feeling
    controls.rotateSpeed = 0.7; // Adjusted for better feel
    controls.zoomSpeed = 0.8;
    controls.panSpeed = 0.8;
    controls.update();
    controlsRef.current = controls;

    // Scene helpers based on quality level
    if (qualityLevel === "high") {
      scene.add(new THREE.AxesHelper(1));
      scene.add(new THREE.GridHelper(10, 10, 0x888888, 0x444444));
    } else if (qualityLevel === "medium") {
      scene.add(new THREE.GridHelper(10, 5, 0x888888, 0x444444));
    }
    // No helpers for low quality

    // Simple lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));

    // Create point cloud with optimized material
    const pointMaterial = new THREE.PointsMaterial({
      size: 0.03,
      vertexColors: true,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(new THREE.BufferGeometry(), pointMaterial);
    scene.add(points);
    pointsRef.current = points;

    // Create path line with pre-allocated buffer
    const pathGeometry = new THREE.BufferGeometry();
    const pathPositions = pathBufferRef.current.positions;
    const pathAttribute = new THREE.BufferAttribute(pathPositions, 3);

    pathGeometry.setAttribute("position", pathAttribute);
    pathGeometry.setDrawRange(0, 0);

    const pathMaterial = new THREE.LineBasicMaterial({
      color: 0xff0000,
      linewidth: 2,
    });

    const pathLine = new THREE.Line(pathGeometry, pathMaterial);
    pathLine.visible = showPath;
    scene.add(pathLine);
    pathLineRef.current = pathLine;
    pathBufferRef.current.attribute = pathAttribute;

    // Create robot marker with simplified geometry
    const markerGeometry = new THREE.ConeGeometry(0.15, 0.4, 8); // 8 segments is enough
    markerGeometry.rotateX(-Math.PI);

    const markerMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.8,
      depthTest: true,
    });

    const robotMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    robotMarker.position.y = 0.2;
    scene.add(robotMarker);
    robotMarkerRef.current = robotMarker;

    // Create stats display
    const stats = document.createElement("div");
    stats.style.position = "absolute";
    stats.style.bottom = "10px";
    stats.style.left = "10px";
    stats.style.padding = "5px";
    stats.style.background = "rgba(0,0,0,0.5)";
    stats.style.color = "white";
    stats.style.fontFamily = "monospace";
    stats.style.fontSize = "12px";
    stats.style.borderRadius = "3px";
    stats.textContent = "Waiting for pointcloud...";
    canvasRef.current.parentElement?.appendChild(stats);
    statsRef.current = stats;

    // Efficient resize handler with debounce
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);

      resizeTimeout = setTimeout(() => {
        if (!canvasRef.current || !cameraRef.current || !rendererRef.current)
          return;

        const width = canvasRef.current.clientWidth;
        const height = canvasRef.current.clientHeight;

        cameraRef.current.aspect = width / height;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(width, height, false); // false = don't update CSS
      }, 250); // Longer debounce for better performance during resize
    };

    window.addEventListener("resize", handleResize);

    // Optimized animation loop with fixed time step
    const targetFPS = performanceSettingsRef.current.targetFPS;
    const frameInterval = 1000 / targetFPS;
    let lastFrameTime = 0;

    const animate = (timestamp: number) => {
      // Request next frame first for better performance
      animationFrameRef.current = requestAnimationFrame(animate);

      // Throttle rendering to target FPS
      const elapsed = timestamp - lastFrameTime;
      if (elapsed < frameInterval) return;

      // Calculate actual FPS
      fpsCounterRef.current.count++;
      if (timestamp - fpsCounterRef.current.lastTime >= 1000) {
        fpsCounterRef.current.value = fpsCounterRef.current.count;
        fpsCounterRef.current.count = 0;
        fpsCounterRef.current.lastTime = timestamp;

        // Update stats with FPS
        if (statsRef.current) {
          const baseText = statsRef.current.textContent?.split(" | ")[0] || "";
          statsRef.current.textContent = `${baseText} | FPS: ${fpsCounterRef.current.value}`;

          // Adaptive performance adjustments
          if (
            performanceSettingsRef.current.adaptiveDecimation &&
            timestamp - performanceSettingsRef.current.lastAdjustment >
              performanceSettingsRef.current.adjustmentInterval
          ) {
            performanceSettingsRef.current.lastAdjustment = timestamp;

            // Auto-adjust quality based on FPS
            if (fpsCounterRef.current.value < 20 && decimationFactor < 4) {
              // Automatically lower quality if FPS is too low
              setDecimationFactor((prev) => Math.min(prev * 2, 4));
            } else if (
              fpsCounterRef.current.value > 45 &&
              decimationFactor > 1
            ) {
              // Automatically increase quality if FPS is high
              setDecimationFactor((prev) => Math.max(prev / 2, 1));
            }
          }
        }
      }

      // Update controls with damping
      if (controlsRef.current) {
        controlsRef.current.update();
      }

      // Dynamic point size based on camera distance
      if (cameraRef.current && pointsRef.current) {
        const distance = cameraRef.current.position.length();
        let pointSize;

        // Optimize point size based on distance
        if (distance < 3) pointSize = 0.04;
        else if (distance < 10) pointSize = 0.03;
        else if (distance < 20) pointSize = 0.025;
        else pointSize = 0.02;

        (pointsRef.current.material as THREE.PointsMaterial).size = pointSize;
      }

      // Check if path buffer needs update
      if (
        pathBufferRef.current.needsUpdate &&
        pathBufferRef.current.attribute
      ) {
        pathBufferRef.current.attribute.needsUpdate = true;
        pathBufferRef.current.needsUpdate = false;
      }

      // Render scene
      const renderStart = performance.now();
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      renderTimeRef.current = performance.now() - renderStart;

      // Update timing info for next frame
      lastFrameTime = timestamp - (elapsed % frameInterval);
    };

    // Start animation loop
    animationFrameRef.current = requestAnimationFrame(animate);

    // Tab visibility handling
    const handleVisibilityChange = () => {
      const isTabVisible = !document.hidden;
      setIsVisible(isTabVisible);

      if (isTabVisible) {
        // Reset timing when tab becomes visible again
        fpsCounterRef.current.lastTime = performance.now();
        fpsCounterRef.current.count = 0;
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      // Cleanup handlers
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      // Remove stats element
      if (statsRef.current && statsRef.current.parentElement) {
        statsRef.current.parentElement.removeChild(statsRef.current);
      }

      // Cancel animation
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // Clean up THREE.js resources
      if (pointsRef.current) {
        pointsRef.current.geometry.dispose();
        (pointsRef.current.material as THREE.Material).dispose();
      }

      if (pathLineRef.current) {
        pathLineRef.current.geometry.dispose();
        (pathLineRef.current.material as THREE.Material).dispose();
      }

      if (robotMarkerRef.current) {
        (robotMarkerRef.current.geometry as THREE.BufferGeometry).dispose();
        (robotMarkerRef.current.material as THREE.Material).dispose();
      }

      if (rendererRef.current) {
        rendererRef.current.dispose();
      }

      // Terminate worker
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, [qualityLevel]);

  // Initialize and configure Web Worker
  useEffect(() => {
    // Create worker with error handling
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../utilities/pointCloudWorker.ts", import.meta.url)
      );
      workerRef.current = worker;
    } catch (err) {
      console.error("Failed to create Web Worker:", err);
      return;
    }

    // Optimize worker message handling
    worker.onmessage = (e) => {
      const { positions, colors, validPoints, totalPoints } = e.data;

      // Skip updates if component is unmounting or not visible
      if (!pointsRef.current || !isVisible) return;

      // Create optimized point cloud geometry
      const geometry = new THREE.BufferGeometry();

      // Use transferable buffers directly
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
      );
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colors, 3)
      );

      // Only compute bounding sphere when necessary
      geometry.computeBoundingSphere();

      // Efficiently update point cloud
      if (pointsRef.current.geometry) {
        pointsRef.current.geometry.dispose();
      }
      pointsRef.current.geometry = geometry;

      // Update stats with point count and processing time
      if (statsRef.current) {
        const now = Date.now();
        const processingTime = now - lastMessageTimeRef.current;
        lastMessageTimeRef.current = now;

        const decPercent = Math.round(100 - (validPoints / totalPoints) * 100);
        statsRef.current.textContent = `Points: ${validPoints.toLocaleString()}/${totalPoints.toLocaleString()} (${decPercent}% reduction) | Time: ${processingTime}ms`;
      }
    };

    // Handle worker errors
    worker.onerror = (err) => {
      console.error("Web Worker error:", err);
      if (statsRef.current) {
        statsRef.current.textContent = "Worker error! See console for details.";
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // ROS subscription for pointcloud data - memoize callback for performance
  useEffect(() => {
    if (
      !ros ||
      !connection ||
      !pointsRef.current ||
      !isVisible ||
      !workerRef.current
    )
      return;

    let processingInProgress = false;
    let lastPointCloudUpdate = 0;

    const listener = new ROSLIB.Topic({
      ros,
      name: topics.SLAM_TOPIC,
      messageType: topics.MESSAGE_TYPE,
    });

    // Optimized message handler with rate limiting
    const handleMessage = (message: any) => {
      const now = Date.now();

      // Skip if still processing previous message or rate limiting
      if (
        processingInProgress ||
        now - lastPointCloudUpdate < MIN_UPDATE_INTERVAL
      )
        return;

      lastPointCloudUpdate = now;
      processingInProgress = true;
      lastMessageTimeRef.current = now;

      // Create frustum data for culling in the worker
      let frustumData = null;
      if (cameraRef.current) {
        // Send camera position and frustum planes for culling
        const camera = cameraRef.current;
        frustumData = {
          position: [camera.position.x, camera.position.y, camera.position.z],
          near: camera.near,
          far: camera.far,
          fov: camera.fov,
          aspect: camera.aspect,
        };
      }

      // Process data in worker
      if (workerRef.current) {
        workerRef.current.postMessage({
          message: message,
          decimationFactor: decimationFactor,
          frustumData: frustumData,
        });
      }

      // Reset processing flag when worker responds
      // This is handled implicitly by the onmessage handler
      processingInProgress = false;
    };

    listener.subscribe(handleMessage);

    return () => {
      listener.unsubscribe();
    };
  }, [ros, connection, isVisible, decimationFactor, topics]);

  // ROS subscription for robot path - use optimized path tracking
  useEffect(() => {
    if (!ros || !connection || !pathLineRef.current || !isVisible) return;

    let lastPathUpdate = 0;

    const pathListener = new ROSLIB.Topic({
      ros,
      name: topics.PATH_TOPIC,
      messageType: topics.PATH_MESSAGE_TYPE,
    });

    const handlePathMessage = (message: any) => {
      const now = Date.now();
      if (now - lastPathUpdate < MIN_PATH_UPDATE_INTERVAL) return;
      lastPathUpdate = now;

      if (pathLineRef.current) {
        updateRobotPath(message);
      }
    };

    pathListener.subscribe(handlePathMessage);

    return () => {
      pathListener.unsubscribe();
    };
  }, [ros, connection, isVisible, topics]);

  // ROS subscription for robot position
  useEffect(() => {
    if (!ros || !connection || !robotMarkerRef.current || !isVisible) return;

    let lastPositionUpdate = 0;

    const positionListener = new ROSLIB.Topic({
      ros,
      name: topics.CURRENT_POSITION_TOPIC,
      messageType: topics.CURRENT_POSITION_MESSAGE_TYPE,
    });

    const handlePositionMessage = (message: any) => {
      const now = Date.now();
      if (now - lastPositionUpdate < MIN_PATH_UPDATE_INTERVAL) return;
      lastPositionUpdate = now;

      if (robotMarkerRef.current) {
        updateRobotMarker(message);
      }
    };

    positionListener.subscribe(handlePositionMessage);

    return () => {
      positionListener.unsubscribe();
    };
  }, [ros, connection, isVisible, topics]);

  // Update path visibility
  useEffect(() => {
    if (pathLineRef.current) {
      pathLineRef.current.visible = showPath;
    }
  }, [showPath]);

  // OPTIMIZED: Update robot marker with minimal calculations
  const updateRobotMarker = useCallback((poseMsg: any) => {
    if (!robotMarkerRef.current) return;

    const pose = poseMsg.pose;
    const marker = robotMarkerRef.current;

    const newX = pose.position.x;
    const newY = pose.position.z + 0.2;
    const newZ = -pose.position.y;

    // Only update if position changed significantly (optimization)
    const currentPos = marker.position;
    const dx = newX - currentPos.x;
    const dy = newY - currentPos.y;
    const dz = newZ - currentPos.z;

    // Fast distance calculation (avoid sqrt when possible)
    const distSquared = dx * dx + dy * dy + dz * dz;

    // Only update if moved more than threshold
    if (distSquared > 0.0001) {
      // ~0.01 squared
      marker.position.set(newX, newY, newZ);
    }
  }, []);

  // OPTIMIZED: Update robot path using circular buffer
  const updateRobotPath = useCallback((pathMsg: any) => {
    if (!pathMsg.poses || !pathMsg.poses.length || !pathLineRef.current) return;

    const { positions, attribute, currentLength } = pathBufferRef.current;

    // Get latest position
    const latestPose = pathMsg.poses[pathMsg.poses.length - 1];
    const latestPosition = latestPose.pose.position;

    // Convert to THREE.js coordinates
    const x = latestPosition.x;
    const y = latestPosition.z; // ROS Z → Three.js Y
    const z = -latestPosition.y; // ROS Y → Three.js -Z

    // Skip if too close to previous point (optimization)
    let shouldAddPoint = true;

    if (currentLength > 0) {
      const lastIdx = ((currentLength - 1) % MAX_PATH_POINTS) * 3;
      const lastX = positions[lastIdx];
      const lastY = positions[lastIdx + 1];
      const lastZ = positions[lastIdx + 2];

      // Fast distance check (avoid sqrt)
      const dx = x - lastX;
      const dy = y - lastY;
      const dz = z - lastZ;
      const distSquared = dx * dx + dy * dy + dz * dz;

      if (distSquared < 0.0004) {
        // 0.02 squared
        shouldAddPoint = false;
      }
    }

    if (shouldAddPoint) {
      // Add point to buffer (with circular buffer behavior)
      const index = (currentLength % MAX_PATH_POINTS) * 3;
      positions[index] = x;
      positions[index + 1] = y;
      positions[index + 2] = z;

      // Update path length and notify Three.js
      const newLength = currentLength + 1;
      pathBufferRef.current.currentLength = newLength;
      pathBufferRef.current.needsUpdate = true;

      // Update the draw range
      if (pathLineRef.current) {
        if (newLength <= MAX_PATH_POINTS) {
          // We haven't filled the buffer yet
          pathLineRef.current.geometry.setDrawRange(0, newLength);
        } else {
          // Buffer is full, show all points
          pathLineRef.current.geometry.setDrawRange(0, MAX_PATH_POINTS);
        }
      }

      // Update stats display, but only occasionally to reduce DOM updates
      if (statsRef.current && (newLength % 10 === 0 || newLength === 1)) {
        let statsText = statsRef.current.textContent || "";
        const pathLength = Math.min(newLength, MAX_PATH_POINTS);

        if (!statsText.includes("Path")) {
          statsRef.current.textContent =
            statsText + ` | Path: ${pathLength} pts`;
        } else {
          const parts = statsText.split(" | ");
          // Only update the path part
          const pathPartIndex = parts.findIndex((p) => p.includes("Path"));
          if (pathPartIndex >= 0) {
            parts[pathPartIndex] = `Path: ${pathLength} pts`;
            statsRef.current.textContent = parts.join(" | ");
          }
        }
      }
    }
  }, []);

  // Optimized path clearing function
  const clearPath = useCallback(() => {
    pathBufferRef.current.currentLength = 0;

    if (pathLineRef.current) {
      // Simply set draw range to zero instead of creating new geometry
      pathLineRef.current.geometry.setDrawRange(0, 0);

      // Update stats display
      if (statsRef.current) {
        let statsText = statsRef.current.textContent || "";
        if (statsText.includes("Path")) {
          const parts = statsText.split(" | ");
          const pathPartIndex = parts.findIndex((p) => p.includes("Path"));
          if (pathPartIndex >= 0) {
            parts[pathPartIndex] = `Path: 0 pts`;
            statsRef.current.textContent = parts.join(" | ");
          }
        }
      }
    }
  }, []);

  // Use callback for toggle function
  const togglePathVisibility = useCallback(() => {
    setShowPath((prev) => !prev);
  }, []);

  // Quality adjustment handling
  const handleQualityAdjustment = useCallback((val: number) => {
    setDecimationFactor(val);

    switch (val) {
      case 1: {
        setQualityLevel("high");
        break;
      }
      case 2: {
        setQualityLevel("medium");
        break;
      }
      case 4: {
        setQualityLevel("low");
        break;
      }
    }
  }, []);

  // Memoize control panel to prevent unnecessary re-renders
  const controlPanel = useMemo(
    () => (
      <div
        style={{
          position: "absolute",
          bottom: "10px",
          right: "10px",
          background: "rgba(0,0,0,0.5)",
          padding: "10px",
          borderRadius: "5px",
          color: "white",
          fontSize: "12px",
          display: "flex",
          flexDirection: "column",
          gap: "5px",
          pointerEvents: "auto",
          userSelect: "none",
          zIndex: 100,
        }}
      >
        <div>
          <label htmlFor="decimation">Quality: </label>
          <select
            id="decimation"
            value={decimationFactor}
            onChange={(e) => handleQualityAdjustment(Number(e.target.value))}
            style={{
              background: "#333",
              color: "white",
              border: "1px solid #555",
              padding: "2px",
              borderRadius: "3px",
            }}
          >
            <option value={1}>High</option>
            <option value={2}>Medium</option>
            <option value={4}>Low</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={clearPath}
            style={{
              background: "#555",
              padding: "3px 6px",
              borderRadius: "3px",
              border: "none",
              cursor: "pointer",
            }}
          >
            Clear Path
          </button>
          <button
            onClick={togglePathVisibility}
            style={{
              background: showPath ? "#5a5" : "#555",
              padding: "3px 6px",
              borderRadius: "3px",
              border: "none",
              cursor: "pointer",
            }}
          >
            {showPath ? "Hide Path" : "Show Path"}
          </button>
        </div>
      </div>
    ),
    [
      decimationFactor,
      showPath,
      handleQualityAdjustment,
      clearPath,
      togglePathVisibility,
    ]
  );

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          outline: "none",
          touchAction: "none", // Prevents touch actions from interfering with controls
        }}
        tabIndex={0} // Make canvas focusable
      />
      {controlPanel}
    </>
  );
}

export default MultithreadedLidarVisualization;
