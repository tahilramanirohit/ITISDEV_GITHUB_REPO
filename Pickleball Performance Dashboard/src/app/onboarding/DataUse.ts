import { createContext, useContext } from "react";
export const DataUseContext = createContext({ analytics: false, research: false });
export const useDataUse = () => useContext(DataUseContext);
export const DATA_PREFERENCES_UPDATED = "picklepro:data-preferences-updated";
