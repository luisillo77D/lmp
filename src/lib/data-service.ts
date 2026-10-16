// Data Service Layer for LMP Analytics
// Reads from Supabase when configured & populated; seamlessly falls back to live MLB Stats API

import {
  fetchGameBoxscore,
  fetchLmpSchedule,
  fetchLmpStandings,
  fetchLmpTeams,
  fetchTeamRosterWithStats,
  LMP_DEFAULT_SEASON,
} from "./mlb-api";
import {
  evaluateGameMatchup,
  GameMatchupInput,
  HybridGameAnalysis,
  PitcherMetrics,
  TeamMetrics,
} from "./recommendations";
import { getSupabasePublicClient, isSupabaseConfigured } from "./supabase";

export interface EnrichedGameMatchup extends GameMatchupInput {
  analysis: HybridGameAnalysis;
}

export interface PlayerRecord {
  id: number;
  teamId: number;
  teamName: string;
  teamAbbreviation: string;
  fullName: string;
  primaryNumber: string;
  positionCode: string;
  positionName: string;
  batSide: string;
  pitchHand: string;
  gamesPlayed: number;
  atBats: number;
  runs: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  rbi: number;
  baseOnBalls: number;
  strikeOuts: number;
  stolenBases: number;
  avg: number;
  obp: number;
  slg: number;
  ops: number;
  gamesPitched: number;
  gamesStarted: number;
  wins: number;
  losses: number;
  saves: number;
  inningsPitched: number;
  pitchedHits: number;
  earnedRuns: number;
  pitchedWalks: number;
  pitchedStrikeouts: number;
  era: number;
  whip: number;
}

/**
 * Returns today's date in YYYY-MM-DD (America/Mazatlan / Pacific time for LMP games).
 */
