/**
 * View App Detail — Detalhe de mini-app via hash #/app/:id
 */

import { abrirApp } from "./apps.js";

/** Renderiza view de detalhe do app (hash #/app/:id) */
export async function renderAppDetail(): Promise<void> {
  const hash = window.location.hash;
  const id = hash.split('/')[1];
  if (!id) {
    const { navegar } = await import("../router.js");
    navegar('apps');
    return;
  }
  await abrirApp(decodeURIComponent(id));
}