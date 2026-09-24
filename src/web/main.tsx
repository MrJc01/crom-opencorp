import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./css/app.css";

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} else {
  console.error("Elemento #root não encontrado no DOM");
}
