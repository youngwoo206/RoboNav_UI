import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader.js";

function DisplayLidarVisualization() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const robotMarkerRef = useRef<THREE.Mesh | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [sceneInitialized, setSceneInitialized] = useState<boolean>(false);

  const MAP = "/maps/ideas_clinic_v2.pcd";

  // Robot position from ROS2 (EDGE_SE3:QUAT)
  const robotPosition = {
    x: -0.63278,
    y: -1.93315,
    z: 0.0,
    quaternion: {
      x: -0.00473401,
      y: -0.00573742,
      z: 0.0354279,
      w: 0.999345,
    },
  };

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
    camera.position.set(0, 5, 5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true, // Important for when canvas is moved between containers
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

    // Add grid helper for orientation
    scene.add(new THREE.GridHelper(10, 10, 0x888888, 0x444444));

    // Basic lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    scene.add(new THREE.DirectionalLight(0xffffff, 0.3));

    // Create robot marker (yellow cone)
    const markerGeometry = new THREE.ConeGeometry(0.15, 0.4, 8);
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.8,
    });
    markerGeometry.rotateX(-Math.PI);
    const robotMarker = new THREE.Mesh(markerGeometry, markerMaterial);

    // Position the robot marker
    robotMarker.position.set(
      robotPosition.x,
      robotPosition.z + 0.2,
      -robotPosition.y
    );

    // Apply rotation from quaternion
    robotMarker.quaternion.set(
      robotPosition.quaternion.x,
      robotPosition.quaternion.z,
      -robotPosition.quaternion.y,
      robotPosition.quaternion.w
    );

    scene.add(robotMarker);
    robotMarkerRef.current = robotMarker;

    // Global resize handler
    const handleResize = () => {
      if (!canvasRef.current || !cameraRef.current || !rendererRef.current)
        return;

      const width = canvasRef.current.clientWidth;
      const height = canvasRef.current.clientHeight;

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height, false); // Don't update CSS

      // Force a render
      if (sceneRef.current && cameraRef.current && rendererRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    window.addEventListener("resize", handleResize);

    // Animation loop - defined as a separate named function so it can be referenced later
    const animate = () => {
      if (controlsRef.current) {
        controlsRef.current.update();
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Load PCD file
    const loader = new PCDLoader();
    loader.load(
      MAP,
      (points) => {
        if (sceneRef.current) {
          // Apply custom coloring based on height
          const geometry = points.geometry;
          const positions = geometry.getAttribute("position").array;
          const colors = new Float32Array(positions.length);

          // Create color attribute
          for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];

            // Use z as height since we'll rotate -90° around x-axis
            const heightValue = z;

            // Apply color scheme
            let r, g, b;

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

            colors[i] = r;
            colors[i + 1] = g;
            colors[i + 2] = b;
          }

          // Set the color attribute
          geometry.setAttribute(
            "color",
            new THREE.Float32BufferAttribute(colors, 3)
          );

          // Fix the orientation - rotate -90 degrees around the x-axis
          points.rotation.x = -Math.PI / 2;

          // Set material properties
          const material = points.material as THREE.PointsMaterial;
          material.size = 0.03;
          material.vertexColors = true;
          material.sizeAttenuation = true;

          // Store reference and add to scene
          pointsRef.current = points;
          sceneRef.current.add(points);

          // Center camera on robot position
          controlsRef.current?.target.set(
            robotPosition.x,
            robotPosition.z,
            -robotPosition.y
          );
          controlsRef.current?.update();

          // Force an initial render
          if (rendererRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current);
          }

          // Start animation loop
          animate();

          // Mark scene as initialized
          setSceneInitialized(true);
        }
      },
      undefined,
      (error) => {
        console.error("Error loading PCD file:", error);
      }
    );

    return () => {
      window.removeEventListener("resize", handleResize);

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // Clean up
      if (pointsRef.current && pointsRef.current.geometry) {
        pointsRef.current.geometry.dispose();
        (pointsRef.current.material as THREE.Material).dispose();
      }

      if (robotMarkerRef.current) {
        robotMarkerRef.current.geometry.dispose();
        (robotMarkerRef.current.material as THREE.Material).dispose();
      }

      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, []);

  // Handle modal transition with canvas re-render
  const toggleModal = () => {
    setIsModalOpen(!isModalOpen);

    // Use timeout to allow DOM to update before resizing
    setTimeout(() => {
      if (
        canvasRef.current &&
        cameraRef.current &&
        rendererRef.current &&
        sceneRef.current
      ) {
        // Force resize operation
        const width = canvasRef.current.clientWidth;
        const height = canvasRef.current.clientHeight;

        cameraRef.current.aspect = width / height;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(width, height, false);

        // Force render
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    }, 100);
  };

  // Handle resize when the modal opens/closes
  useEffect(() => {
    if (
      sceneInitialized &&
      rendererRef.current &&
      canvasRef.current &&
      cameraRef.current &&
      sceneRef.current
    ) {
      // Force resize and render when modal state changes
      const width = canvasRef.current.clientWidth;
      const height = canvasRef.current.clientHeight;

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height, false);
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }, [isModalOpen, sceneInitialized]);

  // Enlarge button component
  const EnlargeButton = () => (
    <button
      onClick={toggleModal}
      style={{
        position: "absolute",
        top: "10px",
        right: "10px",
        background: "rgba(0,0,0,0.5)",
        border: "none",
        borderRadius: "4px",
        color: "white",
        padding: "8px 12px",
        cursor: "pointer",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        gap: "5px",
        fontSize: "14px",
      }}
    >
      {isModalOpen ? (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path
              fillRule="evenodd"
              d="M5.5 0a.5.5 0 0 1 .5.5v4A1.5 1.5 0 0 1 4.5 6h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5zm5 0a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 10 4.5v-4a.5.5 0 0 1 .5-.5zM0 10.5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 6 11.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zm10 1a1.5 1.5 0 0 1 1.5-1.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4z"
            />
          </svg>
          Close
        </>
      ) : (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path
              fillRule="evenodd"
              d="M5.828 10.172a.5.5 0 0 0-.707 0l-4.096 4.096V11.5a.5.5 0 0 0-1 0v3.975a.5.5 0 0 0 .5.5H4.5a.5.5 0 0 0 0-1H1.732l4.096-4.096a.5.5 0 0 0 0-.707zm4.344-4.344a.5.5 0 0 0 .707 0l4.096-4.096V4.5a.5.5 0 1 0 1 0V.525a.5.5 0 0 0-.5-.5H11.5a.5.5 0 0 0 0 1h2.768l-4.096 4.096a.5.5 0 0 0 0 .707z"
            />
          </svg>
          Enlarge
        </>
      )}
    </button>
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}

export default DisplayLidarVisualization;
