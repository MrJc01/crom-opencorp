#!/bin/bash
# Instala o pacote de 4 linhas de pensamento padrão de empresa em um workspace.
# Uso: bash scripts/instalar-linhas-padrao.sh [workspace]

WS="${1:-pulso-diario}"
CLI="node bin/opencorp.mjs"
export OPENCORP_HOME=/home/j

set -e

# ─── 1. ceo-analise-board: CEO lê o board, prioriza e cria tasks de gestão ───
$CLI flow create --workspace "$WS" ceo-analise-board --nome "CEO: análise do board e priorização" > /dev/null
python3 - "$WS" << 'EOF'
import json, sys
from pathlib import Path
ws = sys.argv[1]
p = Path.home() / ".opencorp" / "workspaces" / ws / ".opencorp" / "flows" / "ceo-analise-board.json"
p.write_text(json.dumps({
  "id": "ceo-analise-board",
  "nome": "CEO: análise do board e priorização",
  "nos": [
    {"id": "gatilho", "tipo": "manual", "config": {}},
    {"id": "diagnostico", "tipo": "agente", "config": {
      "agente": "ceo-documentos",
      "ordem": "Você é o CEO em análise semanal do board. Execute `opencorp task list` (via catálogo FERRAMENTAS.md), leia o estado das tasks e registries recentes, e produza um DIAGNÓSTICO curto: o que está parado, o que corre risco, 1-3 ações recomendadas com prioridade. Responda apenas o diagnóstico.\n\n[contexto da execução]\n{{entrada}}"
    }},
    {"id": "avaliar", "tipo": "decisao", "config": {
      "agente": "ceo-documentos",
      "pergunta": "Diante do diagnóstico, o que fazer agora?",
      "opcoes": [
        {"rotulo": "CRIAR_TASKS", "proximo": "abrir_tasks"},
        {"rotulo": "SEM_ACAO", "proximo": "registro_diagnostico"}
      ]
    }},
    {"id": "abrir_tasks", "tipo": "task_create", "config": {
      "titulo": "Gestão: ação prioritária do board ({{entrada}})",
      "descricao": "Criada pela linha ceo-analise-board. Contexto: {{entrada}}",
      "prioridade": "alta",
      "responsavel": "agente:executor-padrao"
    }},
    {"id": "registro_diagnostico", "tipo": "registro", "config": {
      "categoria": "documentos",
      "id": "ceo-analise",
      "titulo": "Diagnóstico semanal do board"
    }},
  ],
  "arestas": [
    {"de": "gatilho", "para": "diagnostico"},
    {"de": "diagnostico", "para": "avaliar"},
    {"de": "abrir_tasks", "para": "registro_diagnostico"}
  ],
}, indent=2, ensure_ascii=False) + "\n")
print("ok: ceo-analise-board")
EOF

# ─── 2. melhorias-continuas: círculo de melhoria cria proposals no board ───
$CLI flow create --workspace "$WS" melhorias-continuas --nome "Círculo de melhoria contínua" > /dev/null
python3 - "$WS" << 'EOF'
import json, sys
from pathlib import Path
ws = sys.argv[1]
p = Path.home() / ".opencorp" / "workspaces" / ws / ".opencorp" / "flows" / "melhorias-continuas.json"
p.write_text(json.dumps({
  "id": "melhorias-continuas",
  "nome": "Círculo de melhoria contínua",
  "nos": [
    {"id": "gatilho", "tipo": "manual", "config": {}},
    {"id": "olhar_fresh", "tipo": "agente", "config": {
      "agente": "critico-site",
      "ordem": "Analise o site e o board do workspace procurando 1 melhoria CONCRETA e pequena (design, conteúdo, processo). Use somente leitura. Responda em 1 parágrafo: a melhoria proposta + por quê + esforço estimado (baixo/médio). Não corrija nada.\n\n{{entrada}}"
    }},
    {"id": "vale?", "tipo": "decisao", "config": {
      "agente": "critico-site",
      "pergunta": "A melhoria proposta vale uma task agora? Julgue impacto vs esforço.",
      "opcoes": [
        {"rotulo": "VALE", "proximo": "abrir_melhoria"},
        {"rotulo": "NÃO_VALE", "proximo": "arquivo_ideia"}
      ]
    }},
    {"id": "abrir_melhoria", "tipo": "task_create", "config": {
      "titulo": "Melhoria: proposta do círculo de melhoria",
      "descricao": "Proposta: {{entrada}} — validar, executar e registrar resultado.",
      "prioridade": "media"
    }},
    {"id": "arquivo_ideia", "tipo": "registro", "config": {
      "categoria": "documentos",
      "id": "melhorias-arquivadas",
      "titulo": "Ideia arquivada (sem task agora)"
    }},
  ],
  "arestas": [
    {"de": "gatilho", "para": "olhar_fresh"},
    {"de": "olhar_fresh", "para": "vale?"},
    {"de": "abrir_melhoria", "para": "arquivo_ideia"}
  ],
}, indent=2, ensure_ascii=False) + "\n")
print("ok: melhorias-continuas")
EOF

