import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CanalError,
  CanalNotificacao,
  RegistroDeCanais,
  type Canal,
  type MensagemCanal,
  type Poster,
} from "../src/core/canal.js";

function canalFake(id: string, tipo: Canal["tipo"]): Canal {
  const enviadas: MensagemCanal[] = [];
  return {
    id,
    tipo,
    async enviar(msg) {
      enviadas.push(msg);
    },
  };
}

/** Etapa 10 (P-11 / ADR-0001) — esqueleto de canais de integração */
describe("core/canal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("RegistroDeCanais — registrar/listar/obter/porTipo", () => {
    const registro = new RegistroDeCanais();
    const zap = canalFake("zap-1", "whatsapp");
    const tg = canalFake("tg-1", "telegram");
    registro.registrar(zap);
    registro.registrar(tg);

    expect(registro.listar().map((c) => c.id)).toEqual(["tg-1", "zap-1"]); // ordenado por id
    expect(registro.obter("zap-1")).toBe(zap);
    expect(registro.obter("inexistente")).toBeUndefined();
    expect(registro.porTipo("telegram")).toHaveLength(1);
    expect(registro.porTipo("email")).toHaveLength(0);

    // mesmo id sobrescreve (registrar é idempotente)
    const zap2 = canalFake("zap-1", "whatsapp");
    registro.registrar(zap2);
    expect(registro.listar()).toHaveLength(2);
    expect(registro.obter("zap-1")).toBe(zap2);

    expect(() => registro.registrar({ id: "", tipo: "email", enviar: async () => {} })).toThrow(CanalError);
  });

  it("CanalNotificacao envia via poster injetado (POST /notifications?workspace=...)", async () => {
    const chamadas: Array<{ caminho: string; corpo: any; headers: Record<string, string> }> = [];
    const poster: Poster = async (caminho, corpo, headers) => {
      chamadas.push({ caminho, corpo, headers });
    };
    const canal = new CanalNotificacao("whatsapp", {
      workspace: "acorp",
      token: "tok",
      poster,
    });

    await canal.enviar({ para: "5511999990001", texto: "Task concluída" });

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].caminho).toBe(`/notifications?workspace=${encodeURIComponent("acorp")}`);
    expect(chamadas[0].corpo.corpo).toBe("Task concluída");
    expect(chamadas[0].corpo.tipo).toBe("aviso");
    expect(chamadas[0].corpo.origem).toBe("canal:whatsapp");
    expect(chamadas[0].corpo.canal).toBe("whatsapp");
    expect(chamadas[0].corpo.titulo).toContain("[whatsapp]");
    expect(chamadas[0].headers.authorization).toBe("Bearer tok");
  });

  it("CanalNotificacao valida mensagem (para/texto obrigatórios)", async () => {
    const canal = new CanalNotificacao("telegram", { poster: async () => {} });
    await expect(canal.enviar({ para: "", texto: "oi" })).rejects.toBeInstanceOf(CanalError);
    await expect(canal.enviar({ para: "123", texto: "  " })).rejects.toThrow(/texto/);
  });

  it("CanalNotificacao sem poster usa fetch contra o server (baseUrl + Bearer)", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const canal = new CanalNotificacao("telegram", {
      id: "tg-ops",
      baseUrl: "http://127.0.0.1:4999/",
      token: "abc",
      workspace: "ws 2",
    });
    await canal.enviar({ para: "-100123", texto: "orçamento em 80%" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://127.0.0.1:4999/notifications?workspace=${encodeURIComponent("ws 2")}`);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer abc");
    expect(headers["content-type"]).toBe("application/json");

    // erro HTTP vira CanalError com status
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const canalErro = new CanalNotificacao("telegram", { poster: undefined });
    await expect(canalErro.enviar({ para: "1", texto: "x" })).rejects.toMatchObject({ status: 500 });
  });
});
