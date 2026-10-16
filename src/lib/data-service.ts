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
  gradeMarketPick,
  HybridGameAnalysis,
  PitcherMetrics,
  TeamMetrics,
} from "./recommendations";
import { getSupabasePublicClient, isSupabaseConfigured } from "./supabase";

export interface EnrichedGameMatchup extends GameMatchupInput {
  analysis: HybridGameAnalysis;
}

export interface SystemRecordBucket {
  wins: number;
  losses: number;
  pct: number;
}

export interface SystemRecordSummary {
  overall: SystemRecordBucket;
  moneyline: SystemRecordBucket;
  runline: SystemRecordBucket;
  totals: SystemRecordBucket;
  highConfidence: SystemRecordBucket;
  gamesEvaluated: number;
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
  allWindowGames: EnrichedGameMatchup[];
  source: "supabase" | "mlb-live";
  systemRecord: SystemRecordSummary;
}> {
  const { teams, source } = await getTeamsWithStandings();
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const todayDate = getDefaultLmpDate();
  const requestedDate = targetDate || todayDate;

  // Fetch window covers both the requested date navigation AND the completed games up to today
  const baseDateObj = new Date(`${requestedDate}T12:00:00Z`);
  const todayDateObj = new Date(`${todayDate}T12:00:00Z`);
  const navStart = new Date(baseDateObj.getTime() - 4 * 86400000).toISOString().slice(0, 10);
  const navEnd = new Date(baseDateObj.getTime() + 5 * 86400000).toISOString().slice(0, 10);
  const recordStart = new Date(todayDateObj.getTime() - 14 * 86400000).toISOString().slice(0, 10);
  const recordEnd = new Date(todayDateObj.getTime() + 3 * 86400000).toISOString().slice(0, 10);

  const startWindow = navStart < recordStart ? navStart : recordStart;
  const endWindow = navEnd > recordEnd ? navEnd : recordEnd;

  const scheduleGames = await fetchLmpSchedule({
    startDate: startWindow,
    endDate: endWindow,
  });

  const dateSet = new Set<string>();
  for (const g of scheduleGames) {
    if (g.officialDate >= navStart && g.officialDate <= navEnd) {
      dateSet.add(g.officialDate);
    }
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

  // Load locked picks from system_picks if the table exists in Supabase
  const lockedPicksByGame = new Map<
    number,
    Map<string, { pick: string; line: string; confidence: "Alta" | "Media" | "Moderada"; result: "won" | "lost" | "pending" }>
  >();
  if (supabase && isSupabaseConfigured()) {
    try {
      const { data: savedPicks, error: picksError } = await supabase
        .from("system_picks")
        .select("game_pk,market,pick,line,confidence,result");
      if (!picksError && savedPicks) {
        for (const row of savedPicks) {
          const gpk = Number(row.game_pk);
          const gameMap = lockedPicksByGame.get(gpk) ?? new Map();
          gameMap.set(String(row.market), {
            pick: String(row.pick),
            line: String(row.line),
            confidence: (row.confidence as "Alta" | "Media" | "Moderada") ?? "Media",
            result: (row.result as "won" | "lost" | "pending") ?? "pending",
          });
          lockedPicksByGame.set(gpk, gameMap);
        }
      }
    } catch {
      // Ignore if system_picks table is not yet created
    }
  }

  /**
   * Builds a pre-game snapshot of a team's metrics strictly from games completed BEFORE `beforeDate`
   * so historical game grading never leaks the final score of the game being evaluated.
   */
  const getPreGameTeamSnapshot = (baseTeam: TeamMetrics, beforeDate: string): TeamMetrics => {
    const priorGames = completedGames.filter(
      (cg) =>
        cg.officialDate < beforeDate &&
        (cg.teams.away.team.id === baseTeam.id || cg.teams.home.team.id === baseTeam.id)
    );

    let wins = 0;
    let losses = 0;
    let homeWins = 0;
    let homeLosses = 0;
    let awayWins = 0;
    let awayLosses = 0;
    let runsScored = 0;
    let runsAllowed = 0;
    const recentScores: number[] = [];

    for (const pg of priorGames) {
      const isHome = pg.teams.home.team.id === baseTeam.id;
      const myScore = (isHome ? pg.teams.home.score : pg.teams.away.score) ?? 0;
      const oppScore = (isHome ? pg.teams.away.score : pg.teams.home.score) ?? 0;

      runsScored += myScore;
      runsAllowed += oppScore;
      recentScores.push(myScore);

      if (myScore > oppScore) {
        wins += 1;
        if (isHome) homeWins += 1;
        else awayWins += 1;
      } else if (oppScore > myScore) {
        losses += 1;
        if (isHome) homeLosses += 1;
        else awayLosses += 1;
      }
    }

    const gp = wins + losses;
    const priorEra = gp > 0 ? Number(((runsAllowed / gp) * 0.92).toFixed(2)) : 3.9;
    const lastFive = recentScores.slice(-5);

    return {
      ...baseTeam,
      wins,
      losses,
      winningPercentage: gp > 0 ? Number((wins / gp).toFixed(3)) : 0.5,
      runsScored,
      runsAllowed,
      runDifferential: runsScored - runsAllowed,
      homeWins,
      homeLosses,
      awayWins,
      awayLosses,
      lastTenWins: wins,
      lastTenLosses: losses,
      teamEra: priorEra,
      bullpenEra: priorEra,
      recentRunsPerGame:
        lastFive.length > 0
          ? lastFive.reduce((s, v) => s + v, 0) / lastFive.length
          : undefined,
    };
  };

  const enrichScheduleGame = (g: (typeof scheduleGames)[number]): EnrichedGameMatchup => {
    const rawAwayTeam =
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

    const rawHomeTeam =
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

    const isCompletedGame = g.status.statusCode === "F";
    const awayTeam = isCompletedGame
      ? getPreGameTeamSnapshot(rawAwayTeam, g.officialDate)
      : rawAwayTeam;
    const homeTeam = isCompletedGame
      ? getPreGameTeamSnapshot(rawHomeTeam, g.officialDate)
      : rawHomeTeam;

    const awayProbableRaw = g.teams.away.probablePitcher;
    const homeProbableRaw = g.teams.home.probablePitcher;

    const dbAwayPitcher = awayProbableRaw ? pitcherMap.get(awayProbableRaw.id) : undefined;
    const dbHomePitcher = homeProbableRaw ? pitcherMap.get(homeProbableRaw.id) : undefined;

    // For completed games in week 1, use pre-start baseline for starters so post-game ERA doesn't leak
    const probableAwayPitcher: PitcherMetrics | null = awayProbableRaw
      ? {
          id: awayProbableRaw.id,
          fullName: dbAwayPitcher?.fullName ?? awayProbableRaw.fullName,
          pitchHand: dbAwayPitcher?.pitchHand ?? "R",
          gamesStarted: isCompletedGame ? 0 : dbAwayPitcher?.gamesStarted || 1,
          wins: isCompletedGame ? 0 : dbAwayPitcher?.wins ?? awayProbableRaw.wins ?? 0,
          losses: isCompletedGame ? 0 : dbAwayPitcher?.losses ?? awayProbableRaw.losses ?? 0,
          inningsPitched: isCompletedGame
            ? 0
            : dbAwayPitcher && dbAwayPitcher.inningsPitched > 0
            ? dbAwayPitcher.inningsPitched
            : awayProbableRaw.era !== undefined
            ? 5.0
            : 0,
          era: isCompletedGame
            ? awayTeam.teamEra || 3.85
            : dbAwayPitcher && dbAwayPitcher.inningsPitched > 0
            ? dbAwayPitcher.era
            : awayProbableRaw.era ?? (awayTeam.teamEra || 3.85),
          whip: isCompletedGame ? 1.25 : dbAwayPitcher?.whip || 1.25,
          strikeOuts: dbAwayPitcher?.strikeOuts ?? 4,
          walks: dbAwayPitcher?.walks ?? 2,
        }
      : null;

    const probableHomePitcher: PitcherMetrics | null = homeProbableRaw
      ? {
          id: homeProbableRaw.id,
          fullName: dbHomePitcher?.fullName ?? homeProbableRaw.fullName,
          pitchHand: dbHomePitcher?.pitchHand ?? "R",
          gamesStarted: isCompletedGame ? 0 : dbHomePitcher?.gamesStarted || 1,
          wins: isCompletedGame ? 0 : dbHomePitcher?.wins ?? homeProbableRaw.wins ?? 0,
          losses: isCompletedGame ? 0 : dbHomePitcher?.losses ?? homeProbableRaw.losses ?? 0,
          inningsPitched: isCompletedGame
            ? 0
            : dbHomePitcher && dbHomePitcher.inningsPitched > 0
            ? dbHomePitcher.inningsPitched
            : homeProbableRaw.era !== undefined
            ? 5.0
            : 0,
          era: isCompletedGame
            ? homeTeam.teamEra || 3.75
            : dbHomePitcher && dbHomePitcher.inningsPitched > 0
            ? dbHomePitcher.era
            : homeProbableRaw.era ?? (homeTeam.teamEra || 3.75),
          whip: isCompletedGame ? 1.22 : dbHomePitcher?.whip || 1.22,
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
      awayTeam: rawAwayTeam,
      homeTeam: rawHomeTeam,
      awayScore: g.teams.away.score ?? g.linescore?.teams?.away?.runs ?? null,
      homeScore: g.teams.home.score ?? g.linescore?.teams?.home?.runs ?? null,
      awayHits: g.linescore?.teams?.away?.hits ?? null,
      homeHits: g.linescore?.teams?.home?.hits ?? null,
      awayErrors: g.linescore?.teams?.away?.errors ?? null,
      homeErrors: g.linescore?.teams?.home?.errors ?? null,
      probableAwayPitcher,
      probableHomePitcher,
    };

    const analysis = evaluateGameMatchup({
      ...matchupInput,
      awayTeam,
      homeTeam,
    });

    // Overlay locked picks from Supabase system_picks if present for this game
    const lockedForGame = lockedPicksByGame.get(g.gamePk);
    if (lockedForGame) {
      for (const key of ["moneyline", "runline", "totals"] as const) {
        const m = analysis.markets[key];
        const locked = lockedForGame.get(m.market);
        if (locked) {
          m.pick = locked.pick;
          m.line = locked.line;
          m.confidence = locked.confidence;
          m.result =
            locked.result !== "pending"
              ? locked.result
              : gradeMarketPick({
                  market: m.market,
                  pick: locked.pick,
                  awayTeamShortName: rawAwayTeam.shortName,
                  homeTeamShortName: rawHomeTeam.shortName,
                  awayScore: matchupInput.awayScore,
                  homeScore: matchupInput.homeScore,
                  statusCode: matchupInput.statusCode,
                });
        }
      }
    }

    return {
      ...matchupInput,
      analysis,
    };
  };

  const allEnrichedGames = scheduleGames.map(enrichScheduleGame);
  const enrichedGames = allEnrichedGames.filter((g) => g.officialDate === activeDate);

  // Tally system recommendation accuracy across all completed games in the window
  const makeBucket = (wins: number, losses: number): SystemRecordBucket => {
    const total = wins + losses;
    return {
      wins,
      losses,
      pct: total > 0 ? Number(((wins / total) * 100).toFixed(1)) : 0,
    };
  };

  let mlWins = 0;
  let mlLosses = 0;
  let rlWins = 0;
  let rlLosses = 0;
  let totWins = 0;
  let totLosses = 0;
  let highWins = 0;
  let highLosses = 0;
  let gamesEvaluated = 0;

  for (const g of allEnrichedGames) {
    if (g.statusCode !== "F" || g.awayScore === null || g.homeScore === null) {
      continue;
    }
    gamesEvaluated += 1;

    for (const m of Object.values(g.analysis.markets)) {
      if (m.result === "pending") continue;
      const isWin = m.result === "won";

      if (m.market === "Ganador") {
        if (isWin) mlWins += 1;
        else mlLosses += 1;
      } else if (m.market === "Hándicap") {
        if (isWin) rlWins += 1;
        else rlLosses += 1;
      } else if (m.market === "Totales") {
        if (isWin) totWins += 1;
        else totLosses += 1;
      }

      if (m.confidence === "Alta") {
        if (isWin) highWins += 1;
        else highLosses += 1;
      }
    }
  }

  const systemRecord: SystemRecordSummary = {
    overall: makeBucket(mlWins + rlWins + totWins, mlLosses + rlLosses + totLosses),
    moneyline: makeBucket(mlWins, mlLosses),
    runline: makeBucket(rlWins, rlLosses),
    totals: makeBucket(totWins, totLosses),
    highConfidence: makeBucket(highWins, highLosses),
    gamesEvaluated,
  };

  return {
    activeDate,
    availableDates,
    games: enrichedGames,
    allWindowGames: allEnrichedGames,
    source,
    systemRecord,
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
