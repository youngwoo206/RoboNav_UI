import { useState, useEffect } from "react";
import topdown from "../assets/robonav_top.png";
import {
  ArrowBigUpDash,
  ArrowBigRightDash,
  ArrowBigLeftDash,
  ArrowBigDownDash,
} from "lucide-react";

interface TelemetryProps {
  direction: string | null;
  connection: boolean;
}

function EnhancedTelemetry({ direction, connection }: TelemetryProps) {
  const [robotStyle, setRobotStyle] = useState({
    transform: "perspective(800px) rotateX(20deg)",
    transition: "transform 0.3s ease-out",
  });

  const [shadowStyle, setShadowStyle] = useState({
    filter: "drop-shadow(0 10px 8px rgba(0, 0, 0, 0.3))",
    transform: "translateY(0)",
    transition: "all 0.3s ease-out",
  });

  useEffect(() => {
    if (!direction) {
      setRobotStyle({
        transform: "perspective(800px) rotateX(20deg)",
        transition: "transform 0.3s ease-out",
      });
      setShadowStyle({
        filter: "drop-shadow(0 10px 8px rgba(0, 0, 0, 0.3))",
        transform: "translateY(0)",
        transition: "all 0.3s ease-out",
      });
      return;
    }

    let newTransform = "perspective(800px)";
    let shadowTransform = "translateY(0)";

    if (["i", "u", "o"].includes(direction)) {
      newTransform += " rotateX(30deg)";
      shadowTransform = "translateY(6px) scaleY(0.85)";
    } else if (["m", ",", "."].includes(direction)) {
      newTransform += " rotateX(10deg)";
      shadowTransform = "translateY(-2px) scaleY(1.1)";
    } else {
      newTransform += " rotateX(20deg)";
    }

    if (["o", "m"].includes(direction)) {
      newTransform += " rotateZ(5deg)";
    } else if (["u", "."].includes(direction)) {
      newTransform += " rotateZ(-5deg)";
    }else if (["j"].includes(direction)) {
      newTransform += " rotateZ(-10deg)";
    }
    else if (["l"].includes(direction)) {
      newTransform += " rotateZ(10deg)";
    }

    setRobotStyle({
      transform: newTransform,
      transition: "transform 0.2s ease-out",
    });

    setShadowStyle({
      filter: "drop-shadow(0 10px 8px rgba(0, 0, 0, 0.3))",
      transform: shadowTransform,
      transition: "all 0.2s ease-out",
    });
  }, [direction]);

  return (
    <div className="rounded-lg w-full h-full flex flex-col gap-5">
      <div className="h-10 bg-gray-400 w-full flex items-center px-5">
        <p className="font-semibold text-black">{"Connection:"}</p>
        <div className="relative">
          {connection ? (
            <>
              <span className="h-3.5 w-3.5 rounded-2xl bg-green-400 mx-2 animate-pulse" />
              <span className="absolute h-5 w-5 rounded-2xl bg-green-400 mx-1 -top-0.5 -left-0.5 animate-ping opacity-20" />
            </>
          ) : (
            <span className="h-3.5 w-3.5 rounded-2xl bg-red-400 mx-2" />
          )}
        </div>
      </div>

      <div className="rounded-lg bg-gray-300 p-4">
        <div className="relative w-full h-64 perspective-800">
          <div
            className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-32 h-4 bg-black rounded-full opacity-30"
            style={shadowStyle}
          ></div>

          <div
            className="col-start-2 row-start-2 col-span-3 row-span-5 flex justify-center items-center relative"
            style={robotStyle}
          >
            <div className="relative">
              <img
                src={topdown}
                alt="robot top down"
                className="w-48 h-48 transition-transform duration-300"
              />
              {/* Removed undefined getMotionLines() */}
              {direction && (
                <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-orange-500 bg-opacity-20 animate-ping"></div>
                </div>
              )}
            </div>
          </div>
        </div>

        {direction && (
          <div className="w-full mt-4 flex justify-center">
            {/* <div className="bg-indigo-700 bg-opacity-40 rounded-full h-2 w-2/3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-orange-400 to-orange-500 h-full transition-all duration-300"
                style={{
                  width: direction === "k" ? "0%" : "60%",
                  animation:
                    direction === "k" ? "none" : "speedPulse 2s infinite",
                }}
              ></div>
            </div> */}
          </div>
        )}
      </div>
    </div>
  );
}

export default EnhancedTelemetry;
