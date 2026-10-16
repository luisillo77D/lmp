import { getTeamsWithStandings } from "@/lib/data-service";

export default async function TeamsPage() {
  const { teams, source } = await getTeamsWithStandings();

  const bestOffense = [...teams].sort((a, b) => b.runsScored - a.runsScored)[0];
  const bestRunDiff = [...teams].sort((a, b) => b.runDifferential - a.runDifferential)[0];
  const bestHomeTeam = [...teams].sort((a, b) => b.homeWins - a.homeWins)[0];

  return (
    <div className="space-y-10">
      <section className="flex flex-col justify-between gap-4 border-b border-stone-200/90 pb-6 sm:flex-row sm:items-end">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-800">
            Temporada Regular 2026
          </p>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
            Posiciones y Rendimiento por Club
          </h1>
          <p className="text-sm text-stone-600">
            Diferencial de carreras, récords de local y visitante, y promedio de anotación de los 10 equipos de la LMP.
          </p>
        </div>

        <span className="text-xs text-stone-500">
          Fuente: {source === "supabase" ? "Base de Datos Supabase" : "API Oficial MLB en Vivo"}
        </span>
      </section>

      {/* Highlight Summary Cards */}
      {teams.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
              Mejor Ofensiva
            </p>
            <p className="mt-1.5 font-serif text-2xl font-bold text-stone-900">
              {bestOffense?.name}
            </p>
            <p className="mt-1 font-mono text-xs text-stone-600">
              {bestOffense?.runsScored} Carreras Anotadas (
              {(
                bestOffense.runsScored /
                Math.max(bestOffense.wins + bestOffense.losses, 1)
              ).toFixed(2)}{" "}
              C/J)
            </p>
          </div>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
              Mejor Diferencial de Carreras
            </p>
            <p className="mt-1.5 font-serif text-2xl font-bold text-stone-900">
              {bestRunDiff?.name}
            </p>
            <p className="mt-1 font-mono text-xs text-stone-600">
              {bestRunDiff && bestRunDiff.runDifferential > 0
                ? `+${bestRunDiff.runDifferential}`
                : bestRunDiff?.runDifferential}{" "}
              Dif ({bestRunDiff?.runsScored} CA / {bestRunDiff?.runsAllowed} CP)
            </p>
          </div>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-600">
              Más Fuerte en Casa
            </p>
            <p className="mt-1.5 font-serif text-2xl font-bold text-stone-900">
              {bestHomeTeam?.name}
            </p>
            <p className="mt-1 font-mono text-xs text-stone-600">
              {bestHomeTeam?.homeWins}-{bestHomeTeam?.homeLosses} en {bestHomeTeam?.venueName}
            </p>
          </div>
        </section>
      )}

      {/* Standings Table */}
      <section className="rounded-2xl border border-stone-200/90 bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-[#F7F3EB] text-xs font-semibold uppercase tracking-wider text-stone-600">
                <th className="py-4 pl-6 pr-3">#</th>
                <th className="py-4 px-3">Equipo</th>
                <th className="py-4 px-3 text-right">JG</th>
                <th className="py-4 px-3 text-right">JP</th>
                <th className="py-4 px-3 text-right">PCT</th>
                <th className="py-4 px-3 text-right">JV</th>
                <th className="py-4 px-3 text-right">CA</th>
                <th className="py-4 px-3 text-right">CP</th>
                <th className="py-4 px-3 text-right">DIF</th>
                <th className="py-4 px-3 text-right">C/J</th>
                <th className="py-4 px-3 text-center">Local</th>
                <th className="py-4 px-3 text-center">Visita</th>
                <th className="py-4 pl-3 pr-6 text-center">Racha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200/70 font-mono text-xs">
              {teams.map((team, idx) => {
                const gp = Math.max(team.wins + team.losses, 1);
                const rpg = (team.runsScored / gp).toFixed(2);
                const isPositiveDiff = team.runDifferential > 0;
                const isNegativeDiff = team.runDifferential < 0;

                return (
                  <tr
                    key={team.id}
                    className="hover:bg-[#FAF6F0] transition text-stone-800"
                  >
                    <td className="py-4 pl-6 pr-3 font-semibold text-stone-400">
                      {idx + 1}
                    </td>
                    <td className="py-4 px-3 font-sans">
                      <div className="flex items-center gap-3">
                        <span className="rounded-md bg-[#F3EDE2] px-2 py-0.5 font-mono text-xs font-bold text-amber-900 border border-stone-200">
                          {team.abbreviation}
                        </span>
                        <div>
                          <p className="font-serif font-bold text-stone-900 text-base">
                            {team.name}
                          </p>
                          <p className="text-xs text-stone-500">{team.venueName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-3 text-right font-bold text-stone-900">
                      {team.wins}
                    </td>
                    <td className="py-4 px-3 text-right text-stone-600">
                      {team.losses}
                    </td>
                    <td className="py-4 px-3 text-right font-bold text-amber-900">
                      {team.winningPercentage.toFixed(3)}
                    </td>
                    <td className="py-4 px-3 text-right text-stone-500">
                      {team.gamesBack}
                    </td>
                    <td className="py-4 px-3 text-right text-stone-800">
                      {team.runsScored}
                    </td>
                    <td className="py-4 px-3 text-right text-stone-800">
                      {team.runsAllowed}
                    </td>
                    <td
                      className={`py-4 px-3 text-right font-bold ${
                        isPositiveDiff
                          ? "text-emerald-800"
                          : isNegativeDiff
                          ? "text-red-700"
                          : "text-stone-500"
                      }`}
                    >
                      {isPositiveDiff ? `+${team.runDifferential}` : team.runDifferential}
                    </td>
                    <td className="py-4 px-3 text-right font-semibold text-stone-900">
                      {rpg}
                    </td>
                    <td className="py-4 px-3 text-center text-stone-600">
                      {team.homeWins}-{team.homeLosses}
                    </td>
                    <td className="py-4 px-3 text-center text-stone-600">
                      {team.awayWins}-{team.awayLosses}
                    </td>
                    <td className="py-4 pl-3 pr-6 text-center">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          team.streakCode.startsWith("W")
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : team.streakCode.startsWith("L")
                            ? "bg-red-50 text-red-800 border border-red-200"
                            : "bg-stone-100 text-stone-600"
                        }`}
                      >
                        {team.streakCode}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
