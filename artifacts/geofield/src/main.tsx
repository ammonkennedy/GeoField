import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App";
import "./index.css";

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add("native-app", `native-${Capacitor.getPlatform()}`);
}

createRoot(document.getElementById("root")!).render(<App />);
