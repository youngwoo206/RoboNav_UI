/* eslint-disable @typescript-eslint/no-unused-vars */
import Input from "./Input";
import DefectExport from "./DefectExport";

interface DashboardProps {
  ros: ROSLIB.Ros | null;
  connection: boolean;
}


  function Dashboard({ ros, connection }: DashboardProps) {
    return (
      <div className=" col-span-2 grid grid-cols-3 gap-5">
        {/* <Telemetry /> */}
        <div className="w-[100%] col-span-2 flex flex-col justify-center items-center mx-0 px-0">
          <Input ros={ros} connection={connection} />
        </div>
        <DefectExport />
      </div>
    );
  }

export default Dashboard;