export function getDefaultLmpDate(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mazatlan",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

/**
 * Loads all LMP teams merged with standings metrics.
 * Prefers Supabase if configured and non-empty; otherwise fetches live from MLB Stats API.
 */
export async function getTeamsWithStandings(season = LMP_DEFAULT_SEASON): Promise<{
  teams: TeamMetrics[];
  source: "supabase" | "mlb-live";
}> {
  const supabase = getSupabasePublicClient();

  if (supabase) {
    const { data, error } = await supabase
      .from("teams")
      .select("*")
      .order("winning_percentage", { ascending: false });

    if (!error && data && data.length > 0) {
      const teams: TeamMetrics[] = data.map((row) => ({
        id: Number(row.id),
        name: String(row.name),
        shortName: String(row.short_name),
        abbreviation: String(row.abbreviation),
        venueName: String(row.venue_name ?? ""),
        wins: Number(row.wins ?? 0),
        losses: Number(row.losses ?? 0),
        winningPercentage: Number(row.winning_percentage ?? 0),
        gamesBack: String(row.games_back ?? "-"),
        streakCode: String(row.streak_code ?? "-"),
        runsScored: Number(row.runs_scored ?? 0),
        runsAllowed: Number(row.runs_allowed ?? 0),
        runDifferential: Number(row.run_differential ?? 0),
        homeWins: Number(row.home_wins ?? 0),
        homeLosses: Number(row.home_losses ?? 0),
        awayWins: Number(row.away_wins ?? 0),
        awayLosses: Number(row.away_losses ?? 0),
        lastTenWins: Number(row.last_ten_wins ?? 0),
        lastTenLosses: Number(row.last_ten_losses ?? 0),
        teamAvg: Number(row.team_avg ?? 0.255),
        teamOps: Number(row.team_ops ?? 0.715),
        teamEra: Number(row.team_era ?? 3.85),
        bullpenEra: Number(row.bullpen_era ?? 3.95),
      }));
      return { teams, source: "supabase" };
    }
  }

  // Fallback: Live MLB Stats API
  const [rawTeams, rawStandings] = await Promise.all([
    fetchLmpTeams(season),
    fetchLmpStandings(season),
  ]);

  const standingsMap = new Map(rawStandings.map((s) => [s.team.id, s]));

  const teams: TeamMetrics[] = rawTeams.map((team) => {
    const st = standingsMap.get(team.id);
    const splits = st?.records?.splitRecords ?? [];
    const homeSplit = splits.find((r) => r.type === "home");
    const awaySplit = splits.find((r) => r.type === "away");
    const l10Split = splits.find((r) => r.type === "lastTen");

    const wins = st?.wins ?? 0;
    const losses = st?.losses ?? 0;
    const gamesPlayed = Math.max(wins + losses, 1);
    const runsAllowed = st?.runsAllowed ?? 0;
    const estimatedTeamEra =
      wins + losses > 0 ? Number(((runsAllowed / gamesPlayed) * 0.92).toFixed(2)) : 3.95;

    return {
      id: team.id,
      name: team.name,
      shortName: team.shortName || team.teamName || team.name,
      abbreviation: team.abbreviation,
      venueName: team.venue?.name ?? "",
      wins,
      losses,
      winningPercentage: Number.parseFloat(st?.winningPercentage ?? "0") || 0,
      gamesBack: st?.gamesBack ?? "-",
      streakCode: st?.streak?.streakCode ?? "-",
      runsScored: st?.runsScored ?? 0,
      runsAllowed,
      runDifferential: st?.runDifferential ?? 0,
      homeWins: homeSplit?.wins ?? 0,
      homeLosses: homeSplit?.losses ?? 0,
      awayWins: awaySplit?.wins ?? 0,
      awayLosses: awaySplit?.losses ?? 0,
      lastTenWins: l10Split?.wins ?? wins,
      lastTenLosses: l10Split?.losses ?? losses,
      teamAvg: 0.258,
      teamOps: 0.72,
      teamEra: estimatedTeamEra,
      bullpenEra: estimatedTeamEra,
    };
  });

  teams.sort((a, b) => b.winningPercentage - a.winningPercentage || b.runDifferential - a.runDifferential);

  return { teams, source: "mlb-live" };
}

/**
 * Fetches games for a given date (or the closest active date with games) along with
 * hybrid recommendations for Moneyline, Runline (±1.5), and Totals.
 */
export async function getSlateWithRecommendations(targetDate?: string): Promise<{
  activeDate: string;
  availableDates: string[];
  games: EnrichedGameMatchup[];
  source: "supabase" | "mlb-live";
}> {
  const { teams, source } = await getTeamsWithStandings();
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const requestedDate = targetDate || getDefaultLmpDate();

  // Fetch a window around the requested date so the user can easily navigate dates
  const baseDateObj = new Date(`${requestedDate}T12:00:00Z`);
  const startWindow = new Date(baseDateObj.getTime() - 4 * 86400000).toISOString().slice(0, 10);
  const endWindow = new Date(baseDateObj.getTime() + 5 * 86400000).toISOString().slice(0, 10);

  const scheduleGames = await fetchLmpSchedule({
    startDate: startWindow,
    endDate: endWindow,
  });

  const dateSet = new Set<string>();
  for (const g of scheduleGames) {
    dateSet.add(g.officialDate);
  }
  const availableDates = Array.from(dateSet).sort();

  let activeDate = requestedDate;
  if (!dateSet.has(activeDate) && availableDates.length > 0) {
    // Pick the closest available date
    activeDate =
      availableDates.find((d) => d >= requestedDate) ?? availableDates[availableDates.length - 1];
  }

  // Calculate recent 5-game offensive form from completed games in the window
  const completedGames = scheduleGames.filter((g) => g.status.abstractGameState === "Final");
  const recentScoresByTeam = new Map<number, number[]>();
  for (const cg of completedGames) {
    const awayId = cg.teams.away.team.id;
    const homeId = cg.teams.home.team.id;
    if (typeof cg.teams.away.score === "number") {
      const list = recentScoresByTeam.get(awayId) ?? [];
      list.push(cg.teams.away.score);
      recentScoresByTeam.set(awayId, list);
    }
    if (typeof cg.teams.home.score === "number") {
      const list = recentScoresByTeam.get(homeId) ?? [];
      list.push(cg.teams.home.score);
      recentScoresByTeam.set(homeId, list);
    }
  }

  for (const [teamId, scores] of recentScoresByTeam.entries()) {
    const team = teamMap.get(teamId);
    if (team && scores.length > 0) {
      const lastFive = scores.slice(-5);
      team.recentRunsPerGame =
        lastFive.reduce((sum, val) => sum + val, 0) / lastFive.length;
    }
  }

  // Look up probable pitcher details from Supabase if available
  const supabase = getSupabasePublicClient();
  const pitcherMap = new Map<number, PitcherMetrics>();
  if (supabase && isSupabaseConfigured()) {
    const { data: dbPlayers } = await supabase
      .from("players")
      .select("*")
      .eq("position_code", "P");

    for (const p of dbPlayers ?? []) {
      pitcherMap.set(Number(p.id), {
        id: Number(p.id),
        fullName: String(p.full_name),
        pitchHand: String(p.pitch_hand ?? "R"),
        gamesStarted: Number(p.games_started ?? 0),
        wins: Number(p.wins ?? 0),
        losses: Number(p.losses ?? 0),
        inningsPitched: Number(p.innings_pitched ?? 0),
        era: Number(p.era ?? 0),
        whip: Number(p.whip ?? 0),
        strikeOuts: Number(p.pitched_strikeouts ?? 0),
        walks: Number(p.pitched_walks ?? 0),
      });
    }
  }

  const dayGames = scheduleGames.filter((g) => g.officialDate === activeDate);

  const enrichedGames: EnrichedGameMatchup[] = dayGames.map((g) => {
    const awayTeam =
      teamMap.get(g.teams.away.team.id) ?? {
        id: g.teams.away.team.id,
        name: g.teams.away.team.name,
        shortName: g.teams.away.team.name,
        abbreviation: g.teams.away.team.name.slice(0, 3).toUpperCase(),
        venueName: "",
        wins: g.teams.away.leagueRecord?.wins ?? 0,
        losses: g.teams.away.leagueRecord?.losses ?? 0,
        winningPercentage: Number.parseFloat(g.teams.away.leagueRecord?.pct ?? "0.500"),
        gamesBack: "-",
        streakCode: "-",
        runsScored: 0,
        runsAllowed: 0,
        runDifferential: 0,
        homeWins: 0,
        homeLosses: 0,
        awayWins: 0,
        awayLosses: 0,
        lastTenWins: 0,
        lastTenLosses: 0,
        teamAvg: 0.255,
        teamOps: 0.71,
        teamEra: 3.95,
        bullpenEra: 3.95,
      };

    const homeTeam =
      teamMap.get(g.teams.home.team.id) ?? {
        id: g.teams.home.team.id,
        name: g.teams.home.team.name,
        shortName: g.teams.home.team.name,
        abbreviation: g.teams.home.team.name.slice(0, 3).toUpperCase(),
        venueName: g.venue?.name ?? "",
        wins: g.teams.home.leagueRecord?.wins ?? 0,
        losses: g.teams.home.leagueRecord?.losses ?? 0,
        winningPercentage: Number.parseFloat(g.teams.home.leagueRecord?.pct ?? "0.500"),
        gamesBack: "-",
        streakCode: "-",
        runsScored: 0,
        runsAllowed: 0,
        runDifferential: 0,
        homeWins: 0,
        homeLosses: 0,
        awayWins: 0,
        awayLosses: 0,
        lastTenWins: 0,
        lastTenLosses: 0,
        teamAvg: 0.255,
        teamOps: 0.71,
        teamEra: 3.95,
        bullpenEra: 3.95,
      };

    const awayProbableRaw = g.teams.away.probablePitcher;
    const homeProbableRaw = g.teams.home.probablePitcher;

    const dbAwayPitcher = awayProbableRaw ? pitcherMap.get(awayProbableRaw.id) : undefined;
    const dbHomePitcher = homeProbableRaw ? pitcherMap.get(homeProbableRaw.id) : undefined;

    const probableAwayPitcher: PitcherMetrics | null = awayProbableRaw
      ? {
          id: awayProbableRaw.id,
          fullName: dbAwayPitcher?.fullName ?? awayProbableRaw.fullName,
          pitchHand: dbAwayPitcher?.pitchHand ?? "R",
          gamesStarted: dbAwayPitcher?.gamesStarted || 1,
          wins: dbAwayPitcher?.wins ?? awayProbableRaw.wins ?? 0,
          losses: dbAwayPitcher?.losses ?? awayProbableRaw.losses ?? 0,
          inningsPitched:
            dbAwayPitcher && dbAwayPitcher.inningsPitched > 0
              ? dbAwayPitcher.inningsPitched
              : awayProbableRaw.era !== undefined
              ? 5.0
              : 0,
          era:
            dbAwayPitcher && dbAwayPitcher.inningsPitched > 0
              ? dbAwayPitcher.era
              : awayProbableRaw.era ?? (awayTeam.teamEra || 3.85),
          whip: dbAwayPitcher?.whip || 1.25,
          strikeOuts: dbAwayPitcher?.strikeOuts ?? 4,
          walks: dbAwayPitcher?.walks ?? 2,
        }
      : null;

    const probableHomePitcher: PitcherMetrics | null = homeProbableRaw
      ? {
          id: homeProbableRaw.id,
          fullName: dbHomePitcher?.fullName ?? homeProbableRaw.fullName,
          pitchHand: dbHomePitcher?.pitchHand ?? "R",
          gamesStarted: dbHomePitcher?.gamesStarted || 1,
          wins: dbHomePitcher?.wins ?? homeProbableRaw.wins ?? 0,
          losses: dbHomePitcher?.losses ?? homeProbableRaw.losses ?? 0,
          inningsPitched:
            dbHomePitcher && dbHomePitcher.inningsPitched > 0
              ? dbHomePitcher.inningsPitched
              : homeProbableRaw.era !== undefined
              ? 5.0
              : 0,
          era:
            dbHomePitcher && dbHomePitcher.inningsPitched > 0
              ? dbHomePitcher.era
              : homeProbableRaw.era ?? (homeTeam.teamEra || 3.75),
          whip: dbHomePitcher?.whip || 1.22,
          strikeOuts: dbHomePitcher?.strikeOuts ?? 5,
          walks: dbHomePitcher?.walks ?? 2,
        }
      : null;

    const matchupInput: GameMatchupInput = {
      gamePk: g.gamePk,
      officialDate: g.officialDate,
      gameDate: g.gameDate,
      statusCode: g.status.statusCode,
      detailedState: g.status.detailedState,
      venueName: g.venue?.name ?? homeTeam.venueName,
      awayTeam,
      homeTeam,
      awayScore: g.teams.away.score ?? g.linescore?.teams?.away?.runs ?? null,
      homeScore: g.teams.home.score ?? g.linescore?.teams?.home?.runs ?? null,
      awayHits: g.linescore?.teams?.away?.hits ?? null,
      homeHits: g.linescore?.teams?.home?.hits ?? null,
      awayErrors: g.linescore?.teams?.away?.errors ?? null,
      homeErrors: g.linescore?.teams?.home?.errors ?? null,
      probableAwayPitcher,
      probableHomePitcher,
    };

    return {
      ...matchupInput,
      analysis: evaluateGameMatchup(matchupInput),
    };
  });

  return {
    activeDate,
    availableDates,
    games: enrichedGames,
    source,
  };
}

/**
 * Fetches all players with season batting and pitching stats across the league.
 */
export async function getAllPlayersWithStats(season = LMP_DEFAULT_SEASON): Promise<{
  players: PlayerRecord[];
  source: "supabase" | "mlb-live";
}> {
  const { teams } = await getTeamsWithStandings(season);
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const supabase = getSupabasePublicClient();

  if (supabase) {
    const { data, error } = await supabase.from("players").select("*");
    if (!error && data && data.length > 0) {
      const players: PlayerRecord[] = data.map((row) => {
        const team = teamMap.get(Number(row.team_id));
        return {
          id: Number(row.id),
          teamId: Number(row.team_id ?? 0),
          teamName: team?.shortName ?? "LMP",
          teamAbbreviation: team?.abbreviation ?? "LMP",
          fullName: String(row.full_name),
          primaryNumber: String(row.primary_number ?? ""),
          positionCode: String(row.position_code ?? ""),
          positionName: String(row.position_name ?? ""),
          batSide: String(row.bat_side ?? "R"),
          pitchHand: String(row.pitch_hand ?? "R"),
          gamesPlayed: Number(row.games_played ?? 0),
          atBats: Number(row.at_bats ?? 0),
          runs: Number(row.runs ?? 0),
          hits: Number(row.hits ?? 0),
          doubles: Number(row.doubles ?? 0),
          triples: Number(row.triples ?? 0),
          homeRuns: Number(row.home_runs ?? 0),
          rbi: Number(row.rbi ?? 0),
          baseOnBalls: Number(row.base_on_balls ?? 0),
          strikeOuts: Number(row.strike_outs ?? 0),
          stolenBases: Number(row.stolen_bases ?? 0),
          avg: Number(row.avg ?? 0),
          obp: Number(row.obp ?? 0),
          slg: Number(row.slg ?? 0),
          ops: Number(row.ops ?? 0),
          gamesPitched: Number(row.games_pitched ?? 0),
          gamesStarted: Number(row.games_started ?? 0),
          wins: Number(row.wins ?? 0),
          losses: Number(row.losses ?? 0),
          saves: Number(row.saves ?? 0),
          inningsPitched: Number(row.innings_pitched ?? 0),
          pitchedHits: Number(row.pitched_hits ?? 0),
          earnedRuns: Number(row.earned_runs ?? 0),
          pitchedWalks: Number(row.pitched_walks ?? 0),
          pitchedStrikeouts: Number(row.pitched_strikeouts ?? 0),
          era: Number(row.era ?? 0),
          whip: Number(row.whip ?? 0),
        };
      });
      return { players, source: "supabase" };
    }
  }

  // Fallback: Fetch rosters for all LMP teams in parallel from MLB Stats API
  const rosterLists = await Promise.all(
    teams.map(async (team) => {
      try {
        const roster = await fetchTeamRosterWithStats(team.id, season);
        return { team, roster };
      } catch {
        return { team, roster: [] };
      }
    })
  );

  const players: PlayerRecord[] = [];
  for (const { team, roster } of rosterLists) {
    for (const p of roster) {
      const hittingSplit = p.stats?.find((s) => s.group.displayName === "hitting")?.splits?.[0]?.stat;
      const pitchingSplit = p.stats?.find((s) => s.group.displayName === "pitching")?.splits?.[0]?.stat;

      players.push({
        id: p.id,
        teamId: team.id,
        teamName: team.shortName,
        teamAbbreviation: team.abbreviation,
        fullName: p.fullName,
        primaryNumber: p.primaryNumber ?? "-",
        positionCode: p.primaryPosition?.abbreviation ?? p.primaryPosition?.code ?? "P",
        positionName: p.primaryPosition?.name ?? "Player",
        batSide: p.batSide?.code ?? "R",
        pitchHand: p.pitchHand?.code ?? "R",
        gamesPlayed: Number(hittingSplit?.gamesPlayed ?? 0),
        atBats: Number(hittingSplit?.atBats ?? 0),
        runs: Number(hittingSplit?.runs ?? 0),
        hits: Number(hittingSplit?.hits ?? 0),
        doubles: Number(hittingSplit?.doubles ?? 0),
        triples: Number(hittingSplit?.triples ?? 0),
        homeRuns: Number(hittingSplit?.homeRuns ?? 0),
        rbi: Number(hittingSplit?.rbi ?? 0),
        baseOnBalls: Number(hittingSplit?.baseOnBalls ?? 0),
        strikeOuts: Number(hittingSplit?.strikeOuts ?? 0),
        stolenBases: Number(hittingSplit?.stolenBases ?? 0),
        avg: Number.parseFloat(String(hittingSplit?.avg ?? "0")) || 0,
        obp: Number.parseFloat(String(hittingSplit?.obp ?? "0")) || 0,
        slg: Number.parseFloat(String(hittingSplit?.slg ?? "0")) || 0,
        ops: Number.parseFloat(String(hittingSplit?.ops ?? "0")) || 0,
        gamesPitched: Number(pitchingSplit?.gamesPlayed ?? 0),
        gamesStarted: Number(pitchingSplit?.gamesStarted ?? 0),
        wins: Number(pitchingSplit?.wins ?? 0),
        losses: Number(pitchingSplit?.losses ?? 0),
        saves: Number(pitchingSplit?.saves ?? 0),
        inningsPitched: Number.parseFloat(String(pitchingSplit?.inningsPitched ?? "0")) || 0,
        pitchedHits: Number(pitchingSplit?.hits ?? 0),
        earnedRuns: Number(pitchingSplit?.earnedRuns ?? 0),
        pitchedWalks: Number(pitchingSplit?.baseOnBalls ?? 0),
        pitchedStrikeouts: Number(pitchingSplit?.strikeOuts ?? 0),
        era: Number.parseFloat(String(pitchingSplit?.era ?? "0")) || 0,
        whip: Number.parseFloat(String(pitchingSplit?.whip ?? "0")) || 0,
      });
    }
  }

  return { players, source: "mlb-live" };
}

/**
 * Fetches a detailed single-game matchup along with live/final boxscore if available.
 */
export async function getGameDetailWithBoxscore(gamePk: number) {
  const [boxscoreFeed, { teams }] = await Promise.all([
    fetchGameBoxscore(gamePk),
    getTeamsWithStandings(),
  ]);

  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const officialDate =
    boxscoreFeed.gameData?.datetime?.officialDate ?? getDefaultLmpDate();

  const { games } = await getSlateWithRecommendations(officialDate);
  const enrichedMatchup = games.find((g) => g.gamePk === gamePk) ?? null;

  return {
    matchup: enrichedMatchup,
    boxscore: boxscoreFeed.liveData?.boxscore ?? null,
    gameData: boxscoreFeed.gameData ?? null,
    teamMap: Object.fromEntries(teamMap.entries()),
  };
}
