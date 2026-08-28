export class OpencorpError extends Error {
  readonly exitCode: number;

  constructor(mensagem: string, opts: { exitCode?: number } = {}) {
    super(mensagem);
    this.name = this.constructor.name;
    this.exitCode = opts.exitCode ?? 1;
  }
}

export class WorkspaceError extends OpencorpError {}
export class AgentError extends OpencorpError {}
export class SessionError extends OpencorpError {}
export class RegistryError extends OpencorpError {}
export class TemplateError extends OpencorpError {}
export class SubcorpError extends OpencorpError {}
