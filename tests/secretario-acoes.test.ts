import { describe, expect, it } from "vitest";
import { extrairAcoesMensagens, type MensagemOc } from "../src/core/opencode-server.js";

/** Extrai tool calls das mensagens assistant NOVAS (após baseline) — mantém contagem,
 *  nome da tool, status e resumo do primeiro campo string do input. */

function msg(role: string, id: string, parts: MensagemOc["parts"], completed = true): MensagemOc {
  return { info: { id, role, time: { created: 1, completed: completed ? 2 : undefined } }, parts };
}

describe("extrairAcoesMensagens", () => {
  it("extrai tool parts com status e resumo do input", () => {
    const msgs: MensagemOc[] = [
      msg("user", "u1", [{ type: "text", text: "crie uma task" }]),
      msg("assistant", "a1", [
        { type: "tool", tool: "opencorp_task_create", state: { status: "completed", input: { titulo: "Comprar café" } } },
        { type: "text", text: "Task criada" },
      ]),
    ];
    const r = extrairAcoesMensagens(msgs, null);
    expect(r.total).toBe(1);
    expect(r.itens).toEqual([{ tool: "opencorp_task_create", status: "completed", resumo: "Comprar café" }]);
  });

  it("ignora mensagens anteriores ao baseline (continuação de sessão não re-streama)", () => {
    const msgs: MensagemOc[] = [
      msg("assistant", "a-antiga", [{ type: "tool", tool: "opencorp_task_list", state: { status: "completed" } }]),
      msg("user", "u2", [{ type: "text", text: "e agora?" }]),
      msg("assistant", "a-nova", [{ type: "tool", tool: "opencorp_task_create", state: { status: "running", input: { titulo: "Nova" } } }]),
    ];
    const r = extrairAcoesMensagens(msgs, "a-antiga");
    expect(r.total).toBe(1);
    expect(r.itens).toEqual([{ tool: "opencorp_task_create", status: "running", resumo: "Nova" }]);
  });

  it("mensagem assistant sem parts (stream morto) conta mas não gera item; resumo cai no title", () => {
    const msgs: MensagemOc[] = [
      msg("assistant", "a-vazia", []),
      msg("assistant", "a2", [{ type: "tool", tool: "opencorp_wp_publicar", state: { status: "pending", title: "Post 35" } }], false),
    ];
    const r = extrairAcoesMensagens(msgs, null);
    expect(r.total).toBe(2);
    expect(r.itens).toEqual([{ tool: "opencorp_wp_publicar", status: "pending", resumo: "Post 35" }]);
  });

  it("resumo aceita arrays de string e limita itens (cap)", () => {
    const partes = Array.from({ length: 20 }, (_, i) => ({
      type: "tool",
      tool: `tool_${i}`,
      state: { status: "completed", input: { comandos: [`cmd ${i}`] } },
    }));
    const msgs: MensagemOc[] = [msg("assistant", "a", partes)];
    const r = extrairAcoesMensagens(msgs, null);
    expect(r.itens.length).toBe(12);
    expect(r.itens[0]).toEqual({ tool: "tool_0", status: "completed", resumo: "cmd 0" });
  });
});
