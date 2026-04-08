import { createContext, useContext } from 'react';

export const PlannerContext = createContext(null);
export const usePlanner = () => useContext(PlannerContext);
