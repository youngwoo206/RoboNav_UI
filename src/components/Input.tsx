import React from "react";

function Input() {
  //iohook?
  const ioHook = require("iohook");

  //@ts-ignore
  ioHook.on("mousemove", (event) => {
    console.log(event); // { type: 'mousemove', x: 700, y: 400 }
  });

  // Register and start hook
  ioHook.start();
  return <div>Input</div>;
}

export default Input;
