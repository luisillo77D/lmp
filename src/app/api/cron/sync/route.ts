import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  fetchGameBoxscore,
  fetchLmpSchedule,
  fetchLmpStandings,
  fetchLmpTeams,
  fetchTeamRosterWithStats,
  LMP_DEFAULT_SEASON,
} from "@/lib/mlb-api";
import { getSupabaseAdminClient } from "@/lib/supabase";

export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret === "your-random-cron-secret") {
    return false;
  }
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return false;
  }
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const received = Buffer.from(authHeader);
  if (expected.length !== received.length) {
    return false;
  }
  return timingSafeEqual(expected, received);
}

export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}

async function handleSync(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized cron trigger" }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const season = req.nextUrl.searchParams.get("season") ?? LMP_DEFAULT_SEASON;

    // 1. Sync Teams & Standings
    const [rawTeams, rawStandings] = await Promise.all([
      fetchLmpTeams(season),
      fetchLmpStandings(season),
    ]);

    const standingsMap = new Map(rawStandings.map((s) => [s.team.id, s]));

    const teamRows = rawTeams.map((team) => {
      const st = standingsMap.get(team.id);
      const splits = st?.records?.splitRecords ?? [];
      const homeSplit = splits.find((r) => r.type === "home");
      const awaySplit = splits.find((r) => r.type === "away");
      const l10Split = splits.find((r) => r.type === "lastTen");

      return {
        id: team.id,
        name: team.name,
        short_name: team.shortName || team.teamName || team.name,
        abbreviation: team.abbreviation,
        venue_name: team.venue?.name ?? null,
        wins: st?.wins ?? 0,
        losses: st?.losses ?? 0,
        winning_percentage: Number.parseFloat(st?.winningPercentage ?? "0") || 0,
        games_back: st?.gamesBack ?? "-",
        streak_code: st?.streak?.streakCode ?? "-",
        runs_scored: st?.runsScored ?? 0,
        runs_allowed: st?.runsAllowed ?? 0,
        run_differential: st?.runDifferential ?? 0,
        home_wins: homeSplit?.wins ?? 0,
        home_losses: homeSplit?.losses ?? 0,
        away_wins: awaySplit?.wins ?? 0,
        away_losses: awaySplit?.losses ?? 0,
        last_ten_wins: l10Split?.wins ?? 0,
        last_ten_losses: l10Split?.losses ?? 0,
        updated_at: new Date().toISOString(),
      };
    });

    const { error: teamsError } = await supabase
      .from("teams")
      .upsert(teamRows, { onConflict: "id" });

    if (teamsError) {
      throw new Error(`Failed to upsert teams: ${teamsError.message}`);
    }

    // 2. Sync Rosters & Player Season Stats
    const playerRows: Array<Record<string, unknown>> = [];
    for (const team of rawTeams) {
      const roster = await fetchTeamRosterWithStats(team.id, season);
      for (const p of roster) {
        const hitting = p.stats?.find((s) => s.group.displayName === "hitting")?.splits?.[0]?.stat;
        const pitching = p.stats?.find((s) => s.group.displayName === "pitching")?.splits?.[0]?.stat;

        playerRows.push({
          id: p.id,
          team_id: team.id,
          full_name: p.fullName,
          primary_number: p.primaryNumber ?? null,
          position_code: p.primaryPosition?.abbreviation ?? p.primaryPosition?.code ?? "P",
          position_name: p.primaryPosition?.name ?? "Player",
          bat_side: p.batSide?.code ?? "R",
          pitch_hand: p.pitchHand?.code ?? "R",
          games_played: Number(hitting?.gamesPlayed ?? 0),
          at_bats: Number(hitting?.atBats ?? 0),
          runs: Number(hitting?.runs ?? 0),
          hits: Number(hitting?.hits ?? 0),
          doubles: Number(hitting?.doubles ?? 0),
          triples: Number(hitting?.triples ?? 0),
          home_runs: Number(hitting?.homeRuns ?? 0),
          rbi: Number(hitting?.rbi ?? 0),
          base_on_balls: Number(hitting?.baseOnBalls ?? 0),
          strike_outs: Number(hitting?.strikeOuts ?? 0),
          stolen_bases: Number(hitting?.stolenBases ?? 0),
          avg: Number.parseFloat(String(hitting?.avg ?? "0")) || 0,
          obp: Number.parseFloat(String(hitting?.obp ?? "0")) || 0,
          slg: Number.parseFloat(String(hitting?.slg ?? "0")) || 0,
          ops: Number.parseFloat(String(hitting?.ops ?? "0")) || 0,
          games_pitched: Number(pitching?.gamesPlayed ?? 0),
          games_started: Number(pitching?.gamesStarted ?? 0),
          wins: Number(pitching?.wins ?? 0),
          losses: Number(pitching?.losses ?? 0),
          saves: Number(pitching?.saves ?? 0),
          innings_pitched: Number.parseFloat(String(pitching?.inningsPitched ?? "0")) || 0,
          pitched_hits: Number(pitching?.hits ?? 0),
          earned_runs: Number(pitching?.earnedRuns ?? 0),
          pitched_walks: Number(pitching?.baseOnBalls ?? 0),
          pitched_strikeouts: Number(pitching?.strikeOuts ?? 0),
          home_runs_allowed: Number(pitching?.homeRuns ?? 0),
          era: Number.parseFloat(String(pitching?.era ?? "0")) || 0,
          whip: Number.parseFloat(String(pitching?.whip ?? "0")) || 0,
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (playerRows.length > 0) {
      const { error: playersError } = await supabase
        .from("players")
        .upsert(playerRows, { onConflict: "id" });

      if (playersError) {
        throw new Error(`Failed to upsert players: ${playersError.message}`);
      }
    }

    const knownPlayerIds = new Set(playerRows.map((r) => Number(r.id)));

    // 3. Sync Schedule Games (Past 5 days through Next 3 days)
    const now = new Date();
    const startDate = new Date(now.getTime() - 5 * 86400000).toISOString().slice(0, 10);
    const endDate = new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 10);

    const scheduleGames = await fetchLmpSchedule({ season, startDate, endDate });

    // Ensure any probable pitchers announced on api.lmp.mx who are not yet on active rosters exist in players
    const missingPitcherRows: Array<Record<string, unknown>> = [];
    for (const g of scheduleGames) {
      const sides = [
        { p: g.teams.away.probablePitcher, teamId: g.teams.away.team.id },
        { p: g.teams.home.probablePitcher, teamId: g.teams.home.team.id },
      ];
      for (const { p, teamId } of sides) {
        if (p && p.id > 0 && !knownPlayerIds.has(p.id)) {
          knownPlayerIds.add(p.id);
          missingPitcherRows.push({
            id: p.id,
            team_id: teamId,
            full_name: p.fullName,
            position_code: "P",
            position_name: "Pitcher",
            wins: p.wins ?? 0,
            losses: p.losses ?? 0,
            era: p.era ?? 0,
            updated_at: new Date().toISOString(),
          });
        }
      }
    }

    if (missingPitcherRows.length > 0) {
      await supabase.from("players").upsert(missingPitcherRows, { onConflict: "id" });
    }

    const gameRows = scheduleGames.map((g) => {
      const awayProbId = g.teams.away.probablePitcher?.id;
      const homeProbId = g.teams.home.probablePitcher?.id;

      return {
        game_pk: g.gamePk,
        season: g.season,
        official_date: g.officialDate,
        game_date: g.gameDate,
        status_code: g.status.statusCode,
        detailed_state: g.status.detailedState,
        venue_name: g.venue?.name ?? null,
        away_team_id: g.teams.away.team.id,
        home_team_id: g.teams.home.team.id,
        away_score: g.teams.away.score ?? g.linescore?.teams?.away?.runs ?? null,
        home_score: g.teams.home.score ?? g.linescore?.teams?.home?.runs ?? null,
        away_hits: g.linescore?.teams?.away?.hits ?? null,
        home_hits: g.linescore?.teams?.home?.hits ?? null,
        away_errors: g.linescore?.teams?.away?.errors ?? null,
        home_errors: g.linescore?.teams?.home?.errors ?? null,
        probable_away_pitcher_id: awayProbId && knownPlayerIds.has(awayProbId) ? awayProbId : null,
        probable_home_pitcher_id: homeProbId && knownPlayerIds.has(homeProbId) ? homeProbId : null,
        updated_at: new Date().toISOString(),
      };
    });

    if (gameRows.length > 0) {
      const { error: gamesError } = await supabase
        .from("games")
        .upsert(gameRows, { onConflict: "game_pk" });

      if (gamesError) {
        throw new Error(`Failed to upsert games: ${gamesError.message}`);
      }
    }

    // 4. Sync Boxscore Game Logs for recently completed games (last 3 days)
    const recentFinalGames = scheduleGames.filter(
      (g) => g.status.abstractGameState === "Final"
    );

    let gameLogCount = 0;
    for (const game of recentFinalGames.slice(-15)) {
      const feed = await fetchGameBoxscore(game.gamePk);
      const boxTeams = feed.liveData?.boxscore?.teams;
      if (!boxTeams) continue;

      const gameStatRows: Array<Record<string, unknown>> = [];

      const sides: Array<{
        isHome: boolean;
        teamId: number;
        oppId: number;
        box?: typeof boxTeams.away;
      }> = [
        {
          isHome: false,
          teamId: game.teams.away.team.id,
          oppId: game.teams.home.team.id,
          box: boxTeams.away,
        },
        {
          isHome: true,
          teamId: game.teams.home.team.id,
          oppId: game.teams.away.team.id,
          box: boxTeams.home,
        },
      ];

      for (const side of sides) {
        if (!side.box?.players) continue;
        const starterPitcherId = side.box.pitchers?.[0];

        for (const playerObj of Object.values(side.box.players)) {
          const playerId = playerObj.person.id;
          if (!knownPlayerIds.has(playerId)) continue;

          const bat = playerObj.stats?.batting;
          if (bat && (bat.atBats || bat.runs || bat.hits || bat.baseOnBalls)) {
            gameStatRows.push({
              game_pk: game.gamePk,
              player_id: playerId,
              team_id: side.teamId,
              opponent_team_id: side.oppId,
              official_date: game.officialDate,
              is_home: side.isHome,
              stat_group: "batting",
              at_bats: bat.atBats ?? 0,
              runs: bat.runs ?? 0,
              hits: bat.hits ?? 0,
              doubles: bat.doubles ?? 0,
              triples: bat.triples ?? 0,
              home_runs: bat.homeRuns ?? 0,
              rbi: bat.rbi ?? 0,
              base_on_balls: bat.baseOnBalls ?? 0,
              strike_outs: bat.strikeOuts ?? 0,
              left_on_base: bat.leftOnBase ?? 0,
              updated_at: new Date().toISOString(),
            });
          }

          const pitch = playerObj.stats?.pitching;
          if (pitch && (pitch.outs || pitch.numberOfPitches || pitch.runs)) {
            gameStatRows.push({
              game_pk: game.gamePk,
              player_id: playerId,
              team_id: side.teamId,
              opponent_team_id: side.oppId,
              official_date: game.officialDate,
              is_home: side.isHome,
              stat_group: "pitching",
              is_starter: starterPitcherId === playerId || (pitch.gamesStarted ?? 0) > 0,
              innings_pitched: Number.parseFloat(pitch.inningsPitched ?? "0") || 0,
              outs_pitched: pitch.outs ?? 0,
              pitched_hits: pitch.hits ?? 0,
              pitched_runs: pitch.runs ?? 0,
              earned_runs: pitch.earnedRuns ?? 0,
              pitched_walks: pitch.baseOnBalls ?? 0,
              pitched_strikeouts: pitch.strikeOuts ?? 0,
              home_runs_allowed: pitch.homeRuns ?? 0,
              pitches_thrown: pitch.numberOfPitches ?? 0,
              strikes_thrown: pitch.strikes ?? 0,
              updated_at: new Date().toISOString(),
            });
          }
        }
      }

      if (gameStatRows.length > 0) {
        const { error: logsError } = await supabase
          .from("player_game_stats")
          .upsert(gameStatRows, { onConflict: "game_pk,player_id,stat_group" });

        if (!logsError) {
          gameLogCount += gameStatRows.length;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      syncedAt: new Date().toISOString(),
      counts: {
        teams: teamRows.length,
        players: playerRows.length,
        games: gameRows.length,
        playerGameStats: gameLogCount,
      },
    });
  } catch (err) {
    const message =
      process.env.NODE_ENV === "production"
        ? "Internal synchronization error"
        : err instanceof Error
        ? err.message
        : "Unknown synchronization error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
