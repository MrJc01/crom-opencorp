/**
 * globalTeardown do Playwright — mata fixtures fake-opencode sobreviventes.
 * (Etapa 7.4 do PLANO-CONSOLIDACAO: fim do vazamento de processos de teste.)
 */
import { execSync } from "node:child_process";

const MEU_PID = process.pid;

export default function globalTeardown(): void {
  try {
    const saida = execSync("ps -eo pid,args", { encoding: "utf8" });
    for (const linha of saida.split("\n")) {
      const m = /^\s*(\d+)\s+(.*)$/.exec(linha);
      if (!m) continue;
      const pid = Number(m[1]);
      const args = m[2] ?? "";
      if (!args.includes("fake-opencode.mjs")) continue;
      if (pid === MEU_PID || args.includes("ps -eo")) continue;
      try {
        process.kill(pid, "SIGTERM");
        console.log(`[teardown] fixture fake-opencode (pid ${pid}) encerrada`);
      } catch {
        /* já morreu */
      }
    }
  } catch {
    /* sem ps disponível — best-effort */
  }
}
