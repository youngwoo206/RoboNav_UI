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

function Telemetry({ direction, connection }: TelemetryProps) {
  return (
    <div className=" rounded-lg w-[100%] h-[100%] flex flex-col gap-5">
      <div className="h-10 rounded-lg bg-gray-200 w-[100%] flex items-center px-5">
        <p className="font-semibold ">{"Connection:"}</p>
        {connection ? (
          <span className="h-3.5 w-3.5 rounded-2xl bg-green-400 mx-2" />
        ) : (
          <span className="h-3.5 w-3.5 rounded-2xl bg-red-400 mx-2" />
        )}
      </div>
      <div className="rounded-lg bg-gray-200 h-full">
        <div className="w-80 m-auto  rounded-md grid grid-cols-5 grid-rows-7">
          <div className="col-start-3 row-start-1  flex justify-center items-center">
            <ArrowBigUpDash
              size={30}
              color={
                direction && ["i", "o", "u"].includes(direction)
                  ? "#f56565"
                  : "#000"
              }
            />
          </div>
          <div className="row-start-4 col-start-1 flex justify-center items-center">
            <ArrowBigLeftDash
              size={30}
              color={
                direction && ["u", "j", "m"].includes(direction)
                  ? "#f56565"
                  : "#000"
              }
            />
          </div>
          <div className="col-start-2 row-start-2 col-span-3 row-span-5 flex justify-center items-center ">
            <img src={topdown} alt="robot top down" className="w-48 h-48" />
          </div>
          <div className="col-start-5 row-start-4  flex justify-center items-center">
            <ArrowBigRightDash
              size={30}
              color={
                direction && ["o", "l", "."].includes(direction)
                  ? "#f56565"
                  : "#000"
              }
            />
          </div>
          <div className="row-start-7 col-start-3 flex justify-center items-center">
            <ArrowBigDownDash
              size={30}
              color={
                direction && ["m", ",", "."].includes(direction)
                  ? "#f56565"
                  : "#000"
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Telemetry;
