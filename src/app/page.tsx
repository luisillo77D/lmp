import Link from "next/link";
import { ArrowRight, Calendar, MapPin } from "lucide-react";
import { getSlateWithRecommendations, EnrichedGameMatchup } from "@/lib/data-service";

interface HomePageProps {
  searchParams: Promise<{ date?: string }>;
}

function ConfidencePill({ level }: { level: "Alta" | "Media" | "Moderada" }) {
  const styles =
    level === "Alta"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : level === "Media"
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : "bg-stone-100 text-stone-600 border-stone-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${styles}`}
    >
      {level}
    </span>
  );
}

function MarketStatusBadge({
  level,
  result,
}: {
  level: "Alta" | "Media" | "Moderada";
  result: "won" | "lost" | "pending";
}) {
  if (result === "won") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
        ✓ Acertado
      </span>
    );
  }
  if (result === "lost") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-stone-100 px-2.5 py-0.5 text-[11px] font-semibold text-stone-500">
        ✕ Fallado
      </span>
    );
  }
  return <ConfidencePill level={level} />;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const { activeDate, availableDates, games, systemRecord } =
    await getSlateWithRecommendations(params.date);

  // Extract featured picks of the day
  const featuredPicks: Array<{
    gamePk: number;
    matchupTitle: string;
    market: string;
    pick: string;
    line: string;
    confidence: "Alta" | "Media" | "Moderada";
    rationale: string;
    result: "won" | "lost" | "pending";
  }> = [];

  for (const g of games) {
    const title = `${g.awayTeam.shortName} en ${g.homeTeam.shortName}`;
    for (const m of [
      g.analysis.markets.moneyline,
      g.analysis.markets.runline,
      g.analysis.markets.totals,
    ]) {
      if (m.confidence === "Alta" || m.confidence === "Media") {
        featuredPicks.push({
          gamePk: g.gamePk,
          matchupTitle: title,
          market: m.market,
          pick: m.pick,
          line: m.line,
          confidence: m.confidence,
          rationale: m.rationale,
          result: m.result,
        });
      }
    }
  }

  featuredPicks.sort((a, b) =>
    a.confidence === "Alta" && b.confidence !== "Alta" ? -1 : 1
  );

  return (
    <div className="space-y-8">
      {/* Editorial Header & Date Strip */}
      <section className="space-y-5 border-b border-stone-200/90 pb-6">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-800">
              Guía Diaria de Juegos y Proyecciones
            </p>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
              Cartelera y Análisis de la Jornada
            </h1>
            <p className="text-sm text-stone-600 max-w-2xl">
              Proyección de carreras combinando abridores probables, descanso del bullpen y ritmo ofensivo de los últimos 5 juegos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-stone-200/90 bg-[#F3EDE2]/80 p-1.5">
            <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-stone-600">
              <Calendar className="h-3.5 w-3.5 text-amber-800" />
              Fecha
            </span>
            {availableDates.map((d) => {
              const isSelected = d === activeDate;
              const shortLabel = d.slice(5); // MM-DD
              return (
                <Link
                  key={d}
                  href={`/?date=${d}`}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    isSelected
                      ? "bg-amber-800 text-amber-50 shadow-xs"
                      : "text-stone-600 hover:bg-white/70 hover:text-stone-900"
                  }`}
                >
                  {shortLabel}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Compact System Recommendation Record Strip */}
        {systemRecord.gamesEvaluated > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200/90 bg-[#F7F3EB] px-4 py-2.5 text-xs text-stone-700">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="inline-flex items-center gap-1.5 font-semibold text-stone-900">
                <span className="h-2 w-2 rounded-full bg-emerald-700" />
                Récord del Sistema:{" "}
                <span className="font-mono text-emerald-900">
                  {systemRecord.overall.wins}-{systemRecord.overall.losses} (
                  {systemRecord.overall.pct}%)
                </span>
              </span>
              <span className="text-stone-300">·</span>
              <span>
                Ganador{" "}
                <strong className="font-mono font-semibold text-stone-900">
                  {systemRecord.moneyline.wins}-{systemRecord.moneyline.losses}
                </strong>
              </span>
              <span className="text-stone-300">·</span>
              <span>
                Hándicap{" "}
                <strong className="font-mono font-semibold text-stone-900">
                  {systemRecord.runline.wins}-{systemRecord.runline.losses}
                </strong>
              </span>
              <span className="text-stone-300">·</span>
              <span>
                Totales{" "}
                <strong className="font-mono font-semibold text-stone-900">
                  {systemRecord.totals.wins}-{systemRecord.totals.losses}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-stone-500">
              {systemRecord.highConfidence.wins + systemRecord.highConfidence.losses > 0 && (
                <span className="rounded-md border border-emerald-200 bg-emerald-50/80 px-2 py-0.5 font-medium text-emerald-800">
                  Confianza Alta:{" "}
                  <strong className="font-mono">
                    {systemRecord.highConfidence.wins}-{systemRecord.highConfidence.losses} (
                    {systemRecord.highConfidence.pct}%)
                  </strong>
                </span>
              )}
              <span>{systemRecord.gamesEvaluated} juegos finalizados</span>
            </div>
          </div>
        )}
      </section>

      {/* Featured Notebook Picks */}
      {featuredPicks.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-xl font-bold text-stone-900">
              Picks Destacados del Día ({activeDate})
            </h2>
            <span className="text-xs text-stone-500">
              Ganador · Hándicap (±1.5) · Totales de Juego Completo
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featuredPicks.slice(0, 4).map((item, idx) => (
              <Link
                key={`${item.gamePk}-${item.market}-${idx}`}
                href={`/games/${item.gamePk}`}
                className="group flex flex-col justify-between rounded-2xl border border-stone-200/90 bg-white p-5 shadow-xs hover:border-amber-700/40 hover:shadow-md transition"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-stone-500">
                      {item.market}
                    </span>
                    <MarketStatusBadge level={item.confidence} result={item.result} />
                  </div>
                  <p className="mt-2 font-serif text-xl font-bold text-stone-900 group-hover:text-amber-800 transition">
                    {item.pick}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-amber-800">
                    {item.matchupTitle} · <span className="font-mono">{item.line}</span>
                  </p>
                  <p className="mt-2.5 text-xs leading-relaxed text-stone-600 line-clamp-2">
                    {item.rationale}
                  </p>
                </div>

                <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-amber-800">
                  <span>Ver análisis del duelo</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Matchup Cards */}
      <section className="space-y-4">
        <h2 className="font-serif text-xl font-bold text-stone-900">
          Juegos de la Jornada ({games.length})
        </h2>

        {games.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center">
            <p className="font-serif text-lg font-medium text-stone-800">
              No hay juegos programados para el {activeDate}.
            </p>
            <p className="mt-1 text-sm text-stone-500">
              Selecciona otra fecha arriba para revisar resultados recientes o próximos duelos.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {games.map((game) => (
              <MatchupScorecard key={game.gamePk} game={game} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MatchupScorecard({ game }: { game: EnrichedGameMatchup }) {
  const { awayTeam, homeTeam, analysis, probableAwayPitcher, probableHomePitcher } = game;
  const isFinal = game.statusCode === "F";
  const isLive = game.statusCode === "I";

  const gameTimeFormatted = new Intl.DateTimeFormat("es-MX", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Mazatlan",
    timeZoneName: "short",
  }).format(new Date(game.gameDate));

  return (
    <article className="flex flex-col justify-between rounded-2xl border border-stone-200/90 bg-white overflow-hidden shadow-xs hover:shadow-md transition">
      {/* Warm Header Bar */}
      <div className="flex items-center justify-between border-b border-stone-200/80 bg-[#F7F3EB] px-5 py-3 text-xs">
        <div className="flex items-center gap-2.5">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-semibold ${
              isLive
                ? "bg-red-100 text-red-800 border border-red-200"
                : isFinal
                ? "bg-stone-200/80 text-stone-700"
                : "bg-amber-100/90 text-amber-900 border border-amber-200"
            }`}
          >
            {isFinal ? "Finalizado" : isLive ? "En Vivo" : gameTimeFormatted}
          </span>
          <span className="flex items-center gap-1 text-stone-600">
            <MapPin className="h-3.5 w-3.5 text-amber-800/70" />
            {game.venueName}
          </span>
        </div>

        <Link
          href={`/games/${game.gamePk}`}
          className="inline-flex items-center gap-1 font-semibold text-amber-800 hover:text-amber-950 transition"
        >
          <span>Detalle Completo</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="p-6 space-y-6">
        {/* Teams & Classic Scoreboard Centerpiece */}
        <div className="grid grid-cols-12 items-center gap-3">
          {/* Away Team */}
          <div className="col-span-5 space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-[#F3EDE2] px-2 py-0.5 font-mono text-xs font-semibold text-stone-800 border border-stone-200">
                {awayTeam.abbreviation}
              </span>
              <span className="text-xs text-stone-500">
                {awayTeam.wins}-{awayTeam.losses} ({awayTeam.streakCode})
              </span>
            </div>
            <h3 className="font-serif text-lg font-bold text-stone-900 truncate">
              {awayTeam.name}
            </h3>
            <p className="text-xs text-stone-600 truncate">
              Abridor:{" "}
              <span className="font-medium text-stone-900">
                {probableAwayPitcher
                  ? `${probableAwayPitcher.fullName} (${probableAwayPitcher.pitchHand})`
                  : "Por anunciar"}
              </span>
            </p>
          </div>

          {/* Center Projection Pill */}
          <div className="col-span-2 flex flex-col items-center justify-center rounded-2xl border border-stone-200 bg-[#FAF6F0] py-2.5 px-2 text-center">
            {isFinal || isLive ? (
              <>
                <span className="text-[10px] font-medium text-stone-500">Marcador</span>
                <span className="font-mono text-base font-bold text-stone-900">
                  {game.awayScore ?? 0} - {game.homeScore ?? 0}
                </span>
                <span className="text-[10px] font-mono text-amber-800">
                  Proy {analysis.projectedAwayRuns}-{analysis.projectedHomeRuns}
                </span>
              </>
            ) : (
              <>
                <span className="text-[10px] font-medium text-stone-500">Carreras Est.</span>
                <span className="font-mono text-sm font-bold text-amber-900">
                  {analysis.projectedAwayRuns} - {analysis.projectedHomeRuns}
                </span>
                <span className="text-[10px] font-mono text-stone-500">
                  Total {analysis.projectedTotalRuns}
                </span>
              </>
            )}
          </div>

          {/* Home Team */}
          <div className="col-span-5 space-y-1 text-right">
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs text-stone-500">
                {homeTeam.wins}-{homeTeam.losses} ({homeTeam.streakCode})
              </span>
              <span className="rounded-md bg-[#F3EDE2] px-2 py-0.5 font-mono text-xs font-semibold text-stone-800 border border-stone-200">
                {homeTeam.abbreviation}
              </span>
            </div>
            <h3 className="font-serif text-lg font-bold text-stone-900 truncate">
              {homeTeam.name}
            </h3>
            <p className="text-xs text-stone-600 truncate">
              Abridor:{" "}
              <span className="font-medium text-stone-900">
                {probableHomePitcher
                  ? `${probableHomePitcher.fullName} (${probableHomePitcher.pitchHand})`
                  : "Por anunciar"}
              </span>
            </p>
          </div>
        </div>

        {/* 3 Clean Market Recommendations */}
        <div className="grid grid-cols-3 gap-3">
          {[
            analysis.markets.moneyline,
            analysis.markets.runline,
            analysis.markets.totals,
          ].map((m) => (
            <div
              key={m.market}
              className="rounded-xl border border-stone-200/80 bg-[#FAF6F0]/80 p-3.5 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-medium text-stone-500">{m.market}</span>
                <MarketStatusBadge level={m.confidence} result={m.result} />
              </div>
              <p className="mt-2 font-serif text-base font-bold text-stone-900">{m.pick}</p>
              <p className="mt-0.5 font-mono text-xs text-amber-800">{m.line}</p>
            </div>
          ))}
        </div>

        {/* Soft 4-Factor Comparison List */}
        <div className="rounded-xl border border-stone-200/70 bg-[#F7F3EB]/60 p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-stone-700">
              Semáforo de Factores (Abridor · Bullpen · Ofensiva · Localía)
            </span>
            <span className="font-medium text-amber-900">
              {analysis.overallAdvantage === "home"
                ? `Ventaja ${homeTeam.shortName} (+${analysis.totalScorecardPoints})`
                : analysis.overallAdvantage === "away"
                ? `Ventaja ${awayTeam.shortName} (+${Math.abs(analysis.totalScorecardPoints)})`
                : "Duelo Parejo"}
            </span>
          </div>

          <div className="divide-y divide-stone-200/70">
            {analysis.factors.map((f) => {
              const favoredName =
                f.advantage === "home"
                  ? homeTeam.abbreviation
                  : f.advantage === "away"
                  ? awayTeam.abbreviation
                  : "Parejo";

              const pillStyle =
                f.advantage === "even"
                  ? "bg-stone-200/70 text-stone-700"
                  : "bg-emerald-100/80 text-emerald-900";

              return (
                <div
                  key={f.category}
                  className="py-2 first:pt-1 last:pb-0 flex items-center justify-between gap-2 text-xs"
                >
                  <span className="font-medium text-stone-700 w-40 shrink-0">
                    {f.label}
                  </span>
                  <span className="text-stone-500 truncate hidden sm:inline">
                    {f.awayValue} vs {f.homeValue}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold shrink-0 ${pillStyle}`}
                  >
                    {favoredName === "Parejo"
                      ? "Parejo"
                      : `${favoredName} +${Math.abs(f.score)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </article>
  );
}
