import { createContext, useContext, ReactNode } from "react";
import { DataContextType } from "@/utilities/types";

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  // EXAMPLE USECASE:
  // const [theme, setTheme] = useState("light");

  // const toggleTheme = () => {
  //   setTheme((prev) => (prev === "light" ? "dark" : "light"));
  // };

  return (
    <DataContext.Provider
      value={
        {
          /* add default values */
        }
      }
    >
      {children}
    </DataContext.Provider>
  );
}

export function useDataContext() {
  const context = useContext(DataContext);

  if (!context) {
    throw new Error("useDataContext must be used within a DataProvider");
  }
  return context;
}
