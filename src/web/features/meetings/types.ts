export interface MensagemGrupo {
  agente: string;
  texto: string;
  ts: string;
  modelo?: string;
  turno?: number;
}

export interface SalaReuniao {
  id: string;
  pauta: string;
  participantes: string[] | Array<{ id: string; nome?: string }>;
  status: string;
  turno?: number;
  turno_atual?: number;
  mensagens?: MensagemGrupo[];
  ata?: string | null;
  criado_em?: string;
  encerrada_em?: string | null;
  moderador?: string;
  decisoes?: string[];
  tarefas_geradas?: string[];
}
