interface StatsProps {
  connection: boolean;
}

function Stats({ connection }: StatsProps) {
  return (
    <div className="rounded-lg bg-gray-100 w-165 h-80 p-5">
      <div className="h-10 rounded-lg bg-gray-200 flex items-center px-5">
        <p className="font-semibold ">{"Connection Status:"}</p>
        {connection ? (
          <span className="h-3.5 w-3.5 rounded-2xl bg-green-400 mx-2" />
        ) : (
          <span className="h-3.5 w-3.5 rounded-2xl bg-red-400 mx-2" />
        )}
      </div>
    </div>
  );
}

export default Stats;
