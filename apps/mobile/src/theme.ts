export type Theme = {
  name: "Safe Harbor" | "Night Harbor";
  background: string;
  surface: string;
  text: string;
  muted: string;
  primary: string;
  onPrimary: string;
  accent: string;
  border: string;
  peach: string;
  paper: string;
  incoming: string;
  outgoing: string;
  onOutgoing: string;
  danger: string;
  soft: string;
};

export const light: Theme = {
  name: "Safe Harbor",
  background: "#F7FAFC",
  surface: "#FFFFFF",
  text: "#253746",
  muted: "#536976",
  primary: "#2F6077",
  onPrimary: "#FFFFFF",
  accent: "#A9D6DD",
  border: "#CBD8DF",
  peach: "#F0B8A4",
  paper: "#FFFFFF",
  incoming: "#EAF0F3",
  outgoing: "#2F6077",
  onOutgoing: "#FFFFFF",
  danger: "#9A3838",
  soft: "#EDF4F5",
};

export const dark: Theme = {
  name: "Night Harbor",
  background: "#172730",
  surface: "#253943",
  text: "#F1F5F4",
  muted: "#BECED0",
  primary: "#A9D6DD",
  onPrimary: "#172730",
  accent: "#A9D6DD",
  border: "#455962",
  peach: "#F0B8A4",
  paper: "#253943",
  incoming: "#253943",
  outgoing: "#A9D6DD",
  onOutgoing: "#172730",
  danger: "#F0B8A4",
  soft: "#20343E",
};

export const themes = { light, dark };
export const spacing = { small: 8, medium: 16, large: 24, section: 32 };
export const radii = { input: 10, button: 12, card: 12 };
export const typography = {
  display: { fontSize: 36, lineHeight: 43 },
  heading: { fontSize: 28, lineHeight: 35 },
  body: { fontSize: 17, lineHeight: 26 },
  label: { fontSize: 14, lineHeight: 21 },
  writing: { fontSize: 18, lineHeight: 30 },
};
