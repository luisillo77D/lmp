import { getAllPlayersWithStats, getTeamsWithStandings } from "@/lib/data-service";
import { PlayersExplorer } from "@/components/players-explorer";

export default async function PlayersPage() {
  const [{ players, source }, { teams }] = await Promise.all([
    getAllPlayersWithStats(),
    getTeamsWithStandings(),
  ]);

  const teamOptions = teams.map((t) => ({
    id: t.id,
    name: t.name,
    abbreviation: t.abbreviation,
  }));

  return (
    <div className="space-y-10">
      <section className="flex flex-col justify-between gap-4 border-b border-stone-200/90 pb-6 sm:flex-row sm:items-end">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-800">
            Rosters, Bateo y Cuerpo de Lanzadores
          </p>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
            Registro de Jugadores y Líderes
          </h1>
          <p className="text-sm text-stone-600">
            Explora los {players.length} jugadores activos de la LMP por club, perfil de bateo/pitcheo, OPS, ERA y WHIP.
          </p>
        </div>

        <span className="text-xs text-stone-500">
          Fuente: {source === "supabase" ? "Base de Datos Supabase" : "API Oficial MLB en Vivo"}
        </span>
      </section>

      <PlayersExplorer players={players} teams={teamOptions} />
    </div>
  );
}
