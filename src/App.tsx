import { useState, useEffect } from "react";
import Input from "./components/Input";
import ROSLIB from "roslib";

function App() {
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("");
  const [ros, setRos] = useState(null);

  const newRos = new ROSLIB.Ros({
    url: "ws://localhost:9090",
  });

  console.log("ROS: ", newRos);

  return (
    <div className="h-[90vh] flex justify-center">
      <div className="bg-amber-100 w-[90vw] h-40 mt-[10vh]">
        <div>
          <p>main</p>
        </div>
        <Input />
      </div>
    </div>
  );
}

export default App;
