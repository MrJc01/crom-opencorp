import { type Page, type APIRequestContext } from "@playwright/test";

export function logado(page: Page, token = "test-e2e", ws = "e2e-corp"): void {
  page.addInitScript(({ t, w }) => {
    window.localStorage.setItem("oc-token", t);
    window.localStorage.setItem("oc-ws", w);
  }, { t: token, w: ws });
}

export function api(page: Page): APIRequestContext {
  return page.request;
}

export async function seederEmpresaBasica(api: APIRequestContext, token: string, wsId = "e2e-corp"): Promise<void> {
  // 1. Criar/obter workspace
  let wsResp = await api.post("/workspaces", {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    data: { id: wsId },
  });
  // Ignora 4xx se já existe
  if (wsResp.status() >= 400) {
    wsResp = await api.get("/workspaces", {
      headers: { authorization: `Bearer ${token}` },
    });
    const workspaces = await wsResp.json();
    const existe = workspaces.find((w: { id: string }) => w.id === wsId);
    if (!existe) throw new Error(`Workspace ${wsId} não pôde ser criado nem encontrado`);
  }

  // 2. Criar 2 tasks (uma backlog, uma feito)
  await api.post("/tasks", {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    data: { titulo: "Task backlog e2e", descricao: "Descrição backlog", coluna: "backlog", prioridade: "media" },
  });
  await api.post("/tasks", {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    data: { titulo: "Task feito e2e", descricao: "Descrição feito", coluna: "feito", prioridade: "alta" },
  });

  // 3. Criar 1 team com pipeline válido
  const teamSpec = {
    id: "e2e-pipe",
    titulo: "Pipe E2E",
    padrao: "pipeline",
    passos: [
      { agente: "a", ordem: "x" },
      { agente: "b", ordem: "y" },
    ],
    criado_em: new Date().toISOString(),
  };
  const teamResp = await api.post("/teams", {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    data: teamSpec,
  });
  if (teamResp.status() >= 400 && teamResp.status() !== 409) {
    const body = await teamResp.text();
    console.warn(`Team creation failed: ${teamResp.status()} ${body}`);
  }

  // 4. Criar app com widget metrica
  const appSpec = {
    id: "painel-tarefas",
    titulo: "Painel de Tarefas",
    paginas: [
      {
        titulo: "Visão",
        widgets: [
          { id: "m1", tipo: "metrica", titulo: "Tasks", fonte: { rota: "/tasks" } },
        ],
      },
    ],
  };
  const appResp = await api.post("/apps", {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    data: appSpec,
  });
  if (appResp.status() >= 400 && appResp.status() !== 409) {
    const body = await appResp.text();
    console.warn(`App creation failed: ${appResp.status()} ${body}`);
  }

  // 5. Criar job/agenda no workspace
  await api.post("/schedules", {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    data: {
      nome: "job-e2e-corp",
      agenda_tipo: "intervalo_min",
      agenda_valor: 60,
      args: "echo hello",
      workspace: wsId,
    },
  });
}

export async function esperarNavegacao(page: Page, hash: string): Promise<void> {
  await page.goto(`/#/${hash}`);
  // Aguarda a URL mudar (hash routing)
  await page.waitForURL(`**/#/${hash}`);
  // Aguarda a view ter conteúdo (não vazia) - espera renderização assíncrona
  await page.waitForFunction(
    (h) => {
      const view = document.getElementById(`view-${h}`);
      return view && view.innerHTML.trim().length > 0;
    },
    hash,
    { timeout: 15000 }
  );
  // Pequeno delay extra para renders async
  await page.waitForTimeout(300);
}

export async function esperarElementoTexto(page: Page, texto: string, timeout = 10000): Promise<void> {
  await page.getByText(texto, { exact: false }).first().waitFor({ state: "visible", timeout });
}

export async function preencherEEnviar(page: Page, seletor: string, texto: string): Promise<void> {
  await page.fill(seletor, texto);
  await page.press(seletor, "Enter");
}