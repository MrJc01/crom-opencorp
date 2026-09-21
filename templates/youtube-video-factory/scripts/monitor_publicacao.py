#!/usr/bin/env python3
"""
MONITOR DE PUBLICAÇÃO — Bit Proibido
Confirma ao vivo se os vídeos agendados realmente viraram públicos.
- Sem OAuth e sem cota da API: usa o endpoint público oembed do YouTube.
  * oembed 200 → vídeo PÚBLICO ao vivo → task 'agendado' → 'publicado'
  * oembed falha e publish_at já passou (grace 30min) → alerta em registries/publicacao/alertas/
- Idempotente; roda a cada 30 min pelo scheduler (cron :20,:50).
"""
import json, os, sqlite3, datetime, urllib.request, urllib.parse

WS = os.environ.get("OPENCORP_WORKSPACE", os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
DB = os.path.join(WS, ".opencorp/tasks.db")
AGENDA = os.path.join(WS, "registries/publicacao/agenda.json")
ALERTAS = os.path.join(WS, "registries/publicacao/alertas")
TZ_OFF = "-03:00"
GRACE_MIN = 30

def log(m): print(m, flush=True)

def agora():
    return datetime.datetime.now().astimezone()  # offset-aware (TZ local)

def parse_iso(s):
    return datetime.datetime.fromisoformat(s)

def oembed_publico(yt_id):
    url = "https://www.youtube.com/oembed?" + urllib.parse.urlencode({"url": f"https://www.youtube.com/watch?v={yt_id}", "format": "json"})
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            return r.status == 200
    except Exception:
        return False

def task_id(vid):
    return f"tsk-boletim-{vid}" if vid.startswith("blt-") else f"tsk-video-{vid}"

def coluna_task(vid):
    con = sqlite3.connect(DB)
    r = con.execute("SELECT coluna FROM tasks WHERE id=?", (task_id(vid),)).fetchone()
    con.close()
    return r[0] if r else None

def set_coluna(vid, coluna):
    con = sqlite3.connect(DB)
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    con.execute("UPDATE tasks SET coluna=?, atualizado_em=? WHERE id=?", (coluna, now, task_id(vid)))
    con.commit(); con.close()

def atualizar_metadados(vid, campo, valor):
    p = os.path.join(WS, "exports/videos", vid, "metadados_publicacao.json")
    if os.path.exists(p):
        m = json.load(open(p)); m[campo] = valor
        json.dump(m, open(p, "w"), ensure_ascii=False, indent=2)

def main():
    os.makedirs(ALERTAS, exist_ok=True)
    if not os.path.exists(AGENDA):
        log("agenda inexistente — nada a monitorar"); return
    ag = json.load(open(AGENDA))
    agora_dt = agora()
    vivos, pendentes, alertas = 0, 0, 0
    for slot_iso, vid in ag.get("slots_usados", {}).items():
        if coluna_task(vid) not in ("agendado", "publicado"):
            continue  # descartado ou apagado: não monitora
        yt_id = None
        mp = os.path.join(WS, "exports/videos", vid, "metadados_publicacao.json")
        if not os.path.exists(mp) and vid.startswith("blt-"):
            mp = os.path.join(WS, "exports/longos", vid, "metadados_publicacao.json")
        if os.path.exists(mp):
            yt_id = json.load(open(mp)).get("youtube_video_id")
        if not yt_id:
            log(f"{vid}: sem youtube_video_id — pulando"); continue
        pub = parse_iso(slot_iso)
        if agora_dt < pub:
            log(f"{vid}: agendado para {slot_iso} (ainda não é hora)"); pendentes += 1; continue
        vivo = oembed_publico(yt_id)
        if vivo:
            if coluna_task(vid) == "agendado":
                set_coluna(vid, "publicado")
                atualizar_metadados(vid, "publicado_verificado_em", agora_dt.isoformat())
                log(f"✔ {vid} ({yt_id}) AO VIVO desde {slot_iso} → 'publicado'")
            vivos += 1
        else:
            if (agora_dt - pub).total_seconds() > GRACE_MIN * 60 and coluna_task(vid) == "agendado":
                f = os.path.join(ALERTAS, f"ALERTA-{vid}-{agora_dt.strftime('%Y%m%d-%H%M')}.md")
                if not os.path.exists(f):
                    open(f, "w").write(f"""# ⚠️ Vídeo não foi ao ar
- **vid**: {vid}
- **youtube_id**: {yt_id}
- **agendado para**: {slot_iso}
- **verificado em**: {agora_dt.isoformat()}
- **provável causa**: app OAuth não verificado (Google pode travar upload como privado) ou processamento pendente do YouTube.
- **ação sugerida**: conferir manualmente no YouTube Studio; se privado, publicar manualmente OU concluir a auditoria de API. Vide docs/sistema/04-publicacao-youtube.md
""")
                log(f"⚠ {vid} ({yt_id}): deveria ter ido ao ar em {slot_iso} e NÃO está público — alerta gravado")
                alertas += 1
            else:
                log(f"{vid} ({yt_id}): dentro da janela de graça ({GRACE_MIN}min)")
    log(f"resumo: {vivos} ao vivo | {pendentes} aguardando hora | {alertas} alertas")

if __name__ == "__main__":
    main()
