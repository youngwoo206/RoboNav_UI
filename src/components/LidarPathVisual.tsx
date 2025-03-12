import { useEffect, useRef } from "react";
import ROSLIB from "roslib";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface LidarVisualizationProps {
  ros: ROSLIB.Ros | null;
  connection: boolean;
}

function LidarPathVisual({ ros, connection }: LidarVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const pathLineRef = useRef<THREE.Line | null>(null); // New ref for path line
  const statsRef = useRef<HTMLDivElement | null>(null);

  const SLAM_TOPIC = "/map";
  const MESSAGE_TYPE = "sensor_msgs/msg/PointCloud2";
  const PATH_TOPIC = "/path";
  const PATH_MESSAGE_TYPE = "nav_msgs/Path";

  // Initialize Three.js scene
  useEffect(() => {
    if (!canvasRef.current) return;

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

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
    });
    renderer.setSize(
      canvasRef.current.clientWidth,
      canvasRef.current.clientHeight
    );
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Helper elements
    scene.add(new THREE.AxesHelper(1)); // Red=X, Green=Y, Blue=Z
    scene.add(new THREE.GridHelper(10, 10, 0x888888, 0x444444));
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    scene.add(new THREE.DirectionalLight(0xffffff, 0.3));

    // Create empty point cloud
    const pointGeometry = new THREE.BufferGeometry();
    const pointMaterial = new THREE.PointsMaterial({
      size: 0.03,
      vertexColors: true,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(pointGeometry, pointMaterial);
    scene.add(points);
    pointsRef.current = points;

    // Create empty path line
    const pathGeometry = new THREE.BufferGeometry();
    const pathMaterial = new THREE.LineBasicMaterial({
      color: 0xff0000, // Red path line
      linewidth: 2,
    });
    const pathLine = new THREE.Line(pathGeometry, pathMaterial);
    scene.add(pathLine);
    pathLineRef.current = pathLine;

    // Stats display
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

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!canvasRef.current) return;
      const width = canvasRef.current.clientWidth;
      const height = canvasRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (statsRef.current && statsRef.current.parentElement) {
        statsRef.current.parentElement.removeChild(statsRef.current);
      }
      renderer.dispose();
    };
  }, []);

  // ROS subscription for pointcloud
  useEffect(() => {
    if (!ros || !connection || !pointsRef.current || !sceneRef.current) return;

    const listener = new ROSLIB.Topic({
      ros,
      name: SLAM_TOPIC,
      messageType: MESSAGE_TYPE,
    });

    listener.subscribe((message: any) => {
      console.log("Received pointcloud message");

      if (pointsRef.current) {
        updatePointCloud(message, pointsRef.current);
      }
    });

    return () => {
      listener.unsubscribe();
    };
  }, [ros, connection]);

  // ROS subscription for robot path
  useEffect(() => {
    if (!ros || !connection || !pathLineRef.current || !sceneRef.current)
      return;

    const pathListener = new ROSLIB.Topic({
      ros,
      name: PATH_TOPIC,
      messageType: PATH_MESSAGE_TYPE,
    });

    pathListener.subscribe((message: any) => {
      console.log("Received path message");

      if (pathLineRef.current) {
        updateRobotPath(message, pathLineRef.current);
      }
    });

    return () => {
      pathListener.unsubscribe();
    };
  }, [ros, connection]);

  // Function to update the robot path visualization
  function updateRobotPath(pathMsg: any, pathLine: THREE.Line) {
    if (!pathMsg.poses || !pathMsg.poses.length) {
      console.log("Path message has no poses");
      return;
    }

    // Extract positions from path message
    const positions = new Float32Array(pathMsg.poses.length * 3);

    for (let i = 0; i < pathMsg.poses.length; i++) {
      const pose = pathMsg.poses[i].pose;

      // ROS coordinate system to Three.js coordinate system
      positions[i * 3] = pose.position.x; // ROS X → Three.js X
      positions[i * 3 + 1] = pose.position.z; // ROS Z → Three.js Y (up)
      positions[i * 3 + 2] = -pose.position.y; // ROS Y → Three.js -Z
    }

    // Create new geometry for the path line
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();

    // Replace old geometry with new one
    pathLine.geometry.dispose(); // Properly dispose the old geometry
    pathLine.geometry = geometry;

    console.log(`Updated path with ${pathMsg.poses.length} points`);
  }

  // Function to process pointcloud data
  function updatePointCloud(message: any, points: THREE.Points) {
    const { height, width, point_step, row_step, data, fields } = message;
    const totalPoints = height * width;

    // Find offsets for x, y, z in the binary structure
    const fieldOffsets: Record<string, number> = {};
    if (fields) {
      fields.forEach((field: any) => {
        fieldOffsets[field.name] = field.offset;
      });
    }

    // Default offsets if fields are not specified
    const xOffset = fieldOffsets.x ?? 0;
    const yOffset = fieldOffsets.y ?? 4;
    const zOffset = fieldOffsets.z ?? 8;

    // Create arrays for positions and colors
    const positions = new Float32Array(totalPoints * 3);
    const colors = new Float32Array(totalPoints * 3);

    let validPoints = 0;

    // Process points
    for (let i = 0; i < totalPoints; i++) {
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

      // Add point (note: ROS uses different coordinate system than Three.js)
      positions[validPoints * 3] = x; // ROS X → Three.js X
      positions[validPoints * 3 + 1] = z; // ROS Z → Three.js Y (up)
      positions[validPoints * 3 + 2] = -y; // ROS Y → Three.js -Z

      // Color based on height (z value)
      // Customize this color mapping as needed
      const heightValue = z;
      const colorValue = (heightValue + 1) / 4; // Normalize to 0-1 range (adjust as needed)

      const pointColor = new THREE.Color();

      if (colorValue < 0.25) {
        // Blue to cyan
        pointColor.setHSL(0.6, 1.0, 0.5 + colorValue * 2);
      } else if (colorValue < 0.5) {
        // Cyan to green
        pointColor.setHSL(0.4, 1.0, 0.5 + (colorValue - 0.25) * 2);
      } else if (colorValue < 0.75) {
        // Green to yellow
        pointColor.setHSL(0.3 - (colorValue - 0.5) * 1.2, 1.0, 0.5);
      } else {
        // Yellow to red
        pointColor.setHSL(0.1 - (colorValue - 0.75) * 0.4, 1.0, 0.5);
      }

      colors[validPoints * 3] = pointColor.r;
      colors[validPoints * 3 + 1] = pointColor.g;
      colors[validPoints * 3 + 2] = pointColor.b;

      validPoints++;
    }

    // Update stats display
    if (statsRef.current) {
      statsRef.current.textContent = `Points: ${validPoints.toLocaleString()}`;
    }

    // Create new geometry for the points
    const geometry = new THREE.BufferGeometry();

    // Only add attributes if we have valid points
    if (validPoints > 0) {
      // Trim arrays to include only valid points
      const trimmedPositions = positions.slice(0, validPoints * 3);
      const trimmedColors = colors.slice(0, validPoints * 3);

      // Update geometry
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(trimmedPositions, 3)
      );
      geometry.setAttribute(
        "color",
        new THREE.BufferAttribute(trimmedColors, 3)
      );
      geometry.computeBoundingSphere();
    }

    // Replace old geometry with new one
    points.geometry.dispose(); // Properly dispose the old geometry
    points.geometry = geometry;

    console.log(`Rendered ${validPoints} points`);
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}

export default LidarPathVisual;
