import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { getGameDetailWithBoxscore } from "@/lib/data-service";
import { MlbBoxscorePlayer, MlbBoxscoreTeam } from "@/lib/mlb-api";

interface GameDetailPageProps {
  params: Promise<{ gamePk: string }>;
}

export default async function GameDetailPage({ params }: GameDetailPageProps) {
  const { gamePk } = await params;
  const numericGamePk = Number.parseInt(gamePk, 10);
  if (!Number.isFinite(numericGamePk)) {
    notFound();
  }

  const { matchup, boxscore } = await getGameDetailWithBoxscore(numericGamePk);

  if (!matchup) {
    notFound();
  }

  const { awayTeam, homeTeam, analysis } = matchup;

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <Link
          href={`/?date=${matchup.officialDate}`}
          className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-[#F3EDE2] transition shadow-2xs"
        >
          <ArrowLeft className="h-4 w-4 text-amber-800" />
          Volver a la cartelera del {matchup.officialDate}
        </Link>
        <span className="flex items-center gap-1.5 text-xs font-medium text-stone-600">
          <MapPin className="h-3.5 w-3.5 text-amber-800" />
          {matchup.venueName}
        </span>
      </div>

      {/* Matchup Header Banner */}
      <section className="rounded-2xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-xs">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 items-center">
          <div className="space-y-1.5">
            <span className="inline-block rounded-md bg-[#F3EDE2] px-2.5 py-1 font-mono text-xs font-semibold text-stone-700 border border-stone-200">
              Visitante · {awayTeam.abbreviation}
            </span>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-stone-900">
              {awayTeam.name}
            </h1>
            <p className="text-sm text-stone-600">
              Récord: {awayTeam.wins}-{awayTeam.losses} ({awayTeam.winningPercentage.toFixed(3)}) ·
              Gira: {awayTeam.awayWins}-{awayTeam.awayLosses}
            </p>
            <p className="pt-1 text-xs text-stone-600">
              Abridor Probable:{" "}
              <strong className="text-stone-900">
                {matchup.probableAwayPitcher
                  ? `${matchup.probableAwayPitcher.fullName} (${matchup.probableAwayPitcher.pitchHand})`
                  : "Por anunciar"}
              </strong>
            </p>
          </div>

          <div className="flex flex-col items-center justify-center rounded-2xl border border-stone-200 bg-[#FAF6F0] p-6 text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-800">
              {matchup.statusCode === "F"
                ? "Marcador Final y Proyección"
                : "Marcador Proyectado"}
            </span>
            {matchup.statusCode === "F" || matchup.statusCode === "I" ? (
              <div className="my-2 font-mono text-3xl font-bold text-stone-900">
                {matchup.awayScore ?? 0} - {matchup.homeScore ?? 0}
              </div>
            ) : null}
            <div className="my-1 font-serif text-2xl font-bold text-amber-900">
              {awayTeam.abbreviation} {analysis.projectedAwayRuns} – {homeTeam.abbreviation}{" "}
              {analysis.projectedHomeRuns}
            </div>
            <p className="text-xs font-mono text-stone-500">
              Total Est: {analysis.projectedTotalRuns} C · Ventaja:{" "}
              {analysis.projectedMargin > 0
                ? `${homeTeam.abbreviation} por ${analysis.projectedMargin}`
                : `${awayTeam.abbreviation} por ${Math.abs(analysis.projectedMargin)}`}
            </p>
          </div>

          <div className="space-y-1.5 md:text-right">
            <span className="inline-block rounded-md bg-[#F3EDE2] px-2.5 py-1 font-mono text-xs font-semibold text-stone-700 border border-stone-200">
              Local · {homeTeam.abbreviation}
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-stone-900">
              {homeTeam.name}
            </h2>
            <p className="text-sm text-stone-600">
              Récord: {homeTeam.wins}-{homeTeam.losses} ({homeTeam.winningPercentage.toFixed(3)}) ·
              Casa: {homeTeam.homeWins}-{homeTeam.homeLosses}
            </p>
            <p className="pt-1 text-xs text-stone-600">
              Abridor Probable:{" "}
              <strong className="text-stone-900">
                {matchup.probableHomePitcher
                  ? `${matchup.probableHomePitcher.fullName} (${matchup.probableHomePitcher.pitchHand})`
                  : "Por anunciar"}
              </strong>
            </p>
          </div>
        </div>
      </section>

      {/* 3 Market Recommendations */}
      <section className="space-y-4">
        <h2 className="font-serif text-xl font-bold text-stone-900">
          Jugadas Sugeridas (Ganador, Hándicap ±1.5 y Totales)
        </h2>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            analysis.markets.moneyline,
            analysis.markets.runline,
            analysis.markets.totals,
          ].map((m) => (
            <div
              key={m.market}
              className="rounded-2xl border border-stone-200 bg-white p-6 space-y-2 shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  {m.market}
                </span>
                <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  Confianza {m.confidence}
                </span>
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <span className="font-serif text-2xl font-bold text-stone-900">{m.pick}</span>
                <span className="font-mono text-xs font-semibold text-amber-800">{m.line}</span>
              </div>
              <p className="text-xs leading-relaxed text-stone-600 pt-1">{m.rationale}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4-Factor Scorecard Rationale */}
      <section className="space-y-4">
        <h2 className="font-serif text-xl font-bold text-stone-900">
          Desglose de los 4 Factores
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          {analysis.factors.map((f) => (
            <div
              key={f.category}
              className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3 shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-serif text-base font-bold text-stone-900">
                  {f.label}
                </span>
                <span className="rounded-full bg-amber-50 border border-amber-200 px-3 py-0.5 text-xs font-semibold text-amber-900">
                  {f.advantage === "home"
                    ? `Ventaja ${homeTeam.abbreviation} (+${f.score})`
                    : f.advantage === "away"
                    ? `Ventaja ${awayTeam.abbreviation} (+${Math.abs(f.score)})`
                    : "Parejo"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#FAF6F0] border border-stone-200/70 p-3.5 text-xs">
                <div>
                  <span className="block text-[11px] font-medium text-stone-500">
                    {awayTeam.shortName}
                  </span>
                  <span className="font-mono font-medium text-stone-800">{f.awayValue}</span>
                </div>
                <div className="text-right">
                  <span className="block text-[11px] font-medium text-stone-500">
                    {homeTeam.shortName}
                  </span>
                  <span className="font-mono font-medium text-stone-800">{f.homeValue}</span>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-stone-600">{f.summary}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Official Boxscore Section */}
      {boxscore?.teams?.away && boxscore?.teams?.home && (
        <section className="space-y-4">
          <h2 className="font-serif text-xl font-bold text-stone-900">
            Boxscore Oficial y Trabajo del Bullpen
          </h2>

          <div className="grid gap-6 lg:grid-cols-2">
            <TeamBoxscoreTable
              title={`${awayTeam.name} (${awayTeam.abbreviation})`}
              boxTeam={boxscore.teams.away}
            />
            <TeamBoxscoreTable
              title={`${homeTeam.name} (${homeTeam.abbreviation})`}
              boxTeam={boxscore.teams.home}
            />
          </div>
        </section>
      )}
    </div>
  );
}

function TeamBoxscoreTable({
  title,
  boxTeam,
}: {
  title: string;
  boxTeam: MlbBoxscoreTeam;
}) {
  const playersList: MlbBoxscorePlayer[] = Object.values(boxTeam.players ?? {});

  const batters = playersList.filter(
    (p) =>
      p.stats?.batting &&
      ((p.stats.batting.atBats ?? 0) > 0 ||
        (p.stats.batting.runs ?? 0) > 0 ||
        (p.stats.batting.baseOnBalls ?? 0) > 0)
  );

  const pitchers = playersList.filter(
    (p) =>
      p.stats?.pitching &&
      ((p.stats.pitching.outs ?? 0) > 0 || (p.stats.pitching.numberOfPitches ?? 0) > 0)
  );

  return (
    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-2xs">
      <div className="border-b border-stone-200 bg-[#F7F3EB] px-5 py-3.5 font-serif font-bold text-base text-stone-900">
        {title}
      </div>

      <div className="p-5 space-y-6">
        {/* Batting Table */}
        <div>
          <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-stone-500">
            Orden al Bat
          </h3>
          {batters.length === 0 ? (
            <p className="text-xs text-stone-500">
              Las estadísticas de bateo aparecerán cuando inicie el encuentro.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="py-2 pr-2">Bateador</th>
                    <th className="py-2 px-2 text-right">VB</th>
                    <th className="py-2 px-2 text-right">C</th>
                    <th className="py-2 px-2 text-right">H</th>
                    <th className="py-2 px-2 text-right">HR</th>
                    <th className="py-2 px-2 text-right">CP</th>
                    <th className="py-2 pl-2 text-right">BB/K</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200/60 font-mono">
                  {batters.map((b) => (
                    <tr key={b.person.id} className="text-stone-800">
                      <td className="py-2 pr-2 font-sans font-medium text-stone-900">
                        {b.person.fullName}{" "}
                        <span className="text-[11px] text-stone-500">
                          {b.position?.abbreviation}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right">{b.stats?.batting?.atBats ?? 0}</td>
                      <td className="py-2 px-2 text-right">{b.stats?.batting?.runs ?? 0}</td>
                      <td className="py-2 px-2 text-right font-semibold text-amber-900">
                        {b.stats?.batting?.hits ?? 0}
                      </td>
                      <td className="py-2 px-2 text-right">{b.stats?.batting?.homeRuns ?? 0}</td>
                      <td className="py-2 px-2 text-right">{b.stats?.batting?.rbi ?? 0}</td>
                      <td className="py-2 pl-2 text-right text-stone-500">
                        {b.stats?.batting?.baseOnBalls ?? 0}/{b.stats?.batting?.strikeOuts ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pitching & Bullpen Table */}
        <div>
          <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-stone-500">
            Pitcheo y Relevo
          </h3>
          {pitchers.length === 0 ? (
            <p className="text-xs text-stone-500">
              El registro de lanzadores aparecerá cuando inicie el encuentro.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="py-2 pr-2">Lanzador</th>
                    <th className="py-2 px-2 text-right">IP</th>
                    <th className="py-2 px-2 text-right">H</th>
                    <th className="py-2 px-2 text-right">CL</th>
                    <th className="py-2 px-2 text-right">BB</th>
                    <th className="py-2 px-2 text-right">K</th>
                    <th className="py-2 pl-2 text-right">Pitcheos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200/60 font-mono">
                  {pitchers.map((p, idx) => (
                    <tr key={p.person.id} className="text-stone-800">
                      <td className="py-2 pr-2 font-sans font-medium text-stone-900">
                        {p.person.fullName}{" "}
                        <span className="rounded bg-[#F3EDE2] px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">
                          {idx === 0 ? "ABR" : "REL"}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right">
                        {p.stats?.pitching?.inningsPitched ?? "0.0"}
                      </td>
                      <td className="py-2 px-2 text-right">{p.stats?.pitching?.hits ?? 0}</td>
                      <td className="py-2 px-2 text-right font-semibold text-amber-900">
                        {p.stats?.pitching?.earnedRuns ?? 0}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {p.stats?.pitching?.baseOnBalls ?? 0}
                      </td>
                      <td className="py-2 px-2 text-right font-semibold text-emerald-800">
                        {p.stats?.pitching?.strikeOuts ?? 0}
                      </td>
                      <td className="py-2 pl-2 text-right text-stone-500">
                        {p.stats?.pitching?.numberOfPitches ?? 0}p
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
