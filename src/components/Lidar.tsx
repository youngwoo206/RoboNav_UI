import { useState, useEffect, useRef } from "react";
import ROSLIB, { Ros } from "roslib";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { BufferGeometry, BufferAttribute, PointsMaterial, Color } from "three";

interface LidarProps {
  connection: boolean;
  ros: Ros | null;
}

function Lidar({ connection, ros }: LidarProps) {
  const [points, setPoints] = useState<Float32Array | null>(null);
  const [colors, setColors] = useState<Float32Array | null>(null);

  const pointsRef = useRef<number>(0);
  const geometryRef = useRef<BufferGeometry>(null);

  const SLAM_TOPIC = "/map";
  const MESSAGE_TYPE = "sensor_msgs/msg/PointCloud2";

  useEffect(() => {
    if (ros && connection) {
      const listener = new ROSLIB.Topic({
        ros,
        name: SLAM_TOPIC,
        messageType: MESSAGE_TYPE,
      });

      listener.subscribe((message: any) => {
        try {
          console.log(message);
          const { height, width, point_step, row_step, data } = message;
          const totalPoints = height * width;

          const positions = new Float32Array(totalPoints * 3);
          const colorData = new Float32Array(totalPoints * 3);

          let positionIndex = 0;
          let colorIndex = 0;

          for (let i = 0; i < totalPoints; i++) {
            const baseOffset = i * point_step;

            // Extract XYZ (assuming first 12 bytes are float32 XYZ)
            const x = new Float32Array(
              new Uint8Array([
                data[baseOffset],
                data[baseOffset + 1],
                data[baseOffset + 2],
                data[baseOffset + 3],
              ]).buffer
            )[0];

            const y = new Float32Array(
              new Uint8Array([
                data[baseOffset + 4],
                data[baseOffset + 5],
                data[baseOffset + 6],
                data[baseOffset + 7],
              ]).buffer
            )[0];

            const z = new Float32Array(
              new Uint8Array([
                data[baseOffset + 8],
                data[baseOffset + 9],
                data[baseOffset + 10],
                data[baseOffset + 11],
              ]).buffer
            )[0];

            // Skip points with NaN or infinity values
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

            positions[positionIndex++] = x;
            positions[positionIndex++] = y;
            positions[positionIndex++] = z;

            // Color based on height (z-value) - creates a height map effect
            const normalizedHeight = (z + 2) / 4; // Adjust range as needed
            const color = new Color().setHSL(
              0.6 - normalizedHeight * 0.5, // blue to red
              0.8,
              0.5
            );

            colorData[colorIndex++] = color.r;
            colorData[colorIndex++] = color.g;
            colorData[colorIndex++] = color.b;
          }

          // Trim to actual number of valid points
          const actualPoints = positionIndex / 3;
          const trimmedPositions = positions.slice(0, positionIndex);
          const trimmedColors = colorData.slice(0, colorIndex);

          setPoints(trimmedPositions);
          setColors(trimmedColors);
          pointsRef.current = actualPoints;
        } catch (error) {
          console.log("LIDAR ERROR: ", error);
        }
      });

      // Cleanup on unmount
      return () => {
        listener.unsubscribe();
      };
    }
  }, [ros, connection]);

  useEffect(() => {
    if (geometryRef.current && points && colors) {
      geometryRef.current.setAttribute(
        "position",
        new BufferAttribute(points, 3)
      );
      geometryRef.current.setAttribute("color", new BufferAttribute(colors, 3));
      geometryRef.current.computeBoundingSphere();
    }
  }, [points, colors]);

  return (
    <div className="rounded-lg bg-gray-100 w-165 h-80">
      {/* {connection && (
        <Canvas camera={{ position: [0, 0, 5], far: 1000 }}>
          <color attach="background" args={["#111"]} />
          <ambientLight intensity={0.5} />

          {points && colors && (
            <points>
              <bufferGeometry ref={geometryRef} />
              <pointsMaterial size={0.01} vertexColors sizeAttenuation />
            </points>
          )}

          <OrbitControls />
          <gridHelper args={[10, 10]} />
          <axesHelper args={[5]} />
        </Canvas>
      )} */}

      <div
        style={{ position: "absolute", bottom: 10, left: 10, color: "white" }}
      >
        {pointsRef.current > 0
          ? `Rendering ${pointsRef.current.toLocaleString()} points`
          : "Waiting for point cloud data..."}
      </div>
    </div>
  );
}

export default Lidar;
