import { Ros } from "roslib";
import LidarVisualization from "./LidarVisualization";
import LidarPathVisual from "./LidarPathVisual";

interface SLAMProps {
  connection?: boolean;
  ros?: Ros | null;
}

function SLAM({ connection = false, ros = null }: SLAMProps) {
  return (
    <div className="rounded-lg bg-gray-100 w-[100%] aspect-video">
      {!connection ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">Waiting for ROS connection...</p>
        </div>
      ) : (
        <LidarVisualization ros={ros} connection={connection} />
        // <LidarPathVisual ros={ros} connection={connection} />
      )}
    </div>
  );
}

export default SLAM;
