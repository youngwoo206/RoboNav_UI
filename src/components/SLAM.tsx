import { Ros } from "roslib";
import LidarVisualization from "./LidarVisualization";

interface SLAMProps {
  connection?: boolean;
  ros?: Ros | null;
}

function SLAM({ connection = false, ros = null }: SLAMProps) {
  return (
    <div className="rounded-lg bg-gray-100 w-165 h-80">
      {!connection ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">Waiting for ROS connection...</p>
        </div>
      ) : (
        <LidarVisualization ros={ros} connection={connection} />
      )}
    </div>
  );
}

export default SLAM;
