import { CanalError } from "./errors.js";

export { CanalError };

/** ADR-0001 — Canais de integração (P-11).
 *  Esqueleto de interface: providers reais (WhatsApp/Baileys, Telegram) plugam
 *  no `RegistroDeCanais` via gateway externo; hoje o `CanalNotificacao` entrega
 *  mensagens como notificações do painel (fallback `POST /notifications`). */

export type TipoCanal = "whatsapp" | "telegram" | "email";

export interface MensagemCanal {
  para: string;
  texto: string;
}

export interface Canal {
  readonly id: string;
  readonly tipo: TipoCanal;
  enviar(msg: MensagemCanal): Promise<void>;
}

/** Registro de canais ativos — map id → canal. */
export class RegistroDeCanais {
  private readonly canais = new Map<string, Canal>();

  registrar(canal: Canal): void {
    if (!canal || typeof canal.id !== "string" || canal.id.trim().length === 0) {
      throw new CanalError("canal precisa de id");
    }
    this.canais.set(canal.id, canal);
  }

  obter(id: string): Canal | undefined {
    return this.canais.get(id);
  }

  listar(): Canal[] {
    return [...this.canais.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  porTipo(tipo: TipoCanal): Canal[] {
    return this.listar().filter((c) => c.tipo === tipo);
  }

  excluir(id: string): boolean {
    return this.canais.delete(id);
  }
}

/** Instância compartilhada para o server registrar/descobrir canais. */
export const registroCanais = new RegistroDeCanais();

/** Função de POST injetável — evita depender de server real nos testes. */
export type Poster = (caminho: string, corpo: unknown, headers: Record<string, string>) => Promise<void>;

export interface OpcoesCanalNotificacao {
  id?: string;
  workspace?: string;
  baseUrl?: string;
  token?: string;
  poster?: Poster;
}

const BASE_PADRAO = "http://127.0.0.1:4100";

/** Canal de saída sem provider real: entrega a mensagem como notificação do
 *  painel (`POST /notifications`), aparecendo no feed do dono. Quando o
 *  endpoint `POST /canais/:canal/enviar` e os gateways existirem (ADR-0001),
 *  o provider real substitui esta classe no `RegistroDeCanais`. */
export class CanalNotificacao implements Canal {
  readonly id: string;
  readonly tipo: TipoCanal;
  private readonly workspace?: string;
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly poster?: Poster;

  constructor(tipo: TipoCanal, opcoes: OpcoesCanalNotificacao = {}) {
    this.tipo = tipo;
    this.id = opcoes.id ?? `canal-${tipo}`;
    this.workspace = opcoes.workspace;
    this.baseUrl = (opcoes.baseUrl ?? BASE_PADRAO).replace(/\/+$/, "");
    this.token = opcoes.token;
    this.poster = opcoes.poster;
  }

  async enviar(msg: MensagemCanal): Promise<void> {
    const para = String(msg?.para ?? "").trim();
    const texto = String(msg?.texto ?? "").trim();
    if (!para) throw new CanalError("mensagem precisa de destinatário (para)");
    if (!texto) throw new CanalError("mensagem precisa de texto");

    const corpo = {
      titulo: `[${this.tipo}] mensagem para ${para}`,
      corpo: texto,
      tipo: "aviso" as const,
      origem: `canal:${this.tipo}`,
      canal: this.tipo,
      para,
    };
    const caminho = this.workspace
      ? `/notifications?workspace=${encodeURIComponent(this.workspace)}`
      : "/notifications";

    if (this.poster) {
      await this.poster(caminho, corpo, this.headers());
      return;
    }
    const resp = await fetch(`${this.baseUrl}${caminho}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...this.headers() },
      body: JSON.stringify(corpo),
    });
    if (!resp.ok) {
      const detalhe = (await resp.text()).slice(0, 300);
      throw new CanalError(`falha ao enviar pelo canal "${this.id}" (HTTP ${resp.status}): ${detalhe}`, {
        status: resp.status,
      });
    }
  }

  private headers(): Record<string, string> {
    return this.token ? { authorization: `Bearer ${this.token}` } : {};
  }
}
