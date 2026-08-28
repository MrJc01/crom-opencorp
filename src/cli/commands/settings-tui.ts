import * as p from "@clack/prompts";
import { SettingsError, SettingsStore, formatarValor, parseValor } from "../../core/settings-store.js";

interface Secao {
  id: string;
  label: string;
  hint: string;
  chaves: string[];
}

const SECOES: Secao[] = [
  {
    id: "modelos",
    label: "Modelos",
    hint: "padrão, teste cego, secretário",
    chaves: ["default_model", "test_model", "secretary.agent"],
  },
  {
    id: "orcamento",
    label: "Orçamento",
    hint: "teto diário, por agente, comportamento",
    chaves: ["budget.daily_usd", "budget.per_agent_usd", "budget.pause_on_exceed", "budget.notify_registry"],
  },
  {
    id: "seguranca",
    label: "Segurança",
    hint: "nível, blocklist, HITL, rede",
    chaves: [
      "security.level",
      "security.blocklist",
      "security.hitl_patterns",
      "security.network_allowlist",
    ],
  },
  {
    id: "workspaces",
    label: "Workspaces",
    hint: "raiz dos workspaces",
    chaves: ["paths.workspaces_root"],
  },
  {
    id: "nuvem",
    label: "Nuvem",
    hint: "backup/sync (ver docs/11)",
    chaves: ["cloud.enabled", "cloud.mode", "cloud.targets"],
  },
  {
    id: "testes",
    label: "Testes",
    hint: "modelo cego, diretório de relatórios",
    chaves: ["tests.blind", "tests.model", "tests.reports_dir", "tests.max_fix_cycles"],
  },
  {
    id: "avancado",
    label: "Avançado",
    hint: "tema, verbose, versão",
    chaves: ["ui.theme", "ui.verbose", "version"],
  },
];

export async function abrirPainelSettings(store: SettingsStore): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("erro: o painel de configurações é interativo e precisa de um terminal (TTY).");
    console.error(
      'Use os subcomandos não-interativos: opencorp settings list | get | set | edit | path | reset.',
    );
    process.exitCode = 1;
    return;
  }

  let base: Map<string, unknown>;
  try {
    const entradas = await store.list({ scope: "global" });
    base = new Map(entradas.map((e) => [e.chave, e.valor]));
  } catch (erro) {
    if (erro instanceof SettingsError) {
      console.error(`erro: ${erro.message}`);
      process.exitCode = erro.exitCode;
      return;
    }
    throw erro;
  }

  const pendentes = new Map<string, string>();
  const valorAtual = (chave: string): unknown => {
    const bruto = pendentes.get(chave);
    return bruto === undefined ? base.get(chave) : parseValor(bruto);
  };

  p.intro("opencorp — configurações (global)");

  let aberto = true;
  let salvo = false;
  while (aberto) {
    const escolha = await p.select({
      message:
        pendentes.size > 0
          ? `Seções (${pendentes.size} alteração(ões) não salva(s))`
          : "Seções",
      options: [
        ...SECOES.map((s) => ({ value: `secao:${s.id}`, label: s.label, hint: s.hint })),
        { value: "salvar", label: "S — salvar alterações", hint: "grava ~/.opencorp/settings.json" },
        {
          value: "sair",
          label: "Q — sair",
          hint: pendentes.size > 0 ? "descarta alterações não salvas" : undefined,
        },
      ],
    });

    if (p.isCancel(escolha)) break;

    if (escolha === "sair") {
      aberto = false;
      continue;
    }

    if (escolha === "salvar") {
      let ok = true;
      for (const [chave, bruto] of pendentes) {
        try {
          await store.set(chave, bruto, { scope: "global" });
          p.log.success(`${chave} salvo`);
        } catch (erro) {
          ok = false;
          if (erro instanceof SettingsError) {
            p.log.error(erro.message);
          } else {
            p.log.error(String(erro));
          }
          break;
        }
      }
      if (ok && pendentes.size > 0) {
        salvo = true;
        pendentes.clear();
      }
      aberto = false;
      continue;
    }

    const secao = SECOES.find((s) => `secao:${s.id}` === escolha);
    if (!secao) continue;

    const chave = await p.select({
      message: `${secao.label} — escolha a chave`,
      options: secao.chaves.map((c) => ({ value: c, label: c, hint: formatarValor(valorAtual(c)) })),
    });
    if (p.isCancel(chave)) continue;

    const atual = valorAtual(chave);
    const resposta = await p.text({
      message: `novo valor para ${chave}`,
      initialValue: typeof atual === "string" ? atual : JSON.stringify(atual),
      placeholder: typeof atual === "string" ? atual : JSON.stringify(atual),
    });
    if (p.isCancel(resposta) || typeof resposta !== "string") continue;

    pendentes.set(chave, resposta);
    p.log.step(`${chave} ← ${resposta} (pendente — S para salvar)`);
  }

  if (salvo) {
    p.outro("configurações salvas em ~/.opencorp/settings.json");
  } else if (pendentes.size > 0) {
    p.outro("saída sem salvar — alterações descartadas");
  } else {
    p.outro("até mais");
  }
}
