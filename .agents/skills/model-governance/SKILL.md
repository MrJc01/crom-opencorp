---
name: model-governance
description: Guidelines and guardrails for model selection, parameter tiering (xB), and cost-effective LLM allocation across agents and workflow nodes.
---

# Model Governance Skill

This skill defines the operational standards for assigning AI models to agents and workflow steps.

## Parameter Tiering Matrix (xB)
- **< 4B Parameters (⛔ NOT Recommended)**: Models like `liquid/lfm-2.5-2.6b:free` and `llama-3.2-1b` cannot handle tool calling, multi-turn reasoning, or JSON schemas. Never assign them to autonomous agents.
- **7B – 14B Parameters (⚡ Mini-Agents)**: Ideal for fast, single-purpose workflow nodes: deduplication, schema validation, stock verification, and formatting. Very low latency and free/cheap.
- **14B – 35B Parameters (📝 Writers & Editors)**: Ideal for scriptwriting, news summarization, Portuguese translation, and 5-scene YouTube scripts (`qwen3.8-27b:free`, `qwen-2.5-coder-32b`).
- **> 70B Parameters & Flagships (🧠 Reasoning / Secretary)**: Required for the Workspace Executive Secretary, deep debugging, error recovery, and complex investigation (`gemini-2.5-flash` / `gemini-3.8-flash` via AGY, `nemotron-3-ultra-550b`, `claude-3.5-sonnet`).

## Blacklisted Models in Workspaces
- `openrouter/openrouter/free` (blind router with unpredictable model allocation).
- `openrouter/liquid/lfm-2.5-2.6b:free` (fails tool calling and crashes autonomous loops).

## CLI Model Filtering
```bash
# List all engines and status
oc motores list

# Filter models by parameter size
oc modelos --size ">30b"
oc modelos --size "<14b"
oc modelos --min-b 14 --max-b 70 --free
```
