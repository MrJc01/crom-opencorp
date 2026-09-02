import { render } from "solid-js/web";
import { App } from "./App";
import "./css/app.css";

const root = document.getElementById("root");

if (root) {
  render(() => <App />, root);
} else {
  console.error("Elemento #root não encontrado no DOM");
}
