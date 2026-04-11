import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/pdf-overlay-fonts.css";
import "./styles/glassmorphism.css";

createRoot(document.getElementById("root")!).render(<App />);