# ─── 3. ideias-conteudo: editor de ideias alimenta a fila editorial ───
$CLI flow create --workspace "$WS" ideias-conteudo --nome "Ideias de conteúdo (fila editorial)" > /dev/null
python3 - "$WS" << 'EOF'
import json, sys
from pathlib import Path
ws = sys.argv[1]
p = Path.home() / ".opencorp" / "workspaces" / ws / ".opencorp" / "flows" / "ideias-conteudo.json"
p.write_text(json.dumps({
  "id": "ideias-conteudo",
  "nome": "Ideias de conteúdo (fila editorial)",
  "nos": [
    {"id": "gatilho", "tipo": "manual", "config": {}},
    {"id": "brainstorm", "tipo": "agente", "config": {
      "agente": "editor",
      "ordem": "Leia .opencorp/projeto.json (tópicos_editoriais, público, tom) e o que já está publicado (wp.cjs, somente leitura via FERRAMENTAS.md). Proponha 3 ideias de conteúdo NOVAS (não publicadas): título + ângulo + por que interessa ao público. Responda só as 3 ideias numeradas.\n\n{{entrada}}"
    }},
    {"id": "triagem", "tipo": "decisao", "config": {
      "agente": "editor",
      "pergunta": "Das 3 ideias, qual a mais forte para publicar esta semana? Responda o número da escolhida seguido de ESCOLHIDA (ex.: '2 ESCOLHIDA') — mas responda APENAS um dos rótulos válidos.",
      "opcoes": [
        {"rotulo": "ESCOLHIDA", "proximo": "abrir_ideia"},
        {"rotulo": "NENHUMA_BOA", "proximo": "arquivo"}
      ]
    }},
    {"id": "abrir_ideia", "tipo": "task_create", "config": {
      "titulo": "Editorial: produzir ideia escolhida",
      "descricao": "Ideia escolhida pelo editor: {{entrada}}. Fluxo: redigir pelo perfil → rascunho no WP → registrar.",
      "prioridade": "media",
      "responsavel": "agente:editor"
    }},
    {"id": "arquivo", "tipo": "registro", "config": {
      "categoria": "documentos",
      "id": "ideias-conteudo",
      "titulo": "Ideias de conteúdo (banco)"
    }},
  ],
  "arestas": [
    {"de": "gatilho", "para": "brainstorm"},
    {"de": "brainstorm", "para": "triagem"},
    {"de": "abrir_ideia", "para": "arquivo"}
  ],
}, indent=2, ensure_ascii=False) + "\n")
print("ok: ideias-conteudo")
EOF

# ─── 4. decisao-opcoes: decisão estruturada com justificativa registrada ───
$CLI flow create --workspace "$WS" decisao-opcoes --nome "Decisão estruturada entre opções" > /dev/null
python3 - "$WS" << 'EOF'
import json, sys
from pathlib import Path
ws = sys.argv[1]
p = Path.home() / ".opencorp" / "workspaces" / ws / ".opencorp" / "flows" / "decisao-opcoes.json"
p.write_text(json.dumps({
  "id": "decisao-opcoes",
  "nome": "Decisão estruturada entre opções",
  "nos": [
    {"id": "gatilho", "tipo": "manual", "config": {}},
    {"id": "consultar", "tipo": "agente", "config": {
      "agente": "ceo-documentos",
      "ordem": "Você é o CEO decidindo entre dois caminhos. Entrada: {{entrada}}. Avalie custo, risco e retorno de A (rápido/seguro) vs B (ambicioso). Responda APENAS uma linha: CAMINHO_A ou CAMINHO_B."
    }},
    {"id": "julgar", "tipo": "decisao", "config": {
      "agente": "ceo-documentos",
      "pergunta": "Confirmar a decisão e registrar justificativa:",
      "opcoes": [
        {"rotulo": "CAMINHO_A", "proximo": "por_a"},
        {"rotulo": "CAMINHO_B", "proximo": "por_b"}
      ]
    }},
    {"id": "por_a", "tipo": "agente", "config": {
      "agente": "ceo-documentos",
      "ordem": "Decisão: CAMINHO_A (rápido/seguro). Registre a ata da decisão em 4 linhas: contexto ({{entrada}}), 2 justificativas, 1 risco aceito. Responda a ata."
    }},
    {"id": "por_b", "tipo": "agente", "config": {
      "agente": "ceo-documentos",
      "ordem": "Decisão: CAMINHO_B (ambicioso). Registre a ata da decisão em 4 linhas: contexto ({{entrada}}), 2 justificativas, 1 risco aceito. Responda a ata."
    }},
    {"id": "ata", "tipo": "registro", "config": {
      "categoria": "documentos",
      "id": "decisoes",
      "titulo": "Ata de decisão"
    }},
  ],
  "arestas": [
    {"de": "gatilho", "para": "consultar"},
    {"de": "consultar", "para": "julgar"},
    {"de": "por_a", "para": "ata"},
    {"de": "por_b", "para": "ata"}
  ],
}, indent=2, ensure_ascii=False) + "\n")
print("ok: decisao-opcoes")
EOF
echo "pacote instalado em $WS"
