import Input from "./Input";
import Telemetry from "./Telemetry";
import DefectQueueTest from "./DefectQueueTest";
import DefectExport from "./DefectExport";

interface DashboardProps {
  ros: ROSLIB.Ros | null;
  connection: boolean;
}

function Dashboard({ ros, connection }: DashboardProps) {
  // return (
  //   <div className="bg-gray-100 col-span-2 grid grid-cols-3 p-5 gap-5">
  //     <Telemetry />
  //     <div className="w-[100%] col-start-2 flex flex-col justify-center items-center mx-0 px-0">
  //       <div className="h-10 rounded-lg bg-gray-200 w-[100%] flex items-center px-5">
  //         <p className="font-semibold ">{"Connection Status:"}</p>
  //         {connection ? (
  //           <span className="h-3.5 w-3.5 rounded-2xl bg-green-400 mx-2" />
  //         ) : (
  //           <span className="h-3.5 w-3.5 rounded-2xl bg-red-400 mx-2" />
  //         )}
  //       </div>
  //       <Input ros={ros} connection={connection} />
  //     </div>
  //     <div className="min-h-screen bg-gray-100 py-8">
  //     <div className="container mx-auto px-4">
  //       <DefectQueueTest />
  //     </div>
  //   </div>
  //   </div>
  // );
  return (
    <div className="bg-gray-100 col-span-2 grid grid-cols-3 p-5 gap-5 h-[calc(100vh-100px)">
      {/* Telemetry - Left column */}
      <div className="bg-white rounded-lg shadow p-4 overflow-hidden max-h-full">
      <div className="overflow-auto h-[calc(100%-2rem)]">
        <Telemetry />
      </div>
      </div>
      
      {/* Input - Middle column */}
      <div className="bg-white rounded-lg shadow overflow-hidden max-h-full flex flex-col">
      <div className="h-10 bg-gray-200 w-full flex items-center px-5 shrink-0">
        <p className="font-semibold">{"Connection Status:"}</p>
        {connection ? (
          <span className="h-3.5 w-3.5 rounded-2xl bg-green-400 mx-2" />
        ) : (
          <span className="h-3.5 w-3.5 rounded-2xl bg-red-400 mx-2" />
        )}
      </div>
      <div className="overflow-auto flex-1 p-2">
        <Input ros={ros} connection={connection} />
      </div>
    </div>
      
      {/* Defects - Right column */}
      <div className="bg-white rounded-lg shadow overflow-hidden max-h-full">
      <DefectExport />
    </div>
    </div>
  );
}

export default Dashboard;
