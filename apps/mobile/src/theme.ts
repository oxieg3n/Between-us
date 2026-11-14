export type Theme = {
  background: string;
  surface: string;
  text: string;
  muted: string;
  primary: string;
  onPrimary: string;
  accent: string;
  border: string;
  peach: string;
};

export const light: Theme = {
  background: "#F7FAFC",
  surface: "#FFFFFF",
  text: "#253746",
  muted: "#536976",
  primary: "#2F6077",
  onPrimary: "#FFFFFF",
  accent: "#A9D6DD",
  border: "#CBDCE3",
  peach: "#F0B8A4",
};

export const dark: Theme = {
  background: "#142630",
  surface: "#203844",
  text: "#F7FAFC",
  muted: "#B8CDD5",
  primary: "#A9D6DD",
  onPrimary: "#142630",
  accent: "#2F6077",
  border: "#59727E",
  peach: "#F0B8A4",
};

export const themes = { light, dark };
export const spacing = { small: 8, medium: 16, large: 24, section: 32 };
export const radii = { input: 12, button: 16, card: 24 };
