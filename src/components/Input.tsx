import { useState, useEffect } from "react";
import Key from "./Key";
import SpeedIndicator from "./SpeedIndicator";

function Input() {
  const [direction, setDirection] = useState<string | null>(null);
  const [removeDirection, setRemoveDirection] = useState<string | null>(null);

  const [overallSpeed, setOverallSpeed] = useState<number>(0); //temp, pull from ros data
  const [linearSpeed, setLinearSpeed] = useState<number>(0); //temp, pull from ros data
  const [angularSpeed, setAngularSpeed] = useState<number>(0); //temp, pull from ros data

  const maxSpeed: number = 4; //temp, pull from ros data

  const handleKeyUp = (event: KeyboardEvent) => {
    const key = event.key;
    if (["u", "i", "o", "j", "k", "l", "m", ",", "."].includes(key)) {
      setRemoveDirection(() => key);
      setDirection(() => null);
    } else if (["q", "z", "w", "x", "e", "c"].includes(key)) {
      const el = document.getElementById(key);
      el?.classList.remove("text-red-500", "scale-96", "shadow-inner");
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const key = event.key;

    // Handle direction keys
    if (["u", "i", "o", "j", "k", "l", "m", ",", "."].includes(key)) {
      setDirection(() => key);
    }
    // Handle overallSpeed (q > increase, z > decrease)
    else if (["q", "z"].includes(key)) {
      const el = document.getElementById(key);
      el?.classList.add("text-red-500", "scale-96", "shadow-inner");
      if (key === "q") {
        setOverallSpeed((prev) => {
          if (prev < maxSpeed) {
            return prev + 1;
          }
          return prev; // No change if maxSpeed is reached
        });
      } else if (key === "z") {
        setOverallSpeed((prev) => {
          if (prev > 0) {
            return prev - 1;
          }
          return prev; // No change if speed is already 0
        });
      }
    }
    // Handle linearSpeed (w > increase, x > decrease)
    else if (["w", "x"].includes(key)) {
      const el = document.getElementById(key);
      el?.classList.add("text-red-500", "scale-96", "shadow-inner");
      if (key === "w") {
        setLinearSpeed((prev) => {
          if (prev < maxSpeed) {
            return prev + 1;
          }
          return prev; // No change if maxSpeed is reached
        });
      } else if (key === "x") {
        setLinearSpeed((prev) => {
          if (prev > 0) {
            return prev - 1;
          }
          return prev; // No change if speed is already 0
        });
      }
    }
    // Handle angularSpeed (e > increase, c > decrease)
    else if (["e", "c"].includes(key)) {
      const el = document.getElementById(key);
      el?.classList.add("text-red-500", "scale-96", "shadow-inner");
      if (key === "e") {
        setAngularSpeed((prev) => {
          if (prev < maxSpeed) {
            return prev + 1;
          }
          return prev; // No change if maxSpeed is reached
        });
      } else if (key === "c") {
        setAngularSpeed((prev) => {
          if (prev > 0) {
            return prev - 1;
          }
          return prev; // No change if speed is already 0
        });
      }
    }
  };

  useEffect(() => {
    if (direction) {
      const el = document.getElementById(direction);
      el?.classList.add("text-red-500", "scale-96", "shadow-inner");
    }
  }, [direction]);

  useEffect(() => {
    if (removeDirection) {
      const el = document.getElementById(removeDirection);
      el?.classList.remove("text-red-500", "scale-96", "shadow-inner");
      setRemoveDirection(() => null);
    }
  }, [removeDirection]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  //   useEffect(() => {
  //     console.log(`Direction: ${direction}`);
  //   }, [direction, removeDirection]);

  //NOTE: grid-rows-maxSpeed is hardcoded

  return (
    <div className="rounded-lg bg-gray-100 w-165 h-80 flex items-center justify-between gap-5 p-5">
      <div className="w-70 h-70 rounded-lg bg-gray-200 grid grid-cols-3 grid-rows-3 gap-5 p-5 align-middle justify-center">
        <Key letter="q" />
        <Key letter="w" />
        <Key letter="e" />
        <SpeedIndicator speed={overallSpeed} maxSpeed={maxSpeed} />
        <SpeedIndicator speed={linearSpeed} maxSpeed={maxSpeed} />
        <SpeedIndicator speed={angularSpeed} maxSpeed={maxSpeed} />
        <Key letter="z" />
        <Key letter="x" />
        <Key letter="c" />
      </div>
      <div className="w-70 h-70 rounded-lg bg-gray-200 grid grid-cols-3 grid-rows-3 gap-5 p-5 align-middle justify-center">
        <Key letter="u" />
        <Key letter="i" />
        <Key letter="o" />
        <Key letter="j" />
        <Key letter="k" />
        <Key letter="l" />
        <Key letter="m" />
        <Key letter="," />
        <Key letter="." />
      </div>
    </div>
  );
}

export default Input;
