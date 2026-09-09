#!/usr/bin/env node
/**
 * Gerenciador de Túnel Público Zero-Conta (TryCloudflare Quick Tunnel)
 * Expõe o OpenCorp (porta 4100) para a internet mundial de forma segura e anônima.
 * NÃO EXIGE LOGIN, NÃO EXIGE EMAIL, NÃO EXIGE CARTÃO NEM TOKEN.
 */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const porta = process.env.OPENCORP_PORT || "4100";
const targetUrl = `http://127.0.0.1:${porta}`;

console.log("==================================================================");
console.log("      INICIANDO TÚNEL PÚBLICO ZERO-CONTA (TRYCLOUDFLARE)          ");
console.log("==================================================================");
console.log(`Alvo local: ${targetUrl}`);

// 1. Verificar se cloudflared está disponível no PATH ou em ~/.opencorp/bin/cloudflared
const binLocal = path.join(process.env.HOME || "/home/j", ".opencorp", "bin", "cloudflared");
let cmdBin = "cloudflared";

if (fs.existsSync(binLocal)) {
  cmdBin = binLocal;
} else {
  try {
    execSync("cloudflared --version", { stdio: "ignore" });
  } catch {
    cmdBin = null;
  }
}

if (!cmdBin) {
  console.log("\n[AVISO]: Binário 'cloudflared' não encontrado localmente.");
  console.log("Para instalar o Quick Tunnel sem conta no Linux:");
  console.log("  curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && sudo dpkg -i cloudflared.deb");
  console.log("\nAlternativa zero-configuração via SSH Serveo/Pinggy:");
  console.log(`  ssh -R 80:localhost:${porta} serveo.net`);
  console.log("==================================================================");
  process.exit(0);
}

console.log(`Usando binário: ${cmdBin}`);
console.log("Conectando à rede global da Cloudflare (Modo Anônimo / Quick Tunnel)...");
const child = spawn(cmdBin, ["tunnel", "--url", targetUrl], {
  stdio: ["ignore", "pipe", "pipe"],
});

let urlDetectada = null;

const processarLinha = (data) => {
  const texto = data.toString();
  const match = texto.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (match && !urlDetectada) {
    urlDetectada = match[0];
    console.log("\n==================================================================");
    console.log("🎉 TÚNEL PÚBLICO ATIVO COM SUCESSO (ZERO CONTAS / ZERO CADASTRO)!");
    console.log("==================================================================");
    console.log(`🔗 URL Pública Mundial: \x1b[32m\x1b[1m${urlDetectada}\x1b[0m`);
    console.log(`📱 Acesso aos Mini-Apps: \x1b[36m${urlDetectada}/apps\x1b[0m`);
    console.log(`📊 Painel do OpenCorp:  \x1b[36m${urlDetectada}\x1b[0m`);
    console.log("==================================================================");
    console.log("Pressione Ctrl+C para encerrar o túnel.");

    try {
      const statePath = path.join(process.cwd(), ".opencorp", "tunnel_url.txt");
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, urlDetectada);
    } catch {}
  }
};

child.stdout.on("data", processarLinha);
child.stderr.on("data", processarLinha);

child.on("close", (code) => {
  console.log(`Túnel finalizado com código ${code}`);
});
