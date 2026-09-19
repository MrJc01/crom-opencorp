#!/usr/bin/env node
/**
 * ESTEIRA REAL DE PRODUÇÃO DE VÍDEO v3 — YouTube Video Factory
 * Novidades desta versão (a pedido do dono: "falta imagem, movimento e alma"):
 *  1. PESQUISA DE IMAGENS REAIS por cena no Wikimedia Commons (livre/CC, com créditos).
 *     Cache local em assets/banco_imagens/ e arquivo creditos_imagens.txt por vídeo.
 *  2. MOVIMENTO: efeito Ken Burns (zoom-in lento alternado com pan) nas fotos + fade de corte.
 *  3. ALMA: trilha ambiente sintetizada (pad de acordes) mixada sob a narração + vinheta sutil
 *     + variação de paleta por cena + textos com fade-in.
 *  4. Pipeline anterior preservado: roteiro real obrigatório, Piper TTS, SRT/ASS dos tempos
 *     reais, validação duração==áudio e parecer com métricas reais.
 * Fallback: sem internet/sem imagem => cena com gradiente animado (vídeo nunca quebra).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ws = process.env.OPENCORP_WORKSPACE || path.resolve(__dirname, "..");
const registriesDir = path.join(ws, "registries");
const roteirosDir = path.join(registriesDir, "roteiros");
const exportsDir = path.join(ws, "exports/videos");
const auditoriasDir = path.join(registriesDir, "auditorias");
const bancoImagensDir = path.join(ws, "assets", "banco_imagens");
const tasksDbPath = path.join(ws, ".opencorp/tasks.db");

const PIPER_BIN = process.env.PIPER_BIN || "/home/j/.local/share/myvoice/piper/piper";
const PIPER_VOICE = process.env.PIPER_VOICE || "/home/j/.local/share/myvoice/pt_BR-faber-medium.onnx";
const FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const HANDLE = "@bitproibido";
const AVATAR = path.join(ws, "assets", "avatar.png");
const CANAIS = {
  youtube: "https://www.youtube.com/@bitproibido",
  tiktok: "https://www.tiktok.com/@bitproibido",
};
const PROJETO = "https://crom.run";
const ASSINATURA = `🚫 Bit Proibido — projeto do ${PROJETO} (@crom_run) | YouTube: @bitproibido | TikTok: @bitproibido`;
const LINHA_COLAB = `🎬 Colab: @crom_run — base do projeto: ${PROJETO}`;
const UA = "YouTubeFactoryBot/1.0 (autonomous video pipeline; workspace yt-factory-01)";

const W = 1080, H = 1920, FPS = 30;
const GRADIENTES = [
  { a: "0x0F172A", b: "0x1E3A8A" },  // azul brand
  { a: "0x020617", b: "0x155E75" },  // petróleo
  { a: "0x111827", b: "0x3B0764" },  // roxo profundo
];
const COR_LEGENDA_ASS = "&H00FFFFFF";
const COR_GANCHO_ASS = "&H0015CCFA";   // #FACC15 em BGR
const DRAW_YELLOW = "#FACC15", DRAW_DESTAQUE = "#38BDF8";

const GAP_HOOK = 0.12, GAP_CENA = 0.28, TAIL = 0.8;
const MUSICA_GAIN = 0.16;  // trilha em ~-16dB sob a voz

const log = (m) => console.log(m);

fs.mkdirSync(roteirosDir, { recursive: true });
fs.mkdirSync(exportsDir, { recursive: true });
fs.mkdirSync(auditoriasDir, { recursive: true });
fs.mkdirSync(bancoImagensDir, { recursive: true });

log("=== ESTEIRA REAL DE PRODUÇÃO v3 (Piper + FFMPEG + IMAGENS + TRILHA) ===");

// ---------- utilidades ----------
function dur(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  const d = parseFloat(out.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error(`Duração inválida para ${file}: ${out}`);
  return d;
}
const ttsText = (t) => t.replace(/%/g, " por cento").replace(/\s+/g, " ").trim();
function sintetizar(fala, outRel, cwd) {
  execFileSync(PIPER_BIN, ["-m", PIPER_VOICE, "-f", outRel], { input: fala, cwd, stdio: ["pipe", "ignore", "pipe"] });
  const d = dur(path.join(cwd, outRel));
  if (d < 0.3) throw new Error(`Áudio curto demais (${d}s) para cena: "${fala.slice(0, 40)}..."`);
  return d;
}
function gerarSilencio(segundos, outRel, cwd) {
  execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono", "-t", String(segundos), "-c:a", "pcm_s16le", outRel], { cwd, stdio: "ignore" });
}
function chunksFala(fala, maxChars = 48) {
  const words = fala.split(/\s+/).filter(Boolean);
  const chunks = []; let cur = "";
  for (const w of words) {
    const cand = cur ? cur + " " + w : w;
    if (cand.length > maxChars && cur) { chunks.push(cur); cur = w; } else cur = cand;
  }
  if (cur) chunks.push(cur);
  return chunks;
}
const assTime = (s) => {
  const cs = Math.round(s * 100);
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), sec = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
};
const srtTime = (s) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000), mil = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(mil).padStart(3, "0")}`;
};
const limpar = (t) => String(t).replace(/[{}]/g, "").replace(/\r?\n/g, " ").trim();
function wrapTxt(t, maxChars) {
  const words = String(t).split(/\s+/).filter(Boolean);
  const lines = []; let cur = "";
  for (const w of words) {
    const cand = cur ? cur + " " + w : w;
    if (cand.length > maxChars && cur) { lines.push(cur); cur = w; } else cur = cand;
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}
const stripHtml = (h) => String(h || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
const slug = (t) => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);

// ---------- 1. Pesquisa de imagens (Wikimedia Commons, livre) ----------
async function buscarImagem(consulta, destAbs) {
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  api.searchParams.set("action", "query");
  api.searchParams.set("format", "json");
  api.searchParams.set("generator", "search");
  api.searchParams.set("gsrsearch", `${consulta} filetype:bitmap`);
  api.searchParams.set("gsrnamespace", "6");
  api.searchParams.set("gsrlimit", "6");
  api.searchParams.set("prop", "imageinfo");
  api.searchParams.set("iiprop", "url|extmetadata|size|mime");
  api.searchParams.set("iiurlwidth", "1440");
  const res = await fetch(api, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) return null;
  const j = await res.json();
  const pages = Object.values(j?.query?.pages || {});
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || !/image\/(jpeg|png)/.test(ii.mime || "")) continue;
    if ((ii.width || 0) < 700) continue;
    try {
      const r2 = await fetch(ii.thumburl || ii.url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
      if (!r2.ok) continue;
      const buf = Buffer.from(await r2.arrayBuffer());
      if (buf.length < 25000) continue;
      fs.writeFileSync(destAbs, buf);
      return {
        titulo: p.title,
        fonte_url: ii.descriptionurl || ii.url,
        autor: stripHtml(ii.extmetadata?.Artist?.value) || "desconhecido",
        licenca: stripHtml(ii.extmetadata?.LicenseShortName?.value) || "ver fonte",
      };
    } catch { /* tenta próxima */ }
  }
  return null;
}

