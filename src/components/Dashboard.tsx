/* eslint-disable @typescript-eslint/no-unused-vars */
import Input from "./Input";
import DefectExport from "./DefectExport";
import Telemetry from "./Telemetry";

interface DashboardProps {
  ros: ROSLIB.Ros | null;
  connection: boolean;
}


  function Dashboard({ ros, connection }: DashboardProps) {
    
    // return (
    //   <div className=" col-span-2 grid grid-cols-3 gap-5">
    //     {/* <Telemetry /> */}
    //     <div className="w-[100%] col-span-2 flex flex-col justify-center items-center mx-0 px-0">
    //       <Input ros={ros} connection={connection} />
    //     </div>
    //     <DefectExport />
    //   </div>
    // );
    return (
      // Make the dashboard span the full width to match the top grid
      <div className="col-span-2 w-full h-full">
        {/* Add full width to ensure it matches the top grid */}
        <div className="w-full">
          <Input ros={ros} connection={connection} />
        </div>
      </div>
    );
    
    
  }

export default Dashboard;
