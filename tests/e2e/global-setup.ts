import { rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const E2E_HOME = "/tmp/opencorp-e2e";

export default async function globalSetup(): Promise<void> {
  await rm(E2E_HOME, { recursive: true, force: true });
  await mkdir(E2E_HOME, { recursive: true });
  await mkdir(join(E2E_HOME, "logs"), { recursive: true });
  await mkdir(join(E2E_HOME, "workspaces"), { recursive: true });

  // Criar workspace e2e-corp
  const wsDir = join(E2E_HOME, "workspaces", "e2e-corp");
  await mkdir(wsDir, { recursive: true });
  await mkdir(join(wsDir, ".opencorp"), { recursive: true });
  await writeFile(join(wsDir, ".opencorp", "config.json"), "{}");

  // Criar workspace outo-ws para testes de alternância
  const wsDir2 = join(E2E_HOME, "workspaces", "outro-ws");
  await mkdir(wsDir2, { recursive: true });
  await mkdir(join(wsDir2, ".opencorp"), { recursive: true });
  await writeFile(join(wsDir2, ".opencorp", "config.json"), "{}");

  // Registrar workspaces no arquivo de workspaces ativos
  const workspacesConfig = {
    version: 1,
    ativo: "e2e-corp",
    workspaces: [
      { id: "e2e-corp", criado_em: new Date().toISOString() },
      { id: "outro-ws", criado_em: new Date().toISOString() },
    ],
  };
  await mkdir(join(E2E_HOME, ".opencorp"), { recursive: true });
  await writeFile(join(E2E_HOME, ".opencorp", "workspaces.json"), JSON.stringify(workspacesConfig, null, 2));
}