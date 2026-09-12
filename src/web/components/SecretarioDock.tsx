import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Bot, History, Expand, X } from "lucide-solid";
import { UniversalChat } from "./chat/UniversalChat";
import { HistoricoModal } from "./chat/HistoricoModal";
import { useChat } from "../lib/chat/store";
import { setDockSecretarioAberto } from "../lib/context";

/** Secretário em dock lateral — o mesmo chat da página /secretario,
 *  disponível em todas as páginas (mesma conversa, mesmo store). */
export default function SecretarioDock() {
  const chat = useChat();
  const navigate = useNavigate();
  const [historicoAberto, setHistoricoAberto] = createSignal(false);
  const fechar = () => setDockSecretarioAberto(false);

  return (
    <>
      {/* Fundo mobile: toca para fechar (no desktop o dock é parte do layout) */}
      <div
        class="fixed inset-0 bg-black/60 z-40 lg:hidden"
        onClick={fechar}
        aria-hidden="true"
      />
    <aside
      data-testid="secretario-dock"
      class="fixed lg:static inset-y-0 right-0 z-50 lg:z-auto flex w-[88vw] max-w-[420px] lg:w-[380px] xl:w-[420px] shrink-0 border-l border-[var(--border)] bg-[var(--panel)] flex-col min-h-0 shadow-2xl lg:shadow-none"
      aria-label="Secretário"
    >
      <div class="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
        <Bot size={15} class="text-emerald-400" />
        <span class="text-sm font-semibold">Secretário</span>
        <div class="ml-auto flex items-center gap-1">
          <button
            class="btn-ghost text-xs"
            title="Histórico"
            data-testid="secretario-dock-historico"
            onClick={() => setHistoricoAberto(true)}
          >
            <History size={14} />
          </button>
          <button
            class="btn-ghost text-xs"
            title="Abrir página do Secretário"
            data-testid="secretario-dock-expandir"
            onClick={() => navigate("/secretario")}
          >
            <Expand size={14} />
          </button>
          <button
            class="btn-ghost text-xs"
            title="Ocultar painel lateral (Ctrl+J)"
            data-testid="secretario-dock-fechar"
            onClick={fechar}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div class="flex-1 min-h-0 flex flex-col">
        <UniversalChat
          mensagens={chat.mensagens()}
          carregando={chat.carregando()}
          decorridoFmt={chat.decorridoFmt()}
          podeEnviarPrompt={true}
          valorPrompt={chat.inputValor()}
          onValorPromptChange={chat.setInputValor}
          refTextarea={chat.refTextareaPara("dock")}
          inputId="secretario-dock-input"
          onEnviarPrompt={async (texto, anexosRecebidos) => {
            if (anexosRecebidos) chat.setAnexos(anexosRecebidos);
            chat.setInputValor(texto);
            await chat.enviarMensagem();
          }}
          onEditarPrompt={(i) => void chat.editarPrompt(i, "dock")}
          filaPrompts={chat.filaPrompts()}
          onAdicionarFila={chat.adicionarFila}
          onRemoverFila={chat.removerFila}
          onEditarFila={(id) => chat.editarFila(id, "dock")}
          onAdiantarFila={(id) => void chat.adiantarFila(id)}
          onAprovarHitl={(id) => void chat.aprovarHitl(id)}
          onRejeitarHitl={(id, m) => void chat.rejeitarHitl(id, m)}
          onAbrirHistorico={() => setHistoricoAberto(true)}
          onParar={chat.pararStream}
          temMaisMensagensAnteriores={chat.temMaisMensagensAnteriores()}
          carregandoAnteriores={chat.carregandoAnteriores()}
          onCarregarAnteriores={() => void chat.carregarMensagensAnteriores()}
          totalMensagens={chat.totalMensagensServidor()}
          sugestoesRapidas={[]}
        />
      </div>
      <HistoricoModal
        open={historicoAberto()}
        onOpenChange={setHistoricoAberto}
        sessoes={chat.sessoes()}
        sessaoAtivaId={chat.sessaoAtivaId()}
        onSelecionarSessao={(id) => { void chat.selecionarSessao(id); setHistoricoAberto(false); }}
        onNovaConversa={() => { chat.novaConversa(); setHistoricoAberto(false); }}
        onExcluirSessao={(id) => void chat.excluirSessao(id)}
      />
    </aside>
    </>
  );
}
