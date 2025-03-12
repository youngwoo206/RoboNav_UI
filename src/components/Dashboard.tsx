import Input from "./Input";
import Telemetry from "./Telemetry";
import DefectFeed from "./DefectFeed";

interface DashboardProps {
  ros: ROSLIB.Ros | null;
  connection: boolean;
}

function Dashboard({ ros, connection }: DashboardProps) {
  return (
    <div className="bg-gray-100 col-span-2 grid grid-cols-3 p-5 gap-5">
      <Telemetry />
      <div className="w-[100%] col-start-2 flex flex-col justify-center items-center mx-0 px-0">
        <div className="h-10 rounded-lg bg-gray-200 w-[100%] flex items-center px-5">
          <p className="font-semibold ">{"Connection Status:"}</p>
          {connection ? (
            <span className="h-3.5 w-3.5 rounded-2xl bg-green-400 mx-2" />
          ) : (
            <span className="h-3.5 w-3.5 rounded-2xl bg-red-400 mx-2" />
          )}
        </div>
        <Input ros={ros} connection={connection} />
      </div>
      <DefectFeed />
    </div>
  );
}

export default Dashboard;
