import { createContext, useContext } from "react";
import type { Delta, SchoolBundle, Student, UserAccount, World } from "./types";
import type { useEdu } from "./store";

export interface ScreenBag {
  world: World;
  bundle: SchoolBundle;
  delta: Delta;
  user: UserAccount;
  students: Student[];
  focus: Student | null;
  setView: (view: string) => void;
  setChild: (id: string) => void;
  patch: ReturnType<typeof useEdu.getState>["patch"];
}

const Ctx = createContext<ScreenBag | null>(null);

export function ScreenProvider({ value, children }: { value: ScreenBag; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useScreen(): ScreenBag {
  const value = useContext(Ctx);
  if (!value) throw new Error("Screen is not ready");
  return value;
}
