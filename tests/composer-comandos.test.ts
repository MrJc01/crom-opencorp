import { describe, expect, it } from "vitest";
import { parsearComposer, COMANDOS_OPCORP } from "../src/web/composer-comandos.js";

describe("composer-comandos — parsearComposer", () => {
  it("/status simples vira comando sem args", () => {
    const r = parsearComposer("/status");
    expect(r.comando).toEqual({ nome: "status", args: "" });
    expect(r.terminal).toBeUndefined();
    expect(r.contexto).toEqual([]);
    expect(r.textoLimpo).toBe("/status");
  });

  it("/tasks com argumentos preserva o resto como args", () => {
    const r = parsearComposer("/tasks extra args");
    expect(r.comando).toEqual({ nome: "tasks", args: "extra args" });
    expect(r.textoLimpo).toBe("/tasks extra args");
  });

  it("!tasks list vira terminal com comando bruto", () => {
    const r = parsearComposer("!tasks list");
    expect(r.terminal).toEqual({ comando: "tasks list" });
    expect(r.comando).toBeUndefined();
    expect(r.textoLimpo).toBe("!tasks list");
  });

  it("@arquivo.md no meio vira contexto e sai do textoLimpo", () => {
    const r = parsearComposer("veja @arquivo.md depois");
    expect(r.contexto).toEqual(["arquivo.md"]);
    expect(r.comando).toBeUndefined();
    expect(r.textoLimpo).toBe("veja depois");
  });

  it("múltiplos @ coletam todos (sem duplicatas, ordem de aparição)", () => {
    const r = parsearComposer("revisar @um e @dois e @um de novo");
    expect(r.contexto).toEqual(["um", "dois"]);
    expect(r.textoLimpo).toBe("revisar e e de novo");
  });

  it("/comando + @ no mesmo texto: comando mantém texto original, textoLimpo limpa o @", () => {
    const r = parsearComposer("/status @x.md");
    expect(r.comando).toEqual({ nome: "status", args: "@x.md" });
    expect(r.contexto).toEqual(["x.md"]);
    expect(r.textoLimpo).toBe("/status");
  });

  it("texto sem token não produz comando/terminal/contexto", () => {
    const r = parsearComposer("olá mundo");
    expect(r.comando).toBeUndefined();
    expect(r.terminal).toBeUndefined();
    expect(r.contexto).toEqual([]);
    expect(r.textoLimpo).toBe("olá mundo");
  });

  it("@ no início do texto também é capturado", () => {
    const r = parsearComposer("@ceo-analista resuma");
    expect(r.contexto).toEqual(["ceo-analista"]);
    expect(r.textoLimpo).toBe("resuma");
  });

  it("barra ou exclamação sozinhas não viram token", () => {
    expect(parsearComposer("/").comando).toBeUndefined();
    expect(parsearComposer("!").terminal).toBeUndefined();
    expect(parsearComposer("email@solto").contexto).toEqual([]);
  });

  it("COMANDOS_OPCORP tem os 7 comandos próprios", () => {
    const nomes = COMANDOS_OPCORP.map((c) => c.nome);
    expect(nomes).toEqual(["status", "tasks", "custos", "fluxos", "agenda", "agentes", "limpar"]);
    for (const c of COMANDOS_OPCORP) {
      expect(c.descricao.length).toBeGreaterThan(0);
      expect(c.exemplo).toBe("/" + c.nome);
    }
  });
});