// ---------- 2. Seleção de pauta (roteiro real obrigatório) ----------
const pautasFile = path.join(registriesDir, "pautas.json");
if (!fs.existsSync(pautasFile)) { log("ERRO: registries/pautas.json ausente. Rode setup_inicial.mjs."); process.exit(1); }

function salvarPautasAtomico(caminho, dados) {
  const tmp = `${caminho}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), "utf8");
  fs.renameSync(tmp, caminho);
}

let dadosPautas;
try {
  dadosPautas = JSON.parse(fs.readFileSync(pautasFile, "utf8"));
  if (!dadosPautas || !Array.isArray(dadosPautas.pautas)) {
    throw new Error("Formato inválido: campo 'pautas' não é array.");
  }
} catch (err) {
  log(`ERRO ao ler registries/pautas.json: ${err.message}`);
  process.exit(1);
}
const candidatas = dadosPautas.pautas.filter((p) => p.status === "em_producao" || p.status === "pendente");
let pauta = null, roteiro = null;
for (const p of candidatas) {
  const rf = path.join(roteirosDir, `${p.id}.json`);
  if (!fs.existsSync(rf)) continue;
  try {
    const r = JSON.parse(fs.readFileSync(rf, "utf8"));
    if (Array.isArray(r?.cenas) && r.cenas.length >= 3 && r.cenas.every((c) => (c.fala || "").trim().length > 5)) {
      // Guarda: se já existe vídeo renderizado com mesmo título/tema, pula e marca pauta
      const titNorm = (r.titulo_escolhido || p.titulo_a || "").toLowerCase().replace(/[^\w\s]/g, "").trim();
      let jaProduzido = false;
      if (fs.existsSync(exportsDir)) {
        for (const vFolder of fs.readdirSync(exportsDir)) {
          const metaPath = path.join(exportsDir, vFolder, "metadados_publicacao.json");
          if (fs.existsSync(metaPath)) {
            try {
              const m = JSON.parse(fs.readFileSync(metaPath, "utf8"));
              const tExist = (m.titulo_otimizado || m.titulo || "").toLowerCase().replace(/[^\w\s]/g, "").trim();
              if (tExist && (tExist === titNorm || (titNorm.length > 20 && tExist.includes(titNorm)))) {
                jaProduzido = true;
                break;
              }
            } catch {}
          }
        }
      }
      if (jaProduzido) {
        log(`Pauta [${p.id}] "${p.titulo_a}" já possui vídeo gerado no catálogo. Marcando como duplicado.`);
        p.status = "duplicado";
        salvarPautasAtomico(pautasFile, dadosPautas);
        continue;
      }
      pauta = p; roteiro = r; break;
    }
  } catch { /* roteiro inválido => ignora */ }
}
if (!pauta) {
  log("NADA A PRODUZIR: nenhuma pauta pendente possui roteiro real em registries/roteiros/.");
  log(">>> Ciclo encerrado SEM fabricar vídeo genérico.");
  process.exit(0);
}
log(`Pauta Selecionada: [${pauta.id}] ${pauta.titulo_a}`);

// ---------- 3. Diretórios ----------
const videoId = roteiro.video_id || `vid-${Date.now().toString(36)}`;
const videoDir = path.join(exportsDir, videoId);
const renderDir = path.join(videoDir, "render");
const audioDir = path.join(videoDir, "audio");
fs.mkdirSync(videoDir, { recursive: true });
fs.mkdirSync(renderDir, { recursive: true });
fs.mkdirSync(audioDir, { recursive: true });

const tituloTela = String(roteiro.titulo_escolhido || pauta.titulo_a).replace(/\s*\(Revelado\)\s*/i, "").toUpperCase();
fs.writeFileSync(path.join(videoDir, "roteiro.json"), JSON.stringify({ ...roteiro, video_id: videoId }, null, 2));

// ---------- 4. TTS + timeline real ----------
const cenasInfo = [];
let start = 0;
const n = roteiro.cenas.length;
for (let i = 0; i < n; i++) {
  const c = roteiro.cenas[i];
  const d = sintetizar(ttsText(c.fala), `audio/cena-${i + 1}.wav`, videoDir);
  const gap = i === n - 1 ? TAIL : (i === 0 ? GAP_HOOK : GAP_CENA);
  cenasInfo.push({ idx: i + 1, tipo: c.tipo || "", fala: c.fala, texto_tela: c.texto_tela || "", imagens: c.imagens || [], start, dur: d, gap, visDur: d + gap });
  start += d + gap;
  log(`  Cena ${i + 1} [${c.tipo}] — ${d.toFixed(2)}s`);
}
const duracaoAudio = start;
log(`Narração total (real): ${duracaoAudio.toFixed(2)}s`);

// ---------- 5. Áudio concatenado ----------
gerarSilencio(GAP_HOOK, "audio/sil-hook.wav", videoDir);
gerarSilencio(GAP_CENA, "audio/sil-gap.wav", videoDir);
gerarSilencio(TAIL, "audio/sil-tail.wav", videoDir);
const concatList = [];
cenasInfo.forEach((c, i) => {
  concatList.push(`file 'cena-${c.idx}.wav'`);
  concatList.push(`file '${i === 0 ? "sil-hook.wav" : i === n - 1 ? "sil-tail.wav" : "sil-gap.wav"}'`);
});
fs.writeFileSync(path.join(videoDir, "audio", "concat.txt"), concatList.join("\n") + "\n");
execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", "audio/concat.txt", "-c:a", "pcm_s16le", "audio/narracao.wav"], { cwd: videoDir, stdio: "ignore" });
const narrDur = dur(path.join(videoDir, "audio/narracao.wav"));
log(`Áudio concatenado: ${narrDur.toFixed(2)}s`);

// ---------- 6. Busca de imagens por cena (com cache e créditos) ----------
const creditos = [];
await Promise.all(cenasInfo.map(async (c) => {
  c.imagem = null;
  for (const consulta of c.imagens.slice(0, 2)) {
    const cacheFile = path.join(bancoImagensDir, `${slug(consulta)}.jpg`);
    let info = null;
    if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 25000) {
      const metaFile = cacheFile.replace(/\.jpg$/, ".json");
      info = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : { titulo: consulta, fonte_url: "", autor: "cache", licenca: "ver fonte" };
      c.imagem = cacheFile; c.imagem_info = info; break;
    }
    try {
      info = await buscarImagem(consulta, cacheFile);
      if (info) {
        fs.writeFileSync(cacheFile.replace(/\.jpg$/, ".json"), JSON.stringify(info, null, 2));
        c.imagem = cacheFile; c.imagem_info = info; break;
      }
    } catch { /* sem internet ou sem resultado */ }
  }
  if (c.imagem) {
    creditos.push({ cena: c.idx, consulta: c.imagens[0], ...c.imagem_info });
    log(`  🖼 Cena ${c.idx}: imagem OK (${path.basename(c.imagem)})`);
  } else {
    log(`  ▒ Cena ${c.idx}: sem imagem => gradiente animado`);
  }
}));
if (creditos.length) {
  const credTxt = creditos.map((c) =>
    `Cena ${c.cena} — consulta: "${c.consulta}"\n  Arquivo: ${c.titulo}\n  Autor: ${c.autor}\n  Licença: ${c.licenca}\n  Fonte: ${c.fonte_url}\n`).join("\n");
  fs.writeFileSync(path.join(videoDir, "creditos_imagens.txt"),
    `# Créditos das imagens (Wikimedia Commons — obrigatório por licença)\n\n${credTxt}`);
}

