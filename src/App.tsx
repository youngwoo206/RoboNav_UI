import { useState, useEffect } from "react";
// import Camera from "./components/Camera";
import FaceDetection from "./components/FaceDetection";
import SLAM from "./components/SLAM";
import Dashboard from "./components/Dashboard";
import ROSLIB, { Ros } from "roslib";

function App() {
  const [connected, setConnected] = useState<boolean>(false);
  const [ros, setRos] = useState<null | Ros>(null);

  useEffect(() => {
    // Create a new ROSLIB.Ros object
    const newRos = new ROSLIB.Ros({
      url: "ws://localhost:9090",
    });

    newRos.on("connection", () => {
      setConnected(true);
      console.log("Connected to ros websocket");
    });

    newRos.on("error", (error) => {
      console.log("Error: ", error);
    });

    newRos.on("close", () => {
      setConnected(false);
      console.log("Connection to websocket server closed");
    });

    setRos(newRos);

    return () => {
      newRos.close();
    };
  }, []);

  return (
    <div className="flex justify-center ">
      <div className="grid grid-cols-2 gap-5 w-[95%] mt-5 justify-center">
        {/* <Camera connection={connected} ros={ros} /> */}
        <FaceDetection connection={connected} ros={ros} />
        <SLAM connection={true} ros={ros} />
        <Dashboard connection={connected} ros={ros} />
      </div>
    </div>
  );
}

export default App;
