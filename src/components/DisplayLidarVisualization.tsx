import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader.js";

function DisplayLidarVisualization() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameRef = useRef<number | null>(null);

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
    // Position camera to better view horizontal floor
    camera.position.set(0, 5, 5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      powerPreference: "high-performance",
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

    // Resize handler
    const handleResize = () => {
      if (!canvasRef.current || !cameraRef.current || !rendererRef.current)
        return;

      const width = canvasRef.current.clientWidth;
      const height = canvasRef.current.clientHeight;

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    window.addEventListener("resize", handleResize);

    // Animation loop
    const animate = () => {
      if (controlsRef.current) {
        controlsRef.current.update();
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    // Load PCD file
    const loader = new PCDLoader();
    const pcdFilePath = "/maps/map.pcd";

    loader.load(
      pcdFilePath,
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

            // Apply color scheme from the original component
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
          // This will make the floor align with the horizontal plane
          points.rotation.x = -Math.PI / 2;

          // Set material properties
          const material = points.material as THREE.PointsMaterial;
          material.size = 0.03;
          material.vertexColors = true;
          material.sizeAttenuation = true;

          // Store reference and add to scene
          pointsRef.current = points;
          sceneRef.current.add(points);
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

      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}

export default DisplayLidarVisualization;
