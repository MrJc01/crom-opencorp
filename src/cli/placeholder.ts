export function notImplementedAction(alvo: string): () => void {
  return () => {
    console.error(`erro: "${alvo}" ainda não está implementado (not implemented yet).`);
    console.error(
      "Este comando já está registrado no CLI e será implementado em uma etapa futura do plano (docs/10-plano-e-checklist.md).",
    );
    process.exitCode = 1;
  };
}