// ---------- 7. Legendas: SRT (tempos reais) + ASS ----------
const cues = [];
for (const c of cenasInfo) {
  const parts = chunksFala(c.fala);
  const totalWords = c.fala.split(/\s+/).length;
  let acc = 0;
  for (const p of parts) {
    const nw = p.split(/\s+/).length;
    const s0 = c.start + (acc / totalWords) * c.dur;
    const s1 = c.start + ((acc + nw) / totalWords) * c.dur;
    cues.push({ s: s0, e: Math.max(s1, s0 + 0.8), texto: p, gancho: c.tipo === "HOOK" });
    acc += nw;
  }
}
fs.writeFileSync(path.join(videoDir, "legendas.srt"),
  cues.map((c, i) => `${i + 1}\n${srtTime(c.s)} --> ${srtTime(c.e)}\n${c.texto}\n`).join("\n"));

const assHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Legenda,DejaVu Sans,56,${COR_LEGENDA_ASS},${COR_LEGENDA_ASS},&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,4,1,2,70,70,240,1
Style: Gancho,DejaVu Sans,56,${COR_GANCHO_ASS},${COR_GANCHO_ASS},&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,4,1,2,70,70,240,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
fs.writeFileSync(path.join(videoDir, "legendas.ass"),
  assHeader + cues.map((c) => `Dialogue: 0,${assTime(c.s)},${assTime(c.e)},${c.gancho ? "Gancho" : "Legenda"},,0,0,0,,${limpar(c.texto)}`).join("\n") + "\n");
