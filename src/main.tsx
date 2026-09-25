import { createRoot } from "react-dom/client";
import App from "./App";
import { loadData } from "./store";
import "./styles.css";

loadData().then(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
