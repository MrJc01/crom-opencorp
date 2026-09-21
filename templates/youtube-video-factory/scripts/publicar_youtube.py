#!/usr/bin/env python3
"""
PUBLICADOR YOUTUBE — Bit Proibido (ESTRATÉGIA OTIMIZADA)
- `--auth`   : consentimento OAuth (uma única vez; abre URL, aguarda redirect em localhost:8765)
- `--paste X`: troca manual do código se o navegador do usuário não for da máquina
- `--auto`   : modo do scheduler — uploads inteligentes (máx 3 agendados + resto imediato)
- `--dry-run`: mostra o plano sem fazer upload

NOVA ESTRATÉGIA:
- Agenda MÁXIMO 3 vídeos: 1 boletim (13:00) + 2 shorts (09:00, 14:00)
- Demais shorts: upload IMEDIATO como PUBLIC (não agendado)
- Cota: 1.600 un/upload; 9.600/dia → até 6 uploads reais/dia
- Isso evita "comer cota" agendando vídeos que não vão ao ar hoje
"""
import json, os, sys, glob, sqlite3, datetime, argparse

WS = os.environ.get("OPENCORP_WORKSPACE", os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
WS_NOME = os.path.basename(WS)
SECRETS = os.environ.get("OPENCORP_SECRETS", os.path.join(os.path.expanduser("~/.opencorp/secrets"), WS_NOME))
CLIENT = os.path.join(SECRETS, "client_secret.json")
TOKENS = os.path.join(SECRETS, "tokens.json")
AGENDA = os.path.join(WS, "registries/publicacao/agenda.json")
EXPORTS = os.path.join(WS, "exports/videos")
LONGOS = os.path.join(WS, "exports/longos")
DB = os.path.join(WS, ".opencorp/tasks.db")
TZ_OFF = "-03:00"  # BRT

# NOVA CONFIG: só 3 slots agendados (1 boletim + 2 shorts)
SLOTS_SHORT_SCHEDULED = ["09:00", "14:00"]      # 2 shorts agendados/dia
SLOTS_LONG_SCHEDULED  = ["13:00"]               # 1 boletim agendado/dia
CUSTO_UPLOAD = 1600
LIMITE_DIA = 9600  # 6 uploads reais/dia

SCOPES = ["https://www.googleapis.com/auth/youtube",
          "https://www.googleapis.com/auth/youtube.upload"]

def log(m): print(m, flush=True)

def carregar_agenda():
    if os.path.exists(AGENDA):
        return json.load(open(AGENDA))
    return {"slots_usados": {}, "quota": {}}

def salvar_agenda(a):
    os.makedirs(os.path.dirname(AGENDA), exist_ok=True)
    json.dump(a, open(AGENDA, "w"), ensure_ascii=False, indent=2)

def hoje_local(): return datetime.date.today().isoformat()

def slot_iso(dia, hhmm):
    return f"{dia}T{hhmm}:00{TZ_OFF}"

def ja_publicado(titulo_cand, ignora_pasta=None):
    import re, glob
    if not titulo_cand: return False
    if ignora_pasta and os.path.basename(ignora_pasta).startswith("blt-"):
        return False
    tit_cand = re.sub(r"[^\w\s]", "", str(titulo_cand).lower()).strip()
    palavras_cand = set(tit_cand.split())
    for p in glob.glob(os.path.join(EXPORTS, "*", "metadados_publicacao.json")) + glob.glob(os.path.join(LONGOS, "*", "metadados_publicacao.json")):
        if ignora_pasta and os.path.abspath(os.path.dirname(p)) == os.path.abspath(ignora_pasta):
            continue
        try:
            m_ant = json.load(open(p))
            yt_id = m_ant.get("youtube_video_id")
            if yt_id and yt_id not in ("duplicata_local", "sem-yt-id", "deletado_clone"):
                t_ant = re.sub(r"[^\w\s]", "", str(m_ant.get("titulo_otimizado", "")).lower()).strip()
                if not t_ant: continue
                if t_ant == tit_cand: return True
                if len(tit_cand) > 15 and (tit_cand in t_ant or t_ant in tit_cand): return True
                palavras_ant = set(t_ant.split())
                if len(palavras_cand) >= 4 and len(palavras_ant) >= 4:
                    inter = len(palavras_cand & palavras_ant)
                    uniao = len(palavras_cand | palavras_ant)
                    if uniao > 0 and (inter / uniao) >= 0.75:
                        return True
        except Exception:
            pass
    return False

def credenciais():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    creds = None
    if os.path.exists(TOKENS):
        creds = Credentials.from_authorized_user_file(TOKENS, SCOPES)
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except Exception as e:
            f=os.path.join(WS,"registries/publicacao/alertas",f"ALERTA-token-{datetime.datetime.now().strftime('%Y%m%d-%H%M')}.md")
            os.makedirs(os.path.dirname(f),exist_ok=True)
            open(f,"w").write(f"# ⚠️ Falha ao renovar token YouTube\n{e}\n\nAção: refazer --auth (verificar se tela de consentimento saiu do modo Testes — tokens expiram em 7 dias em modo testes).\n")
            log(f"token não renovado — alerta gravado: {f}")
            return None
        json.dump(json.loads(creds.to_json()), open(TOKENS, "w"), indent=2)
        os.chmod(TOKENS, 0o600)
    elif not creds:
        return None
    return creds

def auth_flow():
    from google_auth_oauthlib.flow import InstalledAppFlow
    flow = InstalledAppFlow.from_client_secrets_file(CLIENT, SCOPES)
    print("ABRA ESTA URL NO NAVEGADOR (conta do @bitproibido):")
    auth_url, _ = flow.authorization_url(access_type="offline", prompt="consent")
    print(auth_url)
    open(os.path.join(SECRETS, "auth_url.txt"), "w").write(auth_url + "\n")
    flow.run_local_server(port=8765, open_browser=False, success_message="Autorização concluída!")
    creds = flow.credentials
    json.dump(json.loads(creds.to_json()), open(TOKENS, "w"), indent=2)
    os.chmod(TOKENS, 0o600)
    log(f"✔ token salvo em {TOKENS}")

def auth_paste(valor):
    from google_auth_oauthlib.flow import InstalledAppFlow
    code = valor.split("code=")[-1].split("&")[0].strip()
    flow = InstalledAppFlow.from_client_secrets_file(CLIENT, SCOPES)
    flow.redirect_uri = "http://localhost:8765"
    flow.fetch_token(code=code)
    creds = flow.credentials
    json.dump(json.loads(creds.to_json()), open(TOKENS, "w"), indent=2)
    os.chmod(TOKENS, 0o600)
    log(f"✔ token salvo em {TOKENS}")

def videos_e_tarefas(tipo="short"):
    con = sqlite3.connect(DB); con.row_factory = sqlite3.Row
    if tipo == "short":
        rows = {r["id"].replace("tsk-video-", ""): r["coluna"] for r in
                con.execute("SELECT id, coluna FROM tasks WHERE id LIKE 'tsk-video-vid-%'")}
        pattern = os.path.join(EXPORTS, "vid-*", "metadados_publicacao.json")
    else:
        rows = {r["id"].replace("tsk-boletim-", ""): r["coluna"] for r in
                con.execute("SELECT id, coluna FROM tasks WHERE id LIKE 'tsk-boletim-%'")}
        pattern = os.path.join(LONGOS, "blt-*", "metadados_publicacao.json")
    con.close()
    out = []
    for meta_path in glob.glob(pattern):
        vid_dir = os.path.dirname(meta_path); vid = os.path.basename(vid_dir)
        mp4 = os.path.join(vid_dir, "video_final.mp4")
        if not os.path.exists(mp4): continue
        meta = json.load(open(meta_path))
        if meta.get("youtube_video_id"): continue
        coluna = rows.get(vid, "aguardando")
        out.append((vid, mp4, coluna, os.path.getmtime(mp4)))
    out.sort(key=lambda t: t[3])
    return out

def proximos_slots_scheduled(ag, tipo="short", n=1):
    """Próximos slots AGENDADOS livres (short/long), futuros, em ordem cronológica."""
    agora = datetime.datetime.now()
    usados = set(ag["slots_usados"].keys())
    livres = []
    dia = datetime.date.today()
    slots = SLOTS_SHORT_SCHEDULED if tipo == "short" else SLOTS_LONG_SCHEDULED
    for i in range(7):
        d = dia + datetime.timedelta(days=i)
        for hhmm in slots:
            dt = datetime.datetime.strptime(f"{d} {hhmm}", "%Y-%m-%d %H:%M")
            if dt <= agora + datetime.timedelta(minutes=20): continue
            iso = slot_iso(d.isoformat(), hhmm)
            if iso in usados: continue
            livres.append((iso, d.isoformat(), hhmm))
            if len(livres) >= n: return livres
    return livres

def marcar_agendado(vid, yt_id, publish_at, tipo="short"):
    con = sqlite3.connect(DB)
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    prefixo = "tsk-boletim-" if tipo == "long" else "tsk-video-"
    con.execute("UPDATE tasks SET coluna='agendado', atualizado_em=? WHERE id=?", (now, f"{prefixo}{vid}"))
    con.commit(); con.close()
    pasta = LONGOS if tipo == "long" else EXPORTS
    mp = os.path.join(pasta, vid, "metadados_publicacao.json")
    if os.path.exists(mp):
        m = json.load(open(mp))
        m["youtube_video_id"] = yt_id; m["youtube_publish_at"] = publish_at; m["publicado_em"] = now
        json.dump(m, open(mp, "w"), ensure_ascii=False, indent=2)

def marcar_publicado(vid, yt_id, tipo="short"):
    """Marca vídeo publicado AGORA (privacyStatus=public)"""
    con = sqlite3.connect(DB)
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    prefixo = "tsk-boletim-" if tipo == "long" else "tsk-video-"
    con.execute("UPDATE tasks SET coluna='publicado', atualizado_em=? WHERE id=?", (now, f"{prefixo}{vid}"))
    con.commit(); con.close()
    pasta = LONGOS if tipo == "long" else EXPORTS
    mp = os.path.join(pasta, vid, "metadados_publicacao.json")
    if os.path.exists(mp):
        m = json.load(open(mp))
        m["youtube_video_id"] = yt_id; m["youtube_publish_at"] = now; m["publicado_em"] = now
        json.dump(m, open(mp, "w"), ensure_ascii=False, indent=2)

def auto(dry=False, tipo_filtro=None):
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    from googleapiclient.errors import HttpError
    creds = credenciais()
    if not creds and not dry:
        log("SEM TOKEN: rode --auth primeiro."); sys.exit(1)
    if not creds and dry:
        log("[DRY sem token] mostrando apenas o plano..."); creds=None
    yt = build("youtube", "v3", credentials=creds, cache_discovery=False) if creds else None
    ag = carregar_agenda()
    hoje = hoje_local()
    usados_hoje = ag["quota"].get(hoje, 0)
    
    shorts = [v for v in videos_e_tarefas("short") if v[2] not in ("publicado", "descartado")]
    longos = [v for v in videos_e_tarefas("long") if v[2] not in ("publicado", "descartado")]
    if tipo_filtro == "long":
        shorts = []
    elif tipo_filtro == "short":
        longos = []
    
    log(f"fila shorts: {len(shorts)} | fila longos: {len(longos)} | quota hoje: {usados_hoje}/{LIMITE_DIA} un")
    
    if usados_hoje + CUSTO_UPLOAD > LIMITE_DIA:
        log(f"⚠️ Cota diária atingida ({usados_hoje}/{LIMITE_DIA}). Próximas no próximo ciclo.")
        return
    
    feitos = 0
    
    # ============================================================
    # PASSO 1: AGENDAR boletim (1 slot: 13:00)
    # ============================================================
    if longos and (not tipo_filtro or tipo_filtro == "long"):
        s_long = proximos_slots_scheduled(ag, "long", 1)
        if s_long and usados_hoje + CUSTO_UPLOAD <= LIMITE_DIA:
            iso, dia, hhmm = s_long[0]
            vid, mp4, _, _ = longos[0]
            pasta = LONGOS
            meta = json.load(open(os.path.join(pasta, vid, "metadados_publicacao.json")))
            
            if ja_publicado(meta.get("titulo_otimizado"), ignora_pasta=os.path.join(pasta, vid)):
                log(f"⚠️ Pula {vid}: duplicado no canal"); longos.pop(0)
            elif vid.startswith("blt-"):
                data_blt = vid.split("-")[1][:8]
                if any(data_blt in str(v) for v in ag.get("slots_usados", {}).values() if v != vid):
                    log(f"⚠️ Pula {vid}: data já agendada"); longos.pop(0)
                else:
                    if not dry:
                        yt_id = upload_video(yt, mp4, meta, iso, "private", tipo="long")
                        if yt_id:
                            ag["slots_usados"][iso] = vid
                            ag["quota"][hoje] = usados_hoje + CUSTO_UPLOAD
                            usados_hoje = ag["quota"][hoje]
                            marcar_agendado(vid, yt_id, iso, tipo="long")
                            longos.pop(0)
                            feitos += 1
                    else:
                        log(f"[DRY] {vid} (boletim) → agendar {iso}")
                        ag["slots_usados"][iso] = vid
                        usados_hoje += CUSTO_UPLOAD
                        longos.pop(0)
                        feitos += 1
    
    # ============================================================
    # PASSO 2: AGENDAR até 2 shorts (09:00, 14:00)
    # ============================================================
    shorts_agendados = 0
    while shorts_agendados < 2 and shorts and usados_hoje + CUSTO_UPLOAD <= LIMITE_DIA:
        s_short = proximos_slots_scheduled(ag, "short", 1)
        if not s_short:
            log("sem slots agendados livres para shorts")
            break
        iso, dia, hhmm = s_short[0]
        vid, mp4, _, _ = shorts[0]
        meta = json.load(open(os.path.join(EXPORTS, vid, "metadados_publicacao.json")))
        
        if ja_publicado(meta.get("titulo_otimizado"), ignora_pasta=os.path.join(EXPORTS, vid)):
            log(f"⚠️ Pula {vid}: duplicado"); shorts.pop(0)
            continue
        
        if not dry:
            yt_id = upload_video(yt, mp4, meta, iso, "private", tipo="short")
            if yt_id:
                ag["slots_usados"][iso] = vid
                ag["quota"][hoje] = usados_hoje + CUSTO_UPLOAD
                usados_hoje = ag["quota"][hoje]
                marcar_agendado(vid, yt_id, iso, tipo="short")
                shorts.pop(0)
                shorts_agendados += 1
                feitos += 1
            else:
                break
        else:
            log(f"[DRY] {vid} (short) → agendar {iso}")
            ag["slots_usados"][iso] = vid
            usados_hoje += CUSTO_UPLOAD
            shorts.pop(0)
            shorts_agendados += 1
            feitos += 1
    
    # ============================================================
    # PASSO 3: PUBLICAR RESTO DOS SHORTS IMEDIATAMENTE (public)
    # ============================================================
    while shorts and usados_hoje + CUSTO_UPLOAD <= LIMITE_DIA:
        vid, mp4, _, _ = shorts[0]
        meta = json.load(open(os.path.join(EXPORTS, vid, "metadados_publicacao.json")))
        
        if ja_publicado(meta.get("titulo_otimizado"), ignora_pasta=os.path.join(EXPORTS, vid)):
            log(f"⚠️ Pula {vid}: duplicado"); shorts.pop(0)
            continue
        
        if not dry:
            yt_id = upload_video(yt, mp4, meta, None, "public", tipo="short")
            if yt_id:
                ag["quota"][hoje] = usados_hoje + CUSTO_UPLOAD
                usados_hoje = ag["quota"][hoje]
                marcar_publicado(vid, yt_id, tipo="short")
                shorts.pop(0)
                feitos += 1
                log(f"✔ {vid} PUBLICADO AGORA como {yt_id}")
            else:
                break
        else:
            log(f"[DRY] {vid} (short) → PUBLICAR AGORA")
            usados_hoje += CUSTO_UPLOAD
            shorts.pop(0)
            feitos += 1
    
    if dry:
        log("[DRY] nada foi gravado."); return
    
    try:
        import subprocess
        subprocess.run(["node", os.path.join(WS, "scripts/sync_catalogo.mjs")], cwd=WS, env={**os.environ, "OPENCORP_WORKSPACE": WS}, capture_output=True)
    except Exception as e:
        log("nota: sync do catálogo:", e)
    log(f"ciclo encerrado: {feitos} vídeo(s) processado(s) hoje.")

def upload_video(yt, mp4, meta, publish_at, privacy_status, tipo="short"):
    """Upload único: retorna yt_id ou None se falhar"""
    from googleapiclient.http import MediaFileUpload
    from googleapiclient.errors import HttpError
    
    corpo = {
        "snippet": {
            "title": meta.get("titulo_otimizado", os.path.basename(mp4))[:100],
            "description": meta.get("descricao", "🚫 Bit Proibido — projeto do https://crom.run | @bitproibido no YouTube e TikTok") + "\n\n🎬 Colab: @crom_run — base: https://crom.run",
            "tags": meta.get("tags", ["tecnologia", "shorts" if tipo == "short" else "noticias"]),
            "categoryId": "28",
        },
        "status": {
            "privacyStatus": privacy_status,
            "selfDeclaredMadeForKids": False,
        },
    }
    if publish_at:
        corpo["status"]["publishAt"] = publish_at
    
    media = MediaFileUpload(mp4, chunksize=4 * 1024 * 1024, resumable=True, mimetype="video/mp4")
    try:
        req = yt.videos().insert(part="snippet,status", body=corpo, media_body=media)
        resp = None
        while resp is None:
            status, resp = req.next_chunk()
            if status: log(f"  upload: {int(status.progress()*100)}%")
        yt_id = resp["id"]
        
        # Thumbnail
        capa_path = os.path.join(os.path.dirname(mp4), "capa.png")
        if os.path.exists(capa_path):
            try:
                yt.thumbnails().set(videoId=yt_id, media_body=MediaFileUpload(capa_path, mimetype="image/png")).execute()
                log(f"  ✔ thumbnail definida")
            except Exception as e_th:
                log(f"  ⚠️ thumbnail: {e_th}")
        
        if publish_at:
            log(f"✔ Agendado {yt_id} para {publish_at}")
        else:
            log(f"✔ PUBLICADO AGORA {yt_id}")
        return yt_id
    except HttpError as e:
        msg = str(e)
        log(f"✖ erro upload: {e.status_code} {msg[:200]}")
        if "quotaExceeded" in msg:
            raise
        if e.status_code in (403, 400) and ("has not been used" in msg or "disabled" in msg or "invalid" in msg.lower()):
            raise
        return None

def adiar(vid_ou_yt_id, novo_iso):
    from googleapiclient.discovery import build
    creds = credenciais()
    if not creds:
        log("SEM TOKEN: rode --auth primeiro."); sys.exit(1)
    yt = build("youtube", "v3", credentials=creds, cache_discovery=False)
    ag = carregar_agenda()
    yt_id = None; vid_alvo = None; meta_path = None
    for p in glob.glob(os.path.join(EXPORTS, "*", "metadados_publicacao.json")) + glob.glob(os.path.join(LONGOS, "*", "metadados_publicacao.json")):
        try:
            m = json.load(open(p))
            vd = os.path.basename(os.path.dirname(p))
            if vd == vid_ou_yt_id or m.get("youtube_video_id") == vid_ou_yt_id:
                vid_alvo = vd; yt_id = m.get("youtube_video_id"); meta_path = p; break
        except Exception:
            pass
    if not yt_id:
        log(f"✖ Vídeo {vid_ou_yt_id} não encontrado."); sys.exit(1)
    log(f"Adiando {vid_alvo} ({yt_id}) para {novo_iso}...")
    yt.videos().update(part="status", body={"id": yt_id, "status": {"privacyStatus": "private", "publishAt": novo_iso, "selfDeclaredMadeForKids": False}}).execute()
    for slot, v in list(ag.get("slots_usados", {}).items()):
        if v == vid_alvo: del ag["slots_usados"][slot]
    ag.setdefault("slots_usados", {})[novo_iso] = vid_alvo
    salvar_agenda(ag)
    if meta_path:
        m = json.load(open(meta_path))
        m["youtube_publish_at"] = novo_iso
        json.dump(m, open(meta_path, "w"), ensure_ascii=False, indent=2)
    log(f"✔ Reagendado para {novo_iso}.")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--auth", action="store_true")
    ap.add_argument("--paste", type=str, default=None)
    ap.add_argument("--auto", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--tipo", type=str, default=None, choices=["short", "shorts", "long", "longo", "boletim", "todos"])
    ap.add_argument("--boletim", action="store_true")
    ap.add_argument("--longo", action="store_true")
    ap.add_argument("--adiar", type=str, default=None)
    ap.add_argument("--para", type=str, default=None)
    args = ap.parse_args()

    tipo_sel = None
    if args.boletim or args.longo or args.tipo in ("long", "longo", "boletim"):
        tipo_sel = "long"
    elif args.tipo in ("short", "shorts"):
        tipo_sel = "short"

    if args.auth: auth_flow()
    elif args.paste: auth_paste(args.paste)
    elif args.adiar:
        if not args.para:
            print("Informe --para 'YYYY-MM-DDTHH:MM:SS-03:00'"); sys.exit(1)
        adiar(args.adiar, args.para)
    elif args.auto or args.dry_run or args.boletim or args.longo or args.tipo:
        auto(dry=args.dry_run, tipo_filtro=tipo_sel)
    else:
        print("uso: --auth | --paste '<url>' | --auto [--tipo short|longo] | --boletim | --dry-run | --adiar <id> --para <iso>")