log(`Legendas: ${cues.length} sinais sincronizados.`);

// ---------- 8. Render por cena (foto com Ken Burns OU gradiente) ----------
fs.writeFileSync(path.join(videoDir, "render", "handle.txt"), HANDLE);
fs.writeFileSync(path.join(videoDir, "render", "hook.txt"), wrapTxt(tituloTela, 16));

const fadeTxt = "fade=t=in:st=0:d=0.22";
const vinheta = "vignette=angle=PI/6";
const alphaIn = "if(lt(t,0.35),t/0.35,1)";

cenasInfo.forEach((c, i) => {
  const seg = `render/seg-${c.idx}.mp4`;
  const vf = [
    `drawtext=fontfile='${FONT_BOLD}':textfile='render/handle.txt':fontsize=38:fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=14:alpha='${alphaIn}':x=(w-text_w)/2:y=110`
  ];
  if (c.tipo === "HOOK") {
    vf.push(`drawtext=fontfile='${FONT_BOLD}':textfile='render/hook.txt':fontsize=76:line_spacing=1.15:fontcolor=${DRAW_YELLOW}:borderw=8:bordercolor=black:alpha='${alphaIn}':x=(w-text_w)/2:y=h*0.26`);
  } else if (c.texto_tela) {
    fs.writeFileSync(path.join(videoDir, "render", `tela-${c.idx}.txt`), wrapTxt(limpar(c.texto_tela).toUpperCase(), 28));
    vf.push(`drawtext=fontfile='${FONT_BOLD}':textfile='render/tela-${c.idx}.txt':fontsize=56:line_spacing=1.15:fontcolor=${DRAW_DESTAQUE}:borderw=6:bordercolor=black:alpha='${alphaIn}':x=(w-text_w)/2:y=h*0.26`);
  }
  vf.push(vinheta);

  // avatar da marca no canto superior (92px, alinhado à linha do handle)
  const overlayAvatar = (chain) =>
    `[0:v]${chain}[base];[1:v]scale=92:92[av];[base][av]overlay=44:83[v]`;
  const codec = ["-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p"];

  if (c.imagem && fs.existsSync(c.imagem)) {
    // Ken Burns: cenas pares = zoom-in centrado; ímpares = pan lateral com zoom suave
    const kb = (i % 2 === 0)
      ? `zoompan=z='min(1.0+0.0008*in,1.16)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS}`
      : `zoompan=z='min(1.08+0.0004*in,1.2)':x='iw/2-(iw/zoom/2)+mod(in,2)*2':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS}`;
    execFileSync("ffmpeg", [
      "-y", "-loop", "1", "-framerate", String(FPS), "-i", c.imagem,
      "-loop", "1", "-framerate", String(FPS), "-i", AVATAR,
      "-t", c.visDur.toFixed(3),
      "-filter_complex", overlayAvatar(`scale=1620:2880:force_original_aspect_ratio=increase,crop=1620:2880,${kb},${fadeTxt},${vf.join(",")}`),
      "-map", "[v]", "-r", String(FPS), ...codec, seg
    ], { cwd: videoDir, stdio: ["ignore", "ignore", "pipe"] });
  } else {
    const g = GRADIENTES[i % GRADIENTES.length];
    execFileSync("ffmpeg", [
      "-y", "-f", "lavfi", "-i",
      `gradients=s=${W}x${H}:c0=${g.a}:c1=${g.b}:x0=0:y0=0:x1=${W}:y1=${H}:speed=0.035:duration=${c.visDur.toFixed(3)}`,
      "-loop", "1", "-framerate", String(FPS), "-i", AVATAR,
      "-t", c.visDur.toFixed(3),
      "-filter_complex", overlayAvatar(`${fadeTxt},${vf.join(",")}`),
      "-map", "[v]", "-r", String(FPS), ...codec, seg
    ], { cwd: videoDir, stdio: ["ignore", "ignore", "pipe"] });
  }
  log(`  Render: cena ${c.idx} (${c.visDur.toFixed(2)}s ${c.imagem ? "foto" : "gradiente"}) ✔`);
});
fs.writeFileSync(path.join(videoDir, "render", "list.txt"),
  cenasInfo.map((c) => `file 'seg-${c.idx}.mp4'`).join("\n") + "\n");
execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", "render/list.txt", "-c", "copy", "render/sem_audio.mp4"], { cwd: videoDir, stdio: "ignore" });

// ---------- 9. Trilha ambiente sintetizada (pad de acordes, sem APIs) ----------
const notas = [[110, 0.50], [164.81, 0.40], [220, 0.35], [261.63, 0.25], [329.63, 0.15]];
const termos = notas.map(([f, a]) => `${a}*sin(2*PI*${f}*t)`).join("+");
const padExpr = `0.5*(${termos})*(0.55+0.25*sin(2*PI*0.08*t))`;
execFileSync("ffmpeg", [
  "-y", "-f", "lavfi", "-i", `aevalsrc='${padExpr}':s=22050:d=${narrDur.toFixed(2)}`,
  "-af", `lowpass=f=1000,afade=t=in:st=0:d=2,afade=t=out:st=${Math.max(0, narrDur - 3).toFixed(2)}:d=3`,
  "-c:a", "pcm_s16le", "audio/trilha.wav"
], { cwd: videoDir, stdio: "ignore" });

// ---------- 10. Mux final: vídeo + narração + trilha + legendas gravadas ----------
execFileSync("ffmpeg", [
  "-y", "-i", "render/sem_audio.mp4", "-i", "audio/narracao.wav", "-i", "audio/trilha.wav",
  "-filter_complex",
  `[0:v]ass=legendas.ass[v];[2:a]volume=${MUSICA_GAIN},apad[mus];[1:a][mus]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.93[a]`,
  "-map", "[v]", "-map", "[a]",
  "-c:v", "libx264", "-preset", "fast", "-crf", "20",
  "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
  "-movflags", "+faststart", "-shortest", "video_final.mp4"
], { cwd: videoDir, stdio: ["ignore", "ignore", "pipe"] });

