import type { Command } from "commander";
import { runDoctor, type CheckStatus } from "../../core/doctor.js";
import { opencorpHome } from "../../utils/paths.js";

const ICONES: Record<CheckStatus, string> = {
  ok: "✔",
  fail: "✖",
  warn: "⚠",
  info: "ℹ",
};

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description(
      "diagnóstico do ambiente: node, opencode no PATH, settings global, escrita e segredos",
    )
    .option("--json", "imprime o resultado em JSON (machine-readable)")
    .action(async (opts: { json?: boolean }) => {
      const resultado = await runDoctor({ homeDir: opencorpHome() });
      if (opts.json) {
        console.log(JSON.stringify(resultado, null, 2));
      } else {
        console.log("opencorp doctor — diagnóstico do ambiente\n");
        for (const check of resultado.checks) {
          console.log(` ${ICONES[check.status]} ${check.label}${check.detail ? ` — ${check.detail}` : ""}`);
          for (const item of check.items ?? []) {
            console.log(`     - ${item}`);
          }
        }
        const oks = resultado.checks.filter((c) => c.status === "ok").length;
        const falhas = resultado.checks.filter((c) => c.status === "fail").length;
        const alertas = resultado.checks.filter((c) => c.status === "warn").length;
        const infos = resultado.checks.filter((c) => c.status === "info").length;
        const resumo = `resultado: ${resultado.ok ? "OK" : "COM PROBLEMAS"} — ${oks} ok, ${falhas} falha(s), ${alertas} alerta(s), ${infos} info`;
        console.log(`\n${resumo}`);
      }
      process.exitCode = resultado.exitCode;
    });
}
