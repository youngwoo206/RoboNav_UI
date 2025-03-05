import { useState, useEffect } from "react";
import Input from "./components/Input";
import Camera from "./components/Camera";
import Lidar from "./components/Lidar";
import Stats from "./components/Stats";
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
      <div className="bg-amber-100 mt-[10vh] grid grid-cols-2 gap-2">
        <Camera connection={connected} ros={ros} />
        <Lidar />
        <Input connection = {connected} ros = {ros}/>
        <Stats connection={connected} ros={ros} />
      </div>
    </div>
  );
}

export default App;
