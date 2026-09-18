---
name: flow-orchestrator
description: Best practices and instructions for designing, building, and debugging workflows in OpenCorp (n8n-inspired declarative flows).
---

# Flow Orchestrator Skill

This skill provides guidelines and patterns for constructing declarative workflows in OpenCorp.

## Architectural Principles
1. **The Flow Commands Everything**: Automation triggers, periodic crons, HTTP webhooks, and agent dispatches must live inside flow definitions (`.opencorp/flows/<id>.json`).
2. **Deterministic Pre-checks**: Use fast, lightweight script nodes or mini-agents (<14B) before dispatching expensive reasoning agents.
3. **Graceful Degradation**: Always provide fallback paths when external APIs or web scrapes return unexpected data.

## Node Types
- `cron`: Scheduled execution with standard 5-field cron syntax (`config.expressao_cron`).
- `webhook`: Inbound HTTP trigger receiving payload as context (`config.caminho`).
- `script`: Sandboxed code execution in Node.js, Python, or Bash (`config.codigo` or `config.comando`).
- `agente`: Autonomous LLM agent execution with specific prompt and role (`config.agente`, `config.ordem`).
- `condicao`: Binary or multi-way context branch (`config.chave`, `config.entao`, `config.senao`).
- `subflow`: Modular invocation of another workspace flow (`config.flow_id`).
- `saida`: Persists final context into registries (`config.registro`).

## CLI Inspection Commands
```bash
# List all workspace flows
oc flow list --workspace <id>

# Inspect a flow graph
oc flow inspect <flow_id> --workspace <id>

# Run a flow manually for testing
oc flow run <flow_id> --workspace <id>
```
