
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { markPhoneView } from "./app/shell/PhoneView";

  markPhoneView();

  createRoot(document.getElementById("root")!).render(<App />);
  