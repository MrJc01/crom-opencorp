import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { logado, seederEmpresaBasica, api, esperarElementoTexto } from "./helpers.js";

/** Reuniões: convocar pela UI + API, sala semeada no histórico e agendamento via scheduler. */
test.describe("Reuniões (sala + histórico + agendamento)", () => {
  const sufixo = Date.now().toString(36);
  const HDR = { authorization: "Bearer test-e2e", "content-type": "application/json" };

  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarElementoTexto(page, "Painel de Operações");
  });

  test("(a) Convocar pela UI abre a sala; POST /meetings responde 202 com id", async ({ page }) => {
    const pauta = `Pauta v2 e2e-${sufixo}`;
    await page.goto("/reunioes");
    await page.locator('button[title="Convocar nova reunião"]').click();
    await page.locator('textarea[placeholder="Ex: Alinhar lançamento da nova home e definir responsabilidade de cada agente..."]').fill(pauta);
    await page.getByRole("button", { name: "Abrir Sala de Chat" }).click();

    await page.waitForURL("**/reunioes?reuniao=*", { timeout: 15000 });
    await expect(page.getByText(pauta).first()).toBeVisible({ timeout: 15000 });

    const resp = await api(page).post("/meetings?workspace=e2e-corp", {
      headers: HDR,
      data: { pauta: `Pauta v2 API e2e-${sufixo}` },
    });
    expect(resp.status()).toBe(202);
    const corpo = await resp.json();
    expect(corpo.status).toBe("iniciado");
    expect(String(corpo.id)).toMatch(/^reuniao-/);
  });

  test("(b) Sala semeada aparece no histórico e abre pelo modal", async ({ page }) => {
    const salaId = "reuniao-e2e-viva";
    const dir = join("/tmp/opencorp-e2e", ".opencorp", "workspaces", "e2e-corp", ".opencorp", "registries", "chats", salaId);
    await mkdir(dir, { recursive: true });
    const meta = {
      id: salaId,
      categoria: "chats",
      descricao: "Reunião: pauta da sala viva e2e",
      criado_por: "opencorp",
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
      permissoes: { leitura: ["*"], escrita: ["opencorp"], modificacao_meta: [] },
      tags: ["reuniao"],
      referencias: [],
      extras: {
        tipo: "reuniao",
        pauta: "pauta da sala viva e2e",
        participantes: ["ag-alice", "ag-beto"],
        status: "em-andamento",
      },
    };
    await writeFile(join(dir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
    await writeFile(join(dir, "conteudo.md"), `# Reunião ${salaId}\n\n- Pauta: pauta da sala viva e2e\n`, "utf8");

    const lista = await api(page).get("/meetings?workspace=e2e-corp", { headers: HDR });
    expect(lista.status()).toBe(200);
    const salas = await lista.json();
    expect(salas.some((s: any) => s.id === salaId)).toBe(true);

    await page.goto("/reunioes");
    await page.getByRole("button", { name: /Reuniões \(\d+\)/ }).click();
    await esperarElementoTexto(page, "Histórico de Reuniões da Empresa");
    await expect(page.getByText("pauta da sala viva e2e").first()).toBeVisible({ timeout: 10000 });
    await page.getByText("pauta da sala viva e2e").first().click();
    await page.waitForURL(`**/reunioes?reuniao=${salaId}`, { timeout: 10000 });
  });

  test("(c) Agendar reunião cria job meeting + excluir remove", async ({ page }) => {
    const pauta = `revisao agendada e2e-${sufixo}`;
    const criado = await api(page).post("/schedules", {
      headers: HDR,
      data: {
        nome: `reuniao-agendada-${sufixo}`,
        agenda_tipo: "intervalo_min",
        agenda_valor: 1440,
        args: `meeting iniciar --pauta "${pauta}" --nao-interativo`,
        workspace: "e2e-corp",
      },
    });
    expect(criado.status()).toBe(201);
    const job = await criado.json();

    const resp = await api(page).get("/schedules?workspace=e2e-corp", { headers: HDR });
    const jobs = (await resp.json()) as Array<{ id: string; args: string[] }>;
    const rotina = jobs.find((j) => j.id === job.id);
    expect(rotina).toBeTruthy();
    expect(rotina!.args[0]).toBe("meeting");
    expect(rotina!.args.join(" ")).toContain(pauta);

    // aparece na Home (aba Agendamentos → Linha do Tempo)
    await page.goto("/?aba=agendamentos");
    await esperarElementoTexto(page, "Linha do Tempo de Agendamentos");

    const del = await api(page).delete(`/schedules/${job.id}`, { headers: HDR });
    expect(del.status()).toBe(200);
    const depois = (await (await api(page).get("/schedules?workspace=e2e-corp", { headers: HDR })).json()) as Array<{ id: string }>;
    expect(depois.some((j) => j.id === job.id)).toBe(false);
  });
});
