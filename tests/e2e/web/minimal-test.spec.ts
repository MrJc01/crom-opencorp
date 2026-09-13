import { test, expect } from "@playwright/test";
import { logado, api } from "../helpers.js";

const TOKEN = "test-e2e";
const WS = "e2e-flux-join";  // Use existing workspace name
const HDR = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

test("minimal flow creation - just manual", async ({ page }) => {
  logado(page, TOKEN, WS);
  // First, ensure workspace exists
  await api(page).post("/workspaces", {
    headers: HDR,
    data: { id: WS },
  }).catch(() => undefined);
  
  const resCriar = await api(page).post(`/flows?workspace=${WS}`, {
    headers: HDR,
    data: {
      id: `flow-minimal-${Date.now().toString(36)}`,
      nome: "Minimal Flow",
      nos: [
        { id: "inicio", tipo: "manual", config: {} },
      ],
      arestas: [],
    },
  });
  console.log("Status:", resCriar.status());
  expect(resCriar.status()).toBe(201);
});
