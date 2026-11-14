import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import { dark, light } from "./theme";
export type Appearance = "system" | "light" | "dark";
export const APPEARANCE_KEY = "between-us.appearance";
export function parseAppearance(value: string | null): Appearance {
  return value === "light" || value === "dark" ? value : "system";
}
function useAppearanceState() {
  const system = useColorScheme();
  const [appearance, select] = useState<Appearance>("system");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const queue = useRef(Promise.resolve());
  const changed = useRef(false);
  const writeVersion = useRef(0);
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(APPEARANCE_KEY)
      .then((value) => {
        if (mounted && !changed.current) select(parseAppearance(value));
      })
      .catch(() => {
        if (mounted && !changed.current)
          setError(
            "Appearance could not be loaded. Device appearance is available.",
          );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  function setAppearance(next: Appearance) {
    changed.current = true;
    const version = ++writeVersion.current;
    select(next);
    setError("");
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        try {
          await AsyncStorage.setItem(APPEARANCE_KEY, next);
          if (version === writeVersion.current) setError("");
        } catch {
          if (version === writeVersion.current)
            setError(
              "Appearance changed for now, but could not be saved. Try again.",
            );
        }
      });
  }
  return {
    appearance,
    setAppearance,
    theme: (appearance === "system" ? system === "dark" : appearance === "dark")
      ? dark
      : light,
    loading,
    error,
    retry: () => setAppearance(appearance),
  };
}
const Context = createContext<ReturnType<typeof useAppearanceState> | null>(
  null,
);
export function AppearanceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const value = useAppearanceState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAppearance() {
  const value = useContext(Context);
  if (!value) throw new Error("AppearanceProvider missing");
  return value;
}
