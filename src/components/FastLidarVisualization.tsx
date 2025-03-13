import { useEffect, useRef, useState, useMemo } from "react";
import ROSLIB from "roslib";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface LidarVisualizationProps {
  ros: ROSLIB.Ros | null;
  connection: boolean;
}

function FastLidarVisualization({ ros, connection }: LidarVisualizationProps) {
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

  // Performance optimization settings
  const [decimationFactor, setDecimationFactor] = useState<number>(2); // Only process every nth point
  const [qualityLevel, setQualityLevel] = useState<string>("medium"); // low, medium, high
  const [showPath, setShowPath] = useState<boolean>(true);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);
  const [frameCount, setFrameCount] = useState<number>(0);
  const [fps, setFps] = useState<number>(0);
  const [isVisible, setIsVisible] = useState<boolean>(true);

  // Topic definitions - moved to useMemo to prevent recreating on each render
  const topics = useMemo(
    () => ({
      //   SLAM_TOPIC: "/husky3/sensors/lidar3d_0/points",
      SLAM_TOPIC: "/map",
      MESSAGE_TYPE: "sensor_msgs/msg/PointCloud2",
      PATH_TOPIC: "/path",
      PATH_MESSAGE_TYPE: "nav_msgs/Path",
      CURRENT_POSITION_TOPIC: "/current_pose",
      CURRENT_POSITION_MESSAGE_TYPE: "geometry_msgs/PoseStamped",
    }),
    []
  );

  // Buffer management for better memory efficiency
  const bufferRef = useRef({
    positions: new Float32Array(500000 * 3), // Pre-allocate buffer for 500K points
    colors: new Float32Array(500000 * 3),
    pathVertices: [] as THREE.Vector3[], // Store path vertices for filtering
  });

  // Initialize Three.js scene with performance optimizations
  useEffect(() => {
    if (!canvasRef.current) return;
    // Every time the component mounts, record the current time
    // This will be used to filter out old path data
    connectionTimeRef.current = Date.now();

    // Reset path vertices
    bufferRef.current.pathVertices = [];

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
      powerPreference: "low-power", // high-performance : Prefer GPU performance
      precision: "mediump", // Use medium precision for better performance
    });
    renderer.setSize(
      canvasRef.current.clientWidth,
      canvasRef.current.clientHeight
    );
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio at 2 for better performance
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
    } else {
      // Simpler grid for medium quality
      if (qualityLevel === "medium") {
        scene.add(new THREE.GridHelper(10, 5, 0x888888, 0x444444));
      }
    }

    // Basic lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));

    // Only add directional light in high quality mode
    if (qualityLevel === "high") {
      scene.add(new THREE.DirectionalLight(0xffffff, 0.3));
    }

    // Create optimized point cloud with adaptive point size
    const pointGeometry = new THREE.BufferGeometry();
    const pointMaterial = new THREE.PointsMaterial({
      size: 0.03,
      vertexColors: true,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(pointGeometry, pointMaterial);
    scene.add(points);
    pointsRef.current = points;

    // Create path line with reduced complexity
    const pathGeometry = new THREE.BufferGeometry();
    const pathMaterial = new THREE.LineBasicMaterial({
      color: 0xff0000,
      linewidth: 2,
    });
    const pathLine = new THREE.Line(pathGeometry, pathMaterial);
    pathLine.visible = showPath; // Control path visibility
    scene.add(pathLine);
    pathLineRef.current = pathLine;

    // Create robot marker
    const markerGeometry = new THREE.ConeGeometry(0.15, 0.4, 8); // Reduced segments
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.8,
    });
    markerGeometry.rotateX(-Math.PI);
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

    // Adaptive frame rate using requestAnimationFrame
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

    // Visibility change detection to save resources when tab is not visible
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
    };
  }, [qualityLevel]);

  // ROS subscription for pointcloud with throttling
  useEffect(() => {
    if (
      !ros ||
      !connection ||
      !pointsRef.current ||
      !sceneRef.current ||
      !isVisible
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

      if (pointsRef.current) {
        updatePointCloud(message, pointsRef.current);
      }
    });

    return () => {
      listener.unsubscribe();
    };
  }, [ros, connection, isVisible, topics]);

  // ROS subscription for robot path with throttling
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
    const MIN_PATH_UPDATE_INTERVAL = 200; // ms, less frequent updates for path

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
        updateRobotPath(message, pathLineRef.current);
      }
    });

    return () => {
      pathListener.unsubscribe();
    };
  }, [ros, connection, isVisible, topics]);

  // ROS subscription for current robot position with throttling
  useEffect(() => {
    if (
      !ros ||
      !connection ||
      !robotMarkerRef.current ||
      !sceneRef.current ||
      !isVisible
    )
      return;

    // Robot position updates can be more frequent
    let lastPositionUpdate = 0;
    const MIN_POSITION_UPDATE_INTERVAL = 200; // ms, more frequent updates for position

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

  // Function to update the robot marker position (optimized)
  function updateRobotMarker(poseMsg: any, marker: THREE.Mesh) {
    const pose = poseMsg.pose;

    // Only update when there's a significant change
    const newX = pose.position.x;
    const newY = pose.position.z + 0.2;
    const newZ = -pose.position.y;

    // Avoid unnecessary updates if position hasn't changed much
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

  // Function to update the robot path visualization with time-based filtering
  function updateRobotPath(pathMsg: any, pathLine: THREE.Line) {
    if (!pathMsg.poses || !pathMsg.poses.length) return;

    // Only use path points that were created after the component mounted
    // This is the key fix for preventing old path data from showing up on restart

    // Get the message timestamp if available (ROS2 header stamp)
    const now = Date.now();
    let newPointsCount = 0;
    const pathVertices = bufferRef.current.pathVertices;

    // Extract only new positions from path message
    for (let i = 0; i < pathMsg.poses.length; i++) {
      // Check if this pose has a header with timestamp
      const pose = pathMsg.poses[i];
      const poseTime =
        pose.header && pose.header.stamp
          ? pose.header.stamp.sec * 1000 + pose.header.stamp.nanosec / 1000000
          : now;

      // Skip old path points from before the component mounted
      if (poseTime < connectionTimeRef.current) continue;

      // Convert position to THREE.Vector3
      const position = pose.pose.position;
      const vertex = new THREE.Vector3(
        position.x, // ROS X → Three.js X
        position.z, // ROS Z → Three.js Y (up)
        -position.y // ROS Y → Three.js -Z
      );

      // Check if this is a new point (avoid duplicates)
      if (
        pathVertices.length === 0 ||
        vertex.distanceTo(pathVertices[pathVertices.length - 1]) > 0.02
      ) {
        pathVertices.push(vertex);
        newPointsCount++;
      }
    }

    // If no new points, no need to update geometry
    if (newPointsCount === 0) return;

    // Use path simplification for better performance
    // Only use a subset of points based on path length
    const totalVertices = pathVertices.length;
    let stride = 1;

    // Reduce number of path points for very large paths
    if (totalVertices > 1000) stride = Math.floor(totalVertices / 500);

    const simplifiedCount = Math.ceil(totalVertices / stride);
    const positions = new Float32Array(simplifiedCount * 3);

    for (let i = 0, j = 0; i < totalVertices; i += stride, j++) {
      const vertex = pathVertices[i];
      positions[j * 3] = vertex.x;
      positions[j * 3 + 1] = vertex.y;
      positions[j * 3 + 2] = vertex.z;
    }

    // Create new geometry for the path line
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();

    // Replace old geometry with new one
    pathLine.geometry.dispose();
    pathLine.geometry = geometry;

    // Update stats if many points were simplified
    if (stride > 1 && statsRef.current) {
      let statsText = statsRef.current.textContent || "";
      if (!statsText.includes("Path")) {
        statsRef.current.textContent =
          statsText + ` | Path: ${simplifiedCount}/${totalVertices} pts`;
      }
    }
  }

  // Clear path data
  const clearPath = () => {
    bufferRef.current.pathVertices = [];
    if (pathLineRef.current) {
      const emptyGeometry = new THREE.BufferGeometry();
      emptyGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute([], 3)
      );
      pathLineRef.current.geometry.dispose();
      pathLineRef.current.geometry = emptyGeometry;
    }
  };

  // Toggle path visibility
  const togglePathVisibility = () => {
    setShowPath(!showPath);
  };

  // Function to process pointcloud data (optimized)
  function updatePointCloud(message: any, points: THREE.Points) {
    const { height, width, point_step, data, fields } = message;
    const totalPoints = height * width;

    // Increase decimation factor for large point clouds to maintain performance
    let currentDecimation = decimationFactor;
    if (totalPoints > 100000) currentDecimation = decimationFactor * 2;
    if (totalPoints > 200000) currentDecimation = decimationFactor * 4;

    // Find offsets for x, y, z in the binary structure
    const fieldOffsets: Record<string, number> = {};
    if (fields) {
      for (let i = 0; i < fields.length; i++) {
        fieldOffsets[fields[i].name] = fields[i].offset;
      }
    }

    // Default offsets if fields are not specified
    const xOffset = fieldOffsets.x ?? 0;
    const yOffset = fieldOffsets.y ?? 4;
    const zOffset = fieldOffsets.z ?? 8;

    // Get references to pre-allocated buffers
    const { positions, colors } = bufferRef.current;

    let validPoints = 0;
    const maxPoints = Math.min(totalPoints, positions.length / 3);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(
        cameraRef.current!.projectionMatrix,
        cameraRef.current!.matrixWorldInverse
      )
    );

    // Process points with decimation and frustum culling
    for (let i = 0; i < totalPoints; i += currentDecimation) {
      if (validPoints >= maxPoints) break;

      const baseOffset = i * point_step;
      if (baseOffset + 12 > data.length) break; // Safety check

      // Extract XYZ coordinates
      const x = new Float32Array(
        new Uint8Array([
          data[baseOffset + xOffset],
          data[baseOffset + xOffset + 1],
          data[baseOffset + xOffset + 2],
          data[baseOffset + xOffset + 3],
        ]).buffer
      )[0];

      const y = new Float32Array(
        new Uint8Array([
          data[baseOffset + yOffset],
          data[baseOffset + yOffset + 1],
          data[baseOffset + yOffset + 2],
          data[baseOffset + yOffset + 3],
        ]).buffer
      )[0];

      const z = new Float32Array(
        new Uint8Array([
          data[baseOffset + zOffset],
          data[baseOffset + zOffset + 1],
          data[baseOffset + zOffset + 2],
          data[baseOffset + zOffset + 3],
        ]).buffer
      )[0];

      // Skip invalid points
      if (
        isNaN(x) ||
        isNaN(y) ||
        isNaN(z) ||
        !isFinite(x) ||
        !isFinite(y) ||
        !isFinite(z)
      ) {
        continue;
      }

      // Convert to Three.js coordinates
      const threeX = x;
      const threeY = z;
      const threeZ = -y;

      // Skip points outside camera frustum (basic culling)
      const point = new THREE.Vector3(threeX, threeY, threeZ);
      if (!frustum.containsPoint(point) && Math.random() > 0.1) {
        // Keep some outside-frustum points (10%) for context
        continue;
      }

      // Add point to buffer
      positions[validPoints * 3] = threeX;
      positions[validPoints * 3 + 1] = threeY;
      positions[validPoints * 3 + 2] = threeZ;

      // Optimized color calculation
      const heightValue = z;
      let r, g, b;

      // Simplified color mapping for better performance
      if (heightValue < -0.5) {
        // Blue for low points
        r = 0;
        g = 0.1;
        b = 0.8;
      } else if (heightValue < 0) {
        // Cyan for ground level
        r = 0;
        g = 0.6;
        b = 0.8;
      } else if (heightValue < 1) {
        // Green for medium height
        r = 0.1;
        g = 0.8;
        b = 0.1;
      } else if (heightValue < 2) {
        // Yellow for tall objects
        r = 0.8;
        g = 0.8;
        b = 0.1;
      } else {
        // Red for very tall objects
        r = 0.8;
        g = 0.1;
        b = 0.1;
      }

      colors[validPoints * 3] = r;
      colors[validPoints * 3 + 1] = g;
      colors[validPoints * 3 + 2] = b;

      validPoints++;
    }

    // Update stats display
    if (statsRef.current) {
      const decPercent = (100 - (validPoints / totalPoints) * 100).toFixed(1);
      statsRef.current.textContent = `Points: ${validPoints.toLocaleString()}/${totalPoints.toLocaleString()} (${decPercent}% reduction)`;
    }

    // Only update geometry if we have valid points
    if (validPoints > 0) {
      // Create new geometry with the valid points
      const geometry = new THREE.BufferGeometry();

      // Slice only the portion of the buffers we need
      const positionAttribute = new THREE.Float32BufferAttribute(
        positions.slice(0, validPoints * 3),
        3
      );
      const colorAttribute = new THREE.Float32BufferAttribute(
        colors.slice(0, validPoints * 3),
        3
      );

      geometry.setAttribute("position", positionAttribute);
      geometry.setAttribute("color", colorAttribute);
      geometry.computeBoundingSphere();

      // Dispose old geometry and replace with new one
      if (points.geometry) points.geometry.dispose();
      points.geometry = geometry;
    }
  }

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

export default FastLidarVisualization;
