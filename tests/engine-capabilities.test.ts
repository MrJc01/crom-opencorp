import { describe, expect, it } from "vitest";
import { CAPACIDADES, CapabilitiesPara } from "../src/core/engines/capabilities.js";

// Nota: claude-code declarado a partir do driver + `claude --help`
// (--resume/--continue/--fork-session), nao testado em runtime aqui.

describe("engine capabilities (F1-T01)", () => {
  it("opencode continua via API/CLI e duplica via --fork", () => {
    const c = CapabilitiesPara("opencode");
    expect(c.continuaNativo).toBe(true);
    expect(c.duplicaNativo).toBe(true);
    expect(c.como).toMatch(/API/i);
    expect(c.flags).toContain("--session");
    expect(c.flags).toContain("--fork");
  });

  it("claude continua e duplica via flags CLI (declarado, nao testado em runtime)", () => {
    const c = CapabilitiesPara("claude-code");
    expect(c.continuaNativo).toBe(true);
    expect(c.duplicaNativo).toBe(true);
    expect(c.flags).toContain("--resume");
    expect(c.flags).toContain("--continue");
  });

  it("antigravity continua via --conversation/--continue, sem fork nativo", () => {
    const c = CapabilitiesPara("antigravity");
    expect(c.continuaNativo).toBe(true);
    expect(c.duplicaNativo).toBe(false);
    expect(c.flags).toContain("--conversation");
  });

  it("copilot continua via --resume/--continue/--connect/--session-id, sem fork nativo", () => {
    const c = CapabilitiesPara("copilot");
    expect(c.continuaNativo).toBe(true);
    expect(c.duplicaNativo).toBe(false);
    expect(c.flags).toContain("--resume");
    expect(c.flags).toContain("--connect");
  });

  it("codex continua via resume e duplica via fork", () => {
    const c = CapabilitiesPara("codex");
    expect(c.continuaNativo).toBe(true);
    expect(c.duplicaNativo).toBe(true);
    expect(c.flags).toContain("resume");
    expect(c.flags).toContain("fork");
  });

  it("cursor continua via --resume/--continue, sem fork nativo", () => {
    const c = CapabilitiesPara("cursor");
    expect(c.continuaNativo).toBe(true);
    expect(c.duplicaNativo).toBe(false);
    expect(c.flags).toContain("--resume");
  });

  it("crom-agente continua via --session, sem fork nativo", () => {
    const c = CapabilitiesPara("crom-agente");
    expect(c.continuaNativo).toBe(true);
    expect(c.duplicaNativo).toBe(false);
    expect(c.flags).toEqual(["--session"]);
  });

  it("aider e desconhecidos nao tem suporte nativo", () => {
    for (const id of ["aider", "outro-qualquer", ""]) {
      const c = CapabilitiesPara(id);
      expect(c.continuaNativo).toBe(false);
      expect(c.duplicaNativo).toBe(false);
    }
    expect(CAPACIDADES["aider"].continuaNativo).toBe(false);
  });
});
