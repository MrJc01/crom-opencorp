import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface EventoTeste {
  ts: string;
  execid: string;
  etapa: string;
  slug: string;
  fase: string;
  modelo: string;
  tentativa: number;
  dur_ms?: number;
  exit?: number | null;
  timed_out?: boolean;
  fail_cat?: string;
  modelo_anterior?: string;
  veredito?: string;
}

export async function appendEvent(caminhoArquivo: string, evento: EventoTeste): Promise<void> {
  await mkdir(dirname(caminhoArquivo), { recursive: true });
  await appendFile(caminhoArquivo, `${JSON.stringify(evento)}\n`, "utf8");
}
