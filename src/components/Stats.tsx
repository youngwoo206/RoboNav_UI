import ROSLIB, { Ros } from "roslib";
import { useEffect, useState } from "react";

interface StatsProps {
  connection: boolean;
  ros: Ros | null;
}

function Stats({ connection, ros }: StatsProps) {
  const [message, setMessage] = useState<any>("");

  useEffect(() => {
    if (ros) {
      // Subscribe to a topic
      const exampleTopic = new ROSLIB.Topic({
        ros: ros,
        name: "/example_topic",
        messageType: "std_msgs/String",
      });

      exampleTopic.subscribe((message) => {
        setMessage(message.data);
        console.log(
          "Received message on " + exampleTopic.name + ": " + message.data
        );
      });

      // Clean up subscription on component unmount
      return () => {
        exampleTopic.unsubscribe();
      };
    }
  }, [ros]);

  const publishMessage = () => {
    if (ros) {
      const examplePublisher = new ROSLIB.Topic({
        ros: ros,
        name: "/example_topic",
        messageType: "std_msgs/String",
      });

      const message = new ROSLIB.Message({
        data: "Hello, ROS2!",
      });
      examplePublisher.publish(message);
      console.log("clicked");
    }
  };

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
      <div>
        <p>Received Message: {message}</p>
        <button
          onClick={publishMessage}
          className="border-2 border-black cursor-pointer"
        >
          Publish Message
        </button>
      </div>
    </div>
  );
}

export default Stats;
