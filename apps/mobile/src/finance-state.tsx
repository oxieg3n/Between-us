import {
  createContext,
  useContext,
  useRef,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useApp } from "./state";
import { newId } from "./model";
import {
  applyFinanceCommand,
  financeView,
  seedFinanceState,
  type FinanceCommand,
  localDate,
} from "./finance";

type Payload<T> = T extends unknown ? Omit<T, "id" | "at" | "childId"> : never;
export type FinanceAction = Payload<FinanceCommand>;
function useFinanceModel() {
  const app = useApp();
  const [ledger, setLedger] = useState(seedFinanceState);
  const [selectedGoalId, setSelectedGoalId] = useState("");
  const current = useRef(ledger);
  const actor = { role: app.role, childId: "sam" } as const;
  const calendarDay = localDate(new Date().toISOString(), ledger.timezone);
  // Refresh calendar-based payouts at local midnight without replaying finances on journal keystrokes.
  const view = useMemo(
    () => financeView(ledger, { role: app.role, childId: "sam" }, "sam"),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Refresh at family-local midnight as well as ledger/role changes.
    [ledger, app.role, calendarDay],
  );
  function run(action: FinanceAction | (() => FinanceAction)) {
    try {
      const next = applyFinanceCommand(current.current, actor, {
        ...(typeof action === "function" ? action() : action),
        id: newId(),
        at: new Date().toISOString(),
        childId: "sam",
      });
      current.current = next;
      setLedger(next);
      app.setNotice("Updated the fictional family ledger. No money moved.");
      return true;
    } catch (error) {
      app.setNotice(
        error instanceof Error
          ? error.message
          : "The ledger could not be updated.",
      );
      return false;
    }
  }
  return { view, run, selectedGoalId, setSelectedGoalId };
}
const Context = createContext<ReturnType<typeof useFinanceModel> | null>(null);
export function FinanceProvider({ children }: { children: ReactNode }) {
  const value = useFinanceModel();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useFinance() {
  const value = useContext(Context);
  if (!value) throw new Error("FinanceProvider missing");
  return value;
}
