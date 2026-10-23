
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { BRAND_NAME } from "./app/brand";

  document.title = BRAND_NAME;

  createRoot(document.getElementById("root")!).render(<App />);
  