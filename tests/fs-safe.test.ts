import { describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mkdirRecursive, pathExists, writeFileAtomic } from "../src/utils/fs-safe.js";

async function tmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "opencorp-fs-safe-"));
}

describe("mkdirRecursive", () => {
  it("cria diretórios aninhados", async () => {
    const base = await tmpDir();
    const alvo = join(base, "a", "b", "c");
    await mkdirRecursive(alvo);
    expect(await pathExists(alvo)).toBe(true);
  });

  it("é idempotente e retorna o caminho resolvido", async () => {
    const base = await tmpDir();
    const alvo = join(base, "x", "y");
    const primeira = await mkdirRecursive(alvo);
    const segunda = await mkdirRecursive(alvo);
    expect(segunda).toBe(primeira);
    expect(segunda).toBe(resolve(alvo));
  });
});

describe("pathExists", () => {
  it("retorna false para caminho inexistente e true para existente", async () => {
    const base = await tmpDir();
    expect(await pathExists(join(base, "nada-aqui"))).toBe(false);
    expect(await pathExists(base)).toBe(true);
  });
});

describe("writeFileAtomic", () => {
  it("escreve conteúdo criando os diretórios pais", async () => {
    const base = await tmpDir();
    const alvo = join(base, "pasta", "sub", "arquivo.json");
    await writeFileAtomic(alvo, '{"ok":true}');
    expect(await readFile(alvo, "utf8")).toBe('{"ok":true}');
  });

  it("sobrescreve conteúdo anterior sem deixar temporários", async () => {
    const base = await tmpDir();
    const alvo = join(base, "arquivo.txt");
    await writeFileAtomic(alvo, "primeira");
    await writeFileAtomic(alvo, "segunda");
    expect(await readFile(alvo, "utf8")).toBe("segunda");
    const restantes = (await readdir(base)).filter((f) => f.includes(".tmp-"));
    expect(restantes).toEqual([]);
  });

  it("escreve Buffer preservando os bytes", async () => {
    const base = await tmpDir();
    const alvo = join(base, "binario.bin");
    const bytes = new Uint8Array([0, 1, 2, 254, 255]);
    await writeFileAtomic(alvo, bytes);
    expect(new Uint8Array(await readFile(alvo))).toEqual(bytes);
  });

  it("não deixa temporário quando o rename falha (alvo é diretório)", async () => {
    const base = await tmpDir();
    const alvo = join(base, "sou-diretorio");
    await mkdirRecursive(alvo);
    await expect(writeFileAtomic(alvo, "conteudo")).rejects.toThrow();
    const restantes = (await readdir(base)).filter((f) => f.includes(".tmp-"));
    expect(restantes).toEqual([]);
  });
});