// ---------- 11. Validação REAL + capa ----------
const durVideo = dur(path.join(videoDir, "video_final.mp4"));
const delta = Math.abs(durVideo - narrDur);
const totalPalavras = roteiro.cenas.reduce((a, c) => a + c.fala.split(/\s+/).filter(Boolean).length, 0);
const wpm = Math.round(totalPalavras / (narrDur / 60));
const nFotos = cenasInfo.filter((c) => c.imagem).length;

const checks = [
  { nome: "sincronia_audio_video", pass: delta <= 0.7, valor: `Δ ${delta.toFixed(2)}s` },
  { nome: "duracao_meta_30_62s", pass: narrDur >= 30 && narrDur <= 62, valor: `${narrDur.toFixed(1)}s` },
  { nome: "ritmo_fala_130_175wpm", pass: wpm >= 130 && wpm <= 175, valor: `${wpm} wpm` },
  { nome: "cenas_com_audio", pass: cenasInfo.every((c) => c.dur > 0.3), valor: `${cenasInfo.length} cenas` },
  { nome: "dinamismo_visual", pass: nFotos >= Math.ceil(cenasInfo.length / 2), valor: `${nFotos}/${cenasInfo.length} cenas com foto` }
];
const falhas = checks.filter((c) => !c.pass);
const veredito = falhas.length === 0 ? "APROVADO" : (falhas.every((c) => ["duracao_meta_30_62s", "ritmo_fala_130_175wpm", "dinamismo_visual"].includes(c.nome)) ? "RESSALVAS" : "FAIL");
log(`Validação: vídeo ${durVideo.toFixed(2)}s · áudio ${narrDur.toFixed(2)}s · Δ ${delta.toFixed(2)}s · ${wpm} wpm · ${nFotos}/${cenasInfo.length} fotos · ${veredito}`);

try {
  execFileSync("ffmpeg", ["-y", "-ss", String(Math.min(1.8, narrDur * 0.35)), "-i", "video_final.mp4", "-frames:v", "1", "capa.png"], { cwd: videoDir, stdio: "ignore" });
} catch { /* capa é acessório */ }

