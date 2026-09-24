export interface MiniApp {
  id: string;
  titulo: string;
  descricao?: string;
  icone?: string;
  entryUrl?: string;
  ativo?: boolean;
  categoria?: string;
  tools?: string[];
  mcpServer?: string;
  versao?: string;
  parametros?: Record<string, any>;
}

export type ModoVisualizacaoApp = "app" | "chat" | "ambos";
