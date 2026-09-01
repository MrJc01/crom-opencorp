import { describe, it, expect } from "vitest";
import { posicaoMenu } from "../src/web/ui/primitivas.js";

// criarTabs/criarControladorDrawer mexem em DOM — ambiente node do vitest
// não tem jsdom; cobertura dessas vai por e2e quando forem usadas (Etapa 1/3).

describe("primitivas — posicaoMenu (flip nas bordas)", () => {
  const LARGURA = 1280;
  const ALTURA = 800;

  it("abre no ponto clicado quando há espaço", () => {
    const p = posicaoMenu(100, 100, 200, 150, LARGURA, ALTURA);
    expect(p).toEqual({ left: 100, top: 100 });
  });

  it("faz flip para a esquerda quando estoura à direita", () => {
    const p = posicaoMenu(1200, 100, 200, 150, LARGURA, ALTURA);
    expect(p.left).toBe(1200 - 200); // x - larguraMenu
    expect(p.top).toBe(100);
  });

  it("faz flip para cima quando estoura embaixo", () => {
    const p = posicaoMenu(100, 750, 200, 150, LARGURA, ALTURA);
    expect(p.top).toBe(750 - 150); // y - alturaMenu
    expect(p.left).toBe(100);
  });

  it("flip duplo no canto inferior direito", () => {
    const p = posicaoMenu(1270, 790, 200, 150, LARGURA, ALTURA);
    expect(p.left).toBe(1070);
    expect(p.top).toBe(640);
  });

  it("menu maior que a janela fica preso na margem", () => {
    const p = posicaoMenu(400, 400, 2000, 900, LARGURA, ALTURA);
    expect(p.left).toBe(8); // margem padrão
    expect(p.top).toBe(8);
  });

  it("respeita margem customizada", () => {
    // mesmo "cabe exatamente" (x=0), o menu é clampado à margem — nunca toca a borda
    const p = posicaoMenu(0, 0, 100, 100, LARGURA, ALTURA, 20);
    expect(p.left).toBe(20);
    const p2 = posicaoMenu(-50, -50, 100, 100, LARGURA, ALTURA, 20);
    expect(p2.left).toBe(20); // clamp na margem
    expect(p2.top).toBe(20);
  });

  it("aceita clique exatamente na borda (cabe com a margem)", () => {
    const p = posicaoMenu(LARGURA - 200 - 8, 100, 200, 150, LARGURA, ALTURA);
    expect(p.left).toBe(LARGURA - 200 - 8);
  });
});