// ---------- 12. Metadados SEO + parecer real ----------
const metadados = {
  titulo_otimizado: `${pauta.titulo_a} 🤯 #shorts`,
  titulo_ab_teste: roteiro.titulo_alternativo_b || pauta.titulo_b,
  descricao: `${cenasInfo[0].fala}\n\n${ASSINATURA}\n${LINHA_COLAB}\n\n▶️ YouTube: ${CANAIS.youtube}\n🎵 TikTok: ${CANAIS.tiktok}\n\n#tecnologia #programação #curiosidades #engenharia #shorts`,
  tags: ["tecnologia", "computação", "curiosidades", "engenharia", "shorts"],
  resolucao: "1080x1920 (Vertical 9:16)",
  duracao_real_segundos: Number(narrDur.toFixed(2)),
  visual: `${nFotos}/${cenasInfo.length} cenas com fotos Wikimedia Commons (Ken Burns) + trilha ambiente sintetizada`,
  creditos: "creditos_imagens.txt",
  canais: CANAIS,
  projeto: PROJETO,
  roteiro_fonte: `registries/roteiros/${pauta.id}.json`
};
fs.writeFileSync(path.join(videoDir, "metadados_publicacao.json"), JSON.stringify(metadados, null, 2));

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const parecerMd = `# PARECER DE AUDITORIA TÉCNICA — VÍDEO ${videoId}
**Data**: ${new Date().toISOString()}
**Pauta**: ${pauta.titulo_a}
**Avaliador**: @analista-qualidade (métricas medidas automaticamente da render real)

## 1. Métricas Medidas (não estimadas)
- **Duração da narração**: ${narrDur.toFixed(2)}s (ffprobe)
- **Duração do vídeo final**: ${durVideo.toFixed(2)}s · Sincronia: Δ ${delta.toFixed(2)}s
- **Ritmo de fala**: ${wpm} wpm (meta 130–175)
- **Cenas**: ${cenasInfo.length} · **Fotos reais (Commons/CC)**: ${nFotos} · **Trilha ambiente**: sintetizada (gain ${MUSICA_GAIN})
- **Voz**: Piper local pt_BR-faber-medium · legendas ASS gravadas (gancho amarelo)

## 2. Checklist de Aprovação
| Check | Status | Valor |
|---|---|---|
${checks.map((c) => `| ${c.nome} | ${c.pass ? "PASS" : "FAIL"} | ${c.valor} |`).join("\n")}

## 3. Veredito
**STATUS: ${veredito}**${falhas.length ? ` — falhas: ${falhas.map((f) => f.nome).join(", ")}` : ""}
`;
const parecerPath = path.join(auditoriasDir, `PARECER-VIDEO-${timestamp}.md`);
fs.writeFileSync(parecerPath, parecerMd);
log(`✔ Parecer real salvo em ${path.relative(ws, parecerPath)}`);

if (veredito === "FAIL") {
  log("PRODUÇÃO REPROVADA pela validação. Nenhuma pauta será marcada como concluída.");
  process.exit(1);
}

// ---------- 13. Atualizar pauta + Kanban ----------
pauta.status = "concluido";
pauta.video_gerado = videoId;
pauta.data_conclusao = new Date().toISOString();
salvarPautasAtomico(pautasFile, dadosPautas);
try {
  const db = new Database(tasksDbPath);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO tasks (id, titulo, descricao, coluna, pos, prioridade, labels, responsavel, criado_por, criado_em, atualizado_em)
    VALUES (?, ?, ?, 'feito', 50, 'alta', 'video,producao,youtube', 'agente:produtor-video', 'sistema:fabrica-video', ?, ?)
  `).run(`tsk-video-${videoId}`,
    `Vídeo Produzido: ${pauta.titulo_a}`,
    `Render v3 (Piper+ffmpeg+fotos Commons): ${narrDur.toFixed(1)}s, ${wpm} wpm, ${nFotos}/${cenasInfo.length} fotos, Δ ${delta.toFixed(2)}s. Saída: exports/videos/${videoId}.`,
    now, now);
  log("✔ Tarefa registrada no Kanban SQLite.");
} catch (err) {
  log("Nota Kanban:", err.message);
}
try { fs.rmSync(renderDir, { recursive: true, force: true }); } catch {}

// atualiza catálogo do miniapp (Estúdio de Publicação)
try {
  execFileSync(process.execPath, [path.join(__dirname, "sync_catalogo.mjs")], { env: { ...process.env, OPENCORP_WORKSPACE: ws }, stdio: "inherit" });
} catch (e) { log("Nota catálogo:", e.message); }

log(`=== PRODUÇÃO REAL v3 CONCLUÍDA: ${videoId} (${durVideo.toFixed(1)}s, ${nFotos} fotos) ===\n`);
