import { createRoot } from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App";
// IMPORTANT: This import is required to load Tailwind CSS and your layout details
import "./index.css"; 

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

if (!clientId) {
  console.error("Missing VITE_GOOGLE_CLIENT_ID environment variable");
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

createRoot(rootElement).render(
  <GoogleOAuthProvider clientId={clientId || ""}>
    <App />
  </GoogleOAuthProvider>
);
