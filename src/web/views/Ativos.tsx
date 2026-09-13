import { type Component, createSignal, onMount, createEffect, Show } from "solid-js";
import { Search } from "lucide-solid";
import { Button } from "../ui/Button";
import { showToast } from "../ui/Toast";
import { fetchApi } from "../lib/context";

export const AtivosView: Component = () => {
  const [busca, setBusca] = createSignal("");
  const [skills, setSkills] = createSignal<{ name: string; description: string; id: string }[]>([]);

  const carregarSkills = createEffect(async () => {
    try {
      const data = await fetchApi<{ skills: { name: string; description: string; id: string }[] }>("/skills").catch(() => ({ skills: [] }));
      setSkills(data.skills || []);
    } catch (err: any) {
      showToast("Erro: " + err.message, "erro");
    }
  });

  onMount(() => {
    void carregarSkills();
  });

  const handleSkillClick = (skillId: string) => {
    setBusca(skillId);
  };

  return (
    <div class="p-6 bg-zinc-950 rounded-xl border border-zinc-800">
      <h1 class="text-xl font-bold text-zinc-100" data-testid="ativos-heading">Loja de Skills</h1>
      <p class="text-zinc-400" id="skill-desc">Selecione uma skill para ver detalhes</p>
      <div class="flex flex-wrap gap-2 mb-4">
        {skills.map((skill) => (
          <Button
            key={skill.id}
            size="sm"
            variant="secondary"
            className="flex items-center gap-1.5 rounded-full text-[10px] font-medium px-2.5 py-0.5 bg-emerald-950/30 border border-emerald-800/40 text-emerald-300"
            onClick={() => handleSkillClick(skill.id)}
          >
            <Search size={10} class="text-emerald-300" /> {skill.name}
          </Button>
        ))}
      </div>
      {skills.length > 0 && (
        <p class="text-zinc-400 text-sm" id="skill-desc-detail">Tópicos principais: {skills[0].description}</p>
      )}
    </div>
  );
};