import { useState, useEffect } from "react";
import Input from "./components/Input";

function App() {
  return (
    <div className="h-[90vh] flex justify-center">
      <div className="bg-amber-100 w-[90vw] h-40 mt-[10vh]">
        <div>
          <p>main</p>
        </div>
        <Input />
      </div>
    </div>
  );
}

export default App;
