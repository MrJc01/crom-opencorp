/**
 * Manifesto de artefatos aprovados para instalação gerenciada (D3).
 *
 * Toda entrada exige versão fixada, URL de origem oficial e SHA-256 publicado
 * pelo fornecedor ou pela plataforma de distribuição. Os digests abaixo são os
 * que o GitHub publica para cada asset de release (`digest` da API de
 * releases), conferidos em 26/09/2026. A estrutura interna de cada arquivo foi
 * conferida para linux-x64; nas demais plataformas o instalador valida o
 * membro esperado antes de extrair e aborta se ele não existir.
 *
 * Motores sem entrada aqui aparecem como "instalação gerenciada não suportada".
 * Nunca adicione uma entrada com checksum calculado localmente ou sem fonte.
 */

export type EnginePlatform = "linux-x64" | "linux-arm64" | "darwin-x64" | "darwin-arm64";

export interface ApprovedArtifact {
  engineId: string;
  version: string;
  platform: EnginePlatform;
  url: string;
  sha256: string;
  sizeBytes: number;
  format: "tar.gz";
  /** Caminho do executável dentro do arquivo. */
  member: string;
  /** Nome com que o executável é instalado em `<versão>/bin/`. */
  binaryName: string;
  /** Proveniência legível, registrada no manifesto da instalação. */
  source: string;
}

const CODEX_TAG = "rust-v0.157.1";
const codex = (platform: EnginePlatform, triple: string, sha256: string, sizeBytes: number): ApprovedArtifact => ({
  engineId: "codex",
  version: "0.157.1",
  platform,
  url: `https://github.com/openai/codex/releases/download/${CODEX_TAG}/codex-${triple}.tar.gz`,
  sha256,
  sizeBytes,
  format: "tar.gz",
  member: `codex-${triple}`,
  binaryName: "codex",
  source: `GitHub release openai/codex ${CODEX_TAG} (digest SHA-256 publicado pelo GitHub)`,
});

const OPENCODE_TAG = "v1.18.32";
const opencode = (platform: EnginePlatform, asset: string, sha256: string, sizeBytes: number): ApprovedArtifact => ({
  engineId: "opencode",
  version: "1.18.32",
  platform,
  url: `https://github.com/sst/opencode/releases/download/${OPENCODE_TAG}/${asset}`,
  sha256,
  sizeBytes,
  format: "tar.gz",
  member: "opencode",
  binaryName: "opencode",
  source: `GitHub release sst/opencode ${OPENCODE_TAG} (digest SHA-256 publicado pelo GitHub)`,
});

export const APPROVED_ARTIFACTS: readonly ApprovedArtifact[] = Object.freeze([
  codex("linux-x64", "x86_64-unknown-linux-musl", "e98c1e8e028e8137fa2d2415c82ec58e7b3701a627e3554aace5b3ca31454af2", 107_868_387),
  codex("linux-arm64", "aarch64-unknown-linux-musl", "4c6b1c17c1c5fd0d4fb2951b7481867b95ea732b1feab269c98588b15db16253", 100_264_936),
  codex("darwin-x64", "x86_64-apple-darwin", "281a9b806b5f62b70d1e2b65101bda369095f2f72fa1231b8e0410f7901c9a20", 103_098_349),
  codex("darwin-arm64", "aarch64-apple-darwin", "3c45b162b7a76f51325015b1d0a8112c73219b7a9b59cd5762c37c9ba55894fa", 94_721_758),
  opencode("linux-x64", "opencode-linux-x64.tar.gz", "3046e0404fdc60fb80307e7a47824ba07477364178a4d09baa8548496dd6d43b", 60_608_353),
  opencode("linux-arm64", "opencode-linux-arm64.tar.gz", "568461b7d4d8c19865c97e9a1102e613049c6039d01fe772154de873c1865840", 60_418_875),
]);

/** Instrução oficial de instalação manual para motores sem artefato aprovado. */
export const MANUAL_INSTALL_INSTRUCTIONS: Readonly<Record<string, string>> = Object.freeze({
  "claude-code": "Instale pelo método oficial da Anthropic (https://docs.anthropic.com/en/docs/claude-code) e, se necessário, informe o caminho em settings.engines[\"claude-code\"].binary_path.",
  cursor: "Instale o Cursor Agent CLI pelo método oficial (https://cursor.com/cli).",
  copilot: "Instale o GitHub Copilot CLI pelo método oficial (https://docs.github.com/copilot).",
  antigravity: "Instale o Antigravity (agy) pelo método oficial do Google.",
  aider: "Instale o Aider pelo método oficial (https://aider.chat).",
  mimo: "Instale o Xiaomi MiMo Code pelo método oficial (https://mimo.xiaomi.com).",
  "crom-agente": "Compile o crom-agente a partir do repositório e informe o caminho em settings.engines[\"crom-agente\"].binary_path.",
  codex: "Instale o Codex CLI pelo método oficial (https://developers.openai.com/codex).",
  opencode: "Instale o OpenCode pelo método oficial (https://opencode.ai).",
});

export function currentPlatform(): EnginePlatform | undefined {
  const os = process.platform === "linux" ? "linux" : process.platform === "darwin" ? "darwin" : undefined;
  const arch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : undefined;
  return os && arch ? (`${os}-${arch}` as EnginePlatform) : undefined;
}

export function findApprovedArtifact(
  engineId: string,
  platform: EnginePlatform | undefined = currentPlatform(),
  manifest: readonly ApprovedArtifact[] = APPROVED_ARTIFACTS
): ApprovedArtifact | undefined {
  if (!platform) return undefined;
  return manifest.find((a) => a.engineId === engineId && a.platform === platform);
}
