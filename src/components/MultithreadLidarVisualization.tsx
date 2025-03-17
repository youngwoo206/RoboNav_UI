import { useEffect, useRef, useState, useMemo } from "react";
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
  const connectionTimeRef = useRef<number>(Date.now());
  const workerRef = useRef<Worker | null>(null);

  // Performance optimization settings
  const [decimationFactor, setDecimationFactor] = useState<number>(2); // Only process every nth point
  const [qualityLevel, setQualityLevel] = useState<string>("medium"); // low, medium, high
  const [showPath, setShowPath] = useState<boolean>(true);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);
  const [frameCount, setFrameCount] = useState<number>(0);
  const [fps, setFps] = useState<number>(0);
  const [isVisible, setIsVisible] = useState<boolean>(true);

  // Constants for optimization
  const MAX_PATH_POINTS = 5000; // Maximum number of path points to store

  // Topic definitions - moved to useMemo to prevent recreating on each render
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

  // Path buffer optimization: pre-allocate a fixed-size buffer
  const pathBufferRef = useRef({
    positions: new Float32Array(MAX_PATH_POINTS * 3),
    attribute: null as THREE.BufferAttribute | null,
    currentLength: 0,
  });

  // Initialize Three.js scene
  useEffect(() => {
    if (!canvasRef.current) return;

    // Every time the component mounts, record the current time
    connectionTimeRef.current = Date.now();

    // Reset path data
    pathBufferRef.current.currentLength = 0;

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      canvasRef.current.clientWidth / canvasRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer with optimized settings
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      powerPreference: "high-performance",
      precision: "mediump",
    });
    renderer.setSize(
      canvasRef.current.clientWidth,
      canvasRef.current.clientHeight
    );
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Helper elements - only add if in high quality mode
    if (qualityLevel === "high") {
      scene.add(new THREE.AxesHelper(1));
      scene.add(new THREE.GridHelper(10, 10, 0x888888, 0x444444));
    } else if (qualityLevel === "medium") {
      scene.add(new THREE.GridHelper(10, 5, 0x888888, 0x444444));
    }

    // Basic lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    if (qualityLevel === "high") {
      scene.add(new THREE.DirectionalLight(0xffffff, 0.3));
    }

    // Create point cloud
    const pointGeometry = new THREE.BufferGeometry();
    const pointMaterial = new THREE.PointsMaterial({
      size: 0.03,
      vertexColors: true,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(pointGeometry, pointMaterial);
    scene.add(points);
    pointsRef.current = points;

    // Create path line with pre-allocated buffer
    const pathGeometry = new THREE.BufferGeometry();
    const pathPositions = pathBufferRef.current.positions;
    const pathAttribute = new THREE.BufferAttribute(pathPositions, 3);

    pathGeometry.setAttribute("position", pathAttribute);
    pathGeometry.setDrawRange(0, 0); // Initially no points to draw

    const pathMaterial = new THREE.LineBasicMaterial({
      color: 0xff0000,
      linewidth: 2,
    });

    const pathLine = new THREE.Line(pathGeometry, pathMaterial);
    pathLine.visible = showPath;
    scene.add(pathLine);
    pathLineRef.current = pathLine;

    // Store attribute reference for updates
    pathBufferRef.current.attribute = pathAttribute;

    // Create robot marker
    const markerGeometry = new THREE.ConeGeometry(0.15, 0.4, 8);
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.8,
    });
    markerGeometry.rotateX(-Math.PI); // Rotate cone to point upward
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

    // Enhanced resize handler with debounce
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (!canvasRef.current || !cameraRef.current || !rendererRef.current)
          return;

        const width = canvasRef.current.clientWidth;
        const height = canvasRef.current.clientHeight;

        cameraRef.current.aspect = width / height;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(width, height);
      }, 100);
    };

    window.addEventListener("resize", handleResize);

    // Animation loop
    let lastFrameTime = 0;
    const targetFPS = 30; // Target 30 FPS for smoother performance
    const frameInterval = 1000 / targetFPS;

    const animate = (timestamp: number) => {
      const elapsed = timestamp - lastFrameTime;

      if (elapsed > frameInterval) {
        lastFrameTime = timestamp - (elapsed % frameInterval);

        if (controlsRef.current) {
          controlsRef.current.update();
        }

        // Adapt point size based on camera position
        if (cameraRef.current && pointsRef.current) {
          const distanceScale =
            1.0 - Math.min(0.7, cameraRef.current.position.length() / 50);
          (pointsRef.current.material as THREE.PointsMaterial).size =
            0.03 * distanceScale;
        }

        // FPS counter
        setFrameCount((count) => count + 1);
        if (timestamp - lastUpdateTime > 1000) {
          setFps(frameCount);
          setFrameCount(0);
          setLastUpdateTime(timestamp);

          // Update stats display with FPS
          if (statsRef.current) {
            let statsText = statsRef.current.textContent || "";
            statsText = statsText.split(" | ")[0] + ` | FPS: ${fps}`;
            statsRef.current.textContent = statsText;
          }
        }

        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    // Visibility change detection
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (statsRef.current && statsRef.current.parentElement) {
        statsRef.current.parentElement.removeChild(statsRef.current);
      }

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // Clean up geometries and materials
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

      // Terminate worker if it exists
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, [qualityLevel]);

  // Initialize Web Worker
  useEffect(() => {
    // Create the worker
    const worker = new Worker(
      new URL("../utilities/pointCloudWorker.ts", import.meta.url)
    );
    workerRef.current = worker;

    // Set up message handler
    worker.onmessage = (e) => {
      const { positions, colors, validPoints, totalPoints } = e.data;

      // Update the point cloud geometry
      if (pointsRef.current) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3)
        );
        geometry.setAttribute(
          "color",
          new THREE.Float32BufferAttribute(colors, 3)
        );
        geometry.computeBoundingSphere();

        // Replace old geometry
        pointsRef.current.geometry.dispose();
        pointsRef.current.geometry = geometry;

        // Update stats
        if (statsRef.current) {
          const decPercent = (100 - (validPoints / totalPoints) * 100).toFixed(
            1
          );
          statsRef.current.textContent = `Points: ${validPoints.toLocaleString()}/${totalPoints.toLocaleString()} (${decPercent}% reduction)`;
        }
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // ROS subscription for pointcloud data
  useEffect(() => {
    if (
      !ros ||
      !connection ||
      !pointsRef.current ||
      !sceneRef.current ||
      !isVisible ||
      !workerRef.current
    )
      return;

    // Throttle variable to limit update frequency
    let lastPointCloudUpdate = 0;
    const MIN_UPDATE_INTERVAL = 100; // ms, limit to 10 updates per second

    const listener = new ROSLIB.Topic({
      ros,
      name: topics.SLAM_TOPIC,
      messageType: topics.MESSAGE_TYPE,
    });

    listener.subscribe((message: any) => {
      const now = Date.now();
      if (now - lastPointCloudUpdate < MIN_UPDATE_INTERVAL) return;
      lastPointCloudUpdate = now;

      // Send message to web worker for processing
      if (workerRef.current) {
        workerRef.current.postMessage({
          message: message,
          decimationFactor: decimationFactor,
        });
      }
    });

    return () => {
      listener.unsubscribe();
    };
  }, [ros, connection, isVisible, topics, decimationFactor]);

  // ROS subscription for robot path - with optimized path handling
  useEffect(() => {
    if (
      !ros ||
      !connection ||
      !pathLineRef.current ||
      !sceneRef.current ||
      !isVisible
    )
      return;

    // Throttle variable to limit update frequency
    let lastPathUpdate = 0;
    const MIN_PATH_UPDATE_INTERVAL = 200; // ms

    const pathListener = new ROSLIB.Topic({
      ros,
      name: topics.PATH_TOPIC,
      messageType: topics.PATH_MESSAGE_TYPE,
    });

    pathListener.subscribe((message: any) => {
      const now = Date.now();
      if (now - lastPathUpdate < MIN_PATH_UPDATE_INTERVAL) return;
      lastPathUpdate = now;

      if (pathLineRef.current) {
        updateRobotPath(message);
      }
    });

    return () => {
      pathListener.unsubscribe();
    };
  }, [ros, connection, isVisible, topics]);

  // ROS subscription for current robot position
  useEffect(() => {
    if (
      !ros ||
      !connection ||
      !robotMarkerRef.current ||
      !sceneRef.current ||
      !isVisible
    )
      return;

    let lastPositionUpdate = 0;
    const MIN_POSITION_UPDATE_INTERVAL = 200; // ms

    const positionListener = new ROSLIB.Topic({
      ros,
      name: topics.CURRENT_POSITION_TOPIC,
      messageType: topics.CURRENT_POSITION_MESSAGE_TYPE,
    });

    positionListener.subscribe((message: any) => {
      const now = Date.now();
      if (now - lastPositionUpdate < MIN_POSITION_UPDATE_INTERVAL) return;
      lastPositionUpdate = now;

      if (robotMarkerRef.current) {
        updateRobotMarker(message, robotMarkerRef.current);
      }
    });

    return () => {
      positionListener.unsubscribe();
    };
  }, [ros, connection, isVisible, topics]);

  // Effect to update path visibility
  useEffect(() => {
    if (pathLineRef.current) {
      pathLineRef.current.visible = showPath;
    }
  }, [showPath]);

  // Function to update the robot marker position
  function updateRobotMarker(poseMsg: any, marker: THREE.Mesh) {
    const pose = poseMsg.pose;

    const newX = pose.position.x;
    const newY = pose.position.z + 0.2;
    const newZ = -pose.position.y;

    const currentPos = marker.position;
    const distChange = Math.sqrt(
      Math.pow(newX - currentPos.x, 2) +
        Math.pow(newY - currentPos.y, 2) +
        Math.pow(newZ - currentPos.z, 2)
    );

    // Only update if position changed by more than 0.01 units
    if (distChange > 0.01) {
      marker.position.set(newX, newY, newZ);
    }
  }

  // OPTIMIZED: Function to update robot path using pre-allocated buffer
  function updateRobotPath(pathMsg: any) {
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
    if (currentLength > 0) {
      const lastIdx = ((currentLength - 1) % MAX_PATH_POINTS) * 3;
      const lastX = positions[lastIdx];
      const lastY = positions[lastIdx + 1];
      const lastZ = positions[lastIdx + 2];

      const dist = Math.sqrt(
        Math.pow(x - lastX, 2) + Math.pow(y - lastY, 2) + Math.pow(z - lastZ, 2)
      );

      if (dist < 0.02) return; // Skip if too close
    }

    // Add point to buffer (with circular buffer behavior)
    const index = (currentLength % MAX_PATH_POINTS) * 3;
    positions[index] = x;
    positions[index + 1] = y;
    positions[index + 2] = z;

    // Update path length and notify Three.js only of what has changed
    const newLength = currentLength + 1;
    pathBufferRef.current.currentLength = newLength;

    if (attribute) {
      // Only mark the attribute as needing update, not recreating the whole geometry
      attribute.needsUpdate = true;

      // Update the draw range to show only valid points
      if (newLength <= MAX_PATH_POINTS) {
        // We haven't filled the buffer yet, show all points
        pathLineRef.current.geometry.setDrawRange(0, newLength);
      } else {
        // Buffer is full, show all points in circular fashion
        pathLineRef.current.geometry.setDrawRange(0, MAX_PATH_POINTS);
      }
    }

    // Only occasionally update bounding sphere (every 20 points)
    if (newLength % 20 === 0 || newLength === 1) {
      pathLineRef.current.geometry.computeBoundingSphere();
    }

    // Update stats if desired
    if (statsRef.current) {
      let statsText = statsRef.current.textContent || "";
      const pathLength = Math.min(newLength, MAX_PATH_POINTS);

      if (!statsText.includes("Path")) {
        statsRef.current.textContent = statsText + ` | Path: ${pathLength} pts`;
      } else {
        const parts = statsText.split(" | ");
        parts[parts.length - 1] = `Path: ${pathLength} pts`;
        statsRef.current.textContent = parts.join(" | ");
      }
    }
  }

  // Clear path data - now optimized
  const clearPath = () => {
    pathBufferRef.current.currentLength = 0;

    if (pathLineRef.current) {
      // Simply set draw range to zero instead of creating new geometry
      pathLineRef.current.geometry.setDrawRange(0, 0);

      // Update stats display
      if (statsRef.current) {
        let statsText = statsRef.current.textContent || "";
        if (statsText.includes("Path")) {
          const parts = statsText.split(" | ");
          parts[parts.length - 1] = `Path: 0 pts`;
          statsRef.current.textContent = parts.join(" | ");
        }
      }
    }
  };

  // Toggle path visibility
  const togglePathVisibility = () => {
    setShowPath(!showPath);
  };

  const handleQualityAdjustment = (val: number) => {
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
  };

  // Quality control UI
  const controlPanel = (
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
      }}
    >
      <div>
        <label htmlFor="decimation">Decimation: </label>
        <select
          id="decimation"
          value={decimationFactor}
          onChange={(e) => handleQualityAdjustment(Number(e.target.value))}
          style={{
            background: "#333",
            color: "white",
            border: "1px solid #555",
          }}
        >
          <option value={1}>High Quality</option>
          <option value={2}>Medium Quality</option>
          <option value={4}>Low Quality</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: "10px" }}>
        <button
          onClick={clearPath}
          style={{
            background: "#555",
            padding: "3px 6px",
            borderRadius: "3px",
          }}
        >
          Clear Path
        </button>
        <button
          onClick={togglePathVisibility}
          style={{
            background: "#555",
            padding: "3px 6px",
            borderRadius: "3px",
          }}
        >
          {showPath ? "Hide Path" : "Show Path"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
      {controlPanel}
    </>
  );
}

export default MultithreadedLidarVisualization;
