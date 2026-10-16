"use client";

import { useMemo, useState } from "react";
import { Search, Filter } from "lucide-react";
import { PlayerRecord } from "@/lib/data-service";

interface PlayersExplorerProps {
  players: PlayerRecord[];
  teams: Array<{ id: number; name: string; abbreviation: string }>;
}

export function PlayersExplorer({ players, teams }: PlayersExplorerProps) {
  const [tab, setTab] = useState<"batting" | "pitching">("batting");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return players
      .filter((p) => {
        if (selectedTeamId !== "all" && String(p.teamId) !== selectedTeamId) {
          return false;
        }
        if (q && !p.fullName.toLowerCase().includes(q)) {
          return false;
        }
        if (tab === "batting") {
          return p.positionCode !== "P" || p.atBats > 0;
        }
        return p.positionCode === "P" || p.inningsPitched > 0;
      })
      .sort((a, b) => {
        if (tab === "batting") {
          return b.ops - a.ops || b.hits - a.hits || b.atBats - a.atBats;
        }
        if (b.inningsPitched !== a.inningsPitched) {
          return b.inningsPitched - a.inningsPitched;
        }
        return a.era - b.era;
      });
  }, [players, tab, selectedTeamId, searchQuery]);

  const topBatters = useMemo(
    () =>
      [...players]
        .filter((p) => p.atBats >= 2)
        .sort((a, b) => b.ops - a.ops || b.hits - a.hits)
        .slice(0, 3),
    [players]
  );

  const topPitchers = useMemo(
    () =>
      [...players]
        .filter((p) => p.inningsPitched >= 2)
        .sort((a, b) => a.era - b.era || b.pitchedStrikeouts - a.pitchedStrikeouts)
        .slice(0, 3),
    [players]
  );

  return (
    <div className="space-y-8">
      {/* League Leaders Cards */}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
            Líderes de Bateo (OPS)
          </p>
          <div className="mt-3.5 grid grid-cols-3 gap-3">
            {topBatters.map((b) => (
              <div
                key={b.id}
                className="rounded-xl border border-stone-200/80 bg-[#FAF6F0] p-3.5"
              >
                <span className="text-[10px] font-mono font-semibold text-amber-800">
                  {b.teamAbbreviation} · {b.positionCode}
                </span>
                <p className="mt-1 font-serif text-sm font-bold text-stone-900 truncate">
                  {b.fullName}
                </p>
                <p className="mt-1 font-mono text-base font-bold text-stone-900">
                  {b.ops.toFixed(3)}{" "}
                  <span className="text-[10px] font-normal text-stone-500">OPS</span>
                </p>
                <p className="text-[10px] font-mono text-stone-500">
                  {b.avg.toFixed(3)} AVG · {b.hits} H
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
            Líderes de Pitcheo (ERA y Ponches)
          </p>
          <div className="mt-3.5 grid grid-cols-3 gap-3">
            {topPitchers.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-stone-200/80 bg-[#FAF6F0] p-3.5"
              >
                <span className="text-[10px] font-mono font-semibold text-emerald-800">
                  {p.teamAbbreviation} · {p.pitchHand === "L" ? "PZ" : "PD"}
                </span>
                <p className="mt-1 font-serif text-sm font-bold text-stone-900 truncate">
                  {p.fullName}
                </p>
                <p className="mt-1 font-mono text-base font-bold text-stone-900">
                  {p.era.toFixed(2)}{" "}
                  <span className="text-[10px] font-normal text-stone-500">ERA</span>
                </p>
                <p className="text-[10px] font-mono text-stone-500">
                  {p.inningsPitched.toFixed(1)} IP · {p.pitchedStrikeouts} K
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-stone-200/90 bg-white p-4 shadow-2xs sm:flex-row sm:items-center">
        <div className="flex items-center gap-1.5 rounded-xl bg-[#F3EDE2] p-1 border border-stone-200/80 w-fit">
          <button
            type="button"
            onClick={() => setTab("batting")}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition cursor-pointer ${
              tab === "batting"
                ? "bg-amber-800 text-amber-50 shadow-2xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Bateadores ({players.filter((p) => p.positionCode !== "P" || p.atBats > 0).length})
          </button>
          <button
            type="button"
            onClick={() => setTab("pitching")}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition cursor-pointer ${
              tab === "pitching"
                ? "bg-amber-800 text-amber-50 shadow-2xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Lanzadores ({players.filter((p) => p.positionCode === "P" || p.inningsPitched > 0).length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex items-center">
            <Filter className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-stone-500" />
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="rounded-xl border border-stone-200 bg-[#FAF6F0] pl-8 pr-4 py-2 text-xs font-medium text-stone-800 focus:border-amber-700 focus:outline-none"
            >
              <option value="all">Todos los Equipos LMP</option>
              {teams.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.name} ({t.abbreviation})
                </option>
              ))}
            </select>
          </div>

          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-stone-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar jugador..."
              className="rounded-xl border border-stone-200 bg-[#FAF6F0] pl-8 pr-4 py-2 text-xs text-stone-800 placeholder:text-stone-400 focus:border-amber-700 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Register Table */}
      <div className="rounded-2xl border border-stone-200/90 bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          {tab === "batting" ? (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-[#F7F3EB] font-semibold uppercase tracking-wider text-stone-600">
                  <th className="py-3.5 pl-6 pr-3">Jugador</th>
                  <th className="py-3.5 px-3">Club</th>
                  <th className="py-3.5 px-3 text-center">Pos / Bat</th>
                  <th className="py-3.5 px-3 text-right">JJ</th>
                  <th className="py-3.5 px-3 text-right">VB</th>
                  <th className="py-3.5 px-3 text-right">C</th>
                  <th className="py-3.5 px-3 text-right">H</th>
                  <th className="py-3.5 px-3 text-right">2B</th>
                  <th className="py-3.5 px-3 text-right">HR</th>
                  <th className="py-3.5 px-3 text-right">CP</th>
                  <th className="py-3.5 px-3 text-right">BB / K</th>
                  <th className="py-3.5 px-3 text-right">AVG</th>
                  <th className="py-3.5 px-3 text-right">OBP</th>
                  <th className="py-3.5 pl-3 pr-6 text-right">OPS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200/60 font-mono text-stone-800">
                {filteredPlayers.slice(0, 100).map((p) => (
                  <tr
                    key={`${p.id}-${p.teamId}`}
                    className="hover:bg-[#FAF6F0] transition"
                  >
                    <td className="py-3.5 pl-6 pr-3 font-serif font-bold text-sm text-stone-900">
                      {p.fullName}{" "}
                      <span className="font-mono text-[11px] font-normal text-stone-400">
                        #{p.primaryNumber}
                      </span>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="rounded-md bg-[#F3EDE2] px-2 py-0.5 text-[11px] font-bold text-amber-900 border border-stone-200">
                        {p.teamAbbreviation}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-center text-stone-500">
                      {p.positionCode} ({p.batSide})
                    </td>
                    <td className="py-3.5 px-3 text-right">{p.gamesPlayed}</td>
                    <td className="py-3.5 px-3 text-right">{p.atBats}</td>
                    <td className="py-3.5 px-3 text-right">{p.runs}</td>
                    <td className="py-3.5 px-3 text-right font-bold text-stone-900">
                      {p.hits}
                    </td>
                    <td className="py-3.5 px-3 text-right">{p.doubles}</td>
                    <td className="py-3.5 px-3 text-right font-bold text-amber-800">
                      {p.homeRuns}
                    </td>
                    <td className="py-3.5 px-3 text-right">{p.rbi}</td>
                    <td className="py-3.5 px-3 text-right text-stone-500">
                      {p.baseOnBalls} / {p.strikeOuts}
                    </td>
                    <td className="py-3.5 px-3 text-right font-bold text-stone-900">
                      {p.avg.toFixed(3)}
                    </td>
                    <td className="py-3.5 px-3 text-right text-stone-600">
                      {p.obp.toFixed(3)}
                    </td>
                    <td className="py-3.5 pl-3 pr-6 text-right font-bold text-amber-900">
                      {p.ops.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-[#F7F3EB] font-semibold uppercase tracking-wider text-stone-600">
                  <th className="py-3.5 pl-6 pr-3">Lanzador</th>
                  <th className="py-3.5 px-3">Club</th>
                  <th className="py-3.5 px-3 text-center">Brazo</th>
                  <th className="py-3.5 px-3 text-right">JJ / JI</th>
                  <th className="py-3.5 px-3 text-right">G-P</th>
                  <th className="py-3.5 px-3 text-right">SV</th>
                  <th className="py-3.5 px-3 text-right">IP</th>
                  <th className="py-3.5 px-3 text-right">H</th>
                  <th className="py-3.5 px-3 text-right">CL</th>
                  <th className="py-3.5 px-3 text-right">BB</th>
                  <th className="py-3.5 px-3 text-right">K</th>
                  <th className="py-3.5 px-3 text-right">ERA</th>
                  <th className="py-3.5 pl-3 pr-6 text-right">WHIP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200/60 font-mono text-stone-800">
                {filteredPlayers.slice(0, 100).map((p) => (
                  <tr
                    key={`${p.id}-${p.teamId}`}
                    className="hover:bg-[#FAF6F0] transition"
                  >
                    <td className="py-3.5 pl-6 pr-3 font-serif font-bold text-sm text-stone-900">
                      {p.fullName}{" "}
                      <span className="font-mono text-[11px] font-normal text-stone-400">
                        #{p.primaryNumber}
                      </span>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="rounded-md bg-[#F3EDE2] px-2 py-0.5 text-[11px] font-bold text-amber-900 border border-stone-200">
                        {p.teamAbbreviation}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-center text-stone-500">
                      {p.pitchHand === "L" ? "Zurdo" : "Derecho"}
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      {p.gamesPitched} / {p.gamesStarted}
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      {p.wins}-{p.losses}
                    </td>
                    <td className="py-3.5 px-3 text-right font-semibold text-amber-800">
                      {p.saves}
                    </td>
                    <td className="py-3.5 px-3 text-right font-bold text-stone-900">
                      {p.inningsPitched.toFixed(1)}
                    </td>
                    <td className="py-3.5 px-3 text-right">{p.pitchedHits}</td>
                    <td className="py-3.5 px-3 text-right">{p.earnedRuns}</td>
                    <td className="py-3.5 px-3 text-right">{p.pitchedWalks}</td>
                    <td className="py-3.5 px-3 text-right font-bold text-emerald-800">
                      {p.pitchedStrikeouts}
                    </td>
                    <td className="py-3.5 px-3 text-right font-bold text-amber-900">
                      {p.era.toFixed(2)}
                    </td>
                    <td className="py-3.5 pl-3 pr-6 text-right text-stone-600">
                      {p.whip.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
