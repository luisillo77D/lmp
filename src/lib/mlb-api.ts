// Official MLB Stats API client for Liga Mexicana del Pacifico (LMP)
// Sport ID: 17 (Winter Leagues) | League ID: 132 (Liga Mexicana del Pacifico)

export const LMP_SPORT_ID = 17;
export const LMP_LEAGUE_ID = 132;
export const LMP_DEFAULT_SEASON = "2026";
const MLB_API_BASE = "https://statsapi.mlb.com/api";

export interface MlbTeamSummary {
  id: number;
  name: string;
  teamName: string;
  shortName: string;
  abbreviation: string;
  venue?: {
    id: number;
    name: string;
  };
}

export interface MlbStandingRecord {
  team: {
    id: number;
    name: string;
  };
  wins: number;
  losses: number;
  winningPercentage: string;
  gamesBack: string;
  streak?: {
    streakCode: string;
  };
  runsScored: number;
  runsAllowed: number;
  runDifferential: number;
  records?: {
    splitRecords?: Array<{
      wins: number;
      losses: number;
      type: string; // "home" | "away" | "lastTen"
      pct: string;
    }>;
  };
}

export interface MlbProbablePitcher {
  id: number;
  fullName: string;
  era?: number;
  wins?: number;
  losses?: number;
}

export interface MlbScheduleGame {
  gamePk: number;
  season: string;
  officialDate: string;
  gameDate: string;
  status: {
    abstractGameState: string; // "Preview" | "Live" | "Final"
    statusCode: string; // "S" | "PW" | "I" | "F"
    detailedState: string;
  };
  venue?: {
    id: number;
    name: string;
  };
  teams: {
    away: {
      team: { id: number; name: string };
      score?: number;
      leagueRecord?: { wins: number; losses: number; pct: string };
      probablePitcher?: MlbProbablePitcher;
    };
    home: {
      team: { id: number; name: string };
      score?: number;
      leagueRecord?: { wins: number; losses: number; pct: string };
      probablePitcher?: MlbProbablePitcher;
    };
  };
  linescore?: {
    teams?: {
      away?: { runs?: number; hits?: number; errors?: number };
      home?: { runs?: number; hits?: number; errors?: number };
    };
  };
}

export interface MlbPlayerSeasonStats {
  id: number;
  fullName: string;
  primaryNumber?: string;
  primaryPosition: {
    code: string;
    name: string;
    abbreviation: string;
  };
  batSide?: { code: string };
  pitchHand?: { code: string };
  currentTeam?: { id: number; name: string };
  stats?: Array<{
    type: { displayName: string };
    group: { displayName: string }; // "hitting" | "pitching"
    splits: Array<{
      stat: Record<string, number | string>;
    }>;
  }>;
}

async function fetchMlbJson<T>(path: string, revalidateSeconds = 300): Promise<T> {
  const url = `${MLB_API_BASE}${path}`;
  const response = await fetch(url, {
    next: { revalidate: revalidateSeconds },
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`MLB Stats API request failed (${response.status}): ${url}`);
  }

  return response.json() as Promise<T>;
}

interface LmpNativeScoreboardGame {
  boxScore?: number | string;
  stadium?: string;
  awayProbablePitcher?: string;
  awayProbablePitcherMlbid?: number | string;
  awayProbablePitcherEra?: string;
  awayProbablePitcherWins?: number;
  awayProbablePitcherLosses?: number;
  homeProbablePitcher?: string;
  homeProbablePitcherMlbid?: number | string;
  homeProbablePitcherEra?: string;
  homeProbablePitcherWins?: number;
  homeProbablePitcherLosses?: number;
}

/**
 * Queries the official LMP scoreboard endpoint (api.lmp.mx/3.0.0/scoreboard)
 * which publishes announced starting pitchers hours before MLB Stats API.
 */
async function fetchLmpScoreboardPitchers(anchorDate: string): Promise<
  Map<
    number,
    {
      away?: MlbProbablePitcher;
      home?: MlbProbablePitcher;
      stadium?: string;
    }
  >
> {
  const map = new Map<
    number,
    { away?: MlbProbablePitcher; home?: MlbProbablePitcher; stadium?: string }
  >();

  try {
    const url = `https://api.lmp.mx/3.0.0/scoreboard?date=${anchorDate}&days_next=5&days_prev=5`;
    const res = await fetch(url, {
      next: { revalidate: 120 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return map;

    const json = (await res.json()) as {
      response?: {
        prevGames?: LmpNativeScoreboardGame[];
        games?: LmpNativeScoreboardGame[];
        nextGames?: LmpNativeScoreboardGame[];
      };
    };

    const allEntries: LmpNativeScoreboardGame[] = [
      ...(json.response?.prevGames ?? []),
      ...(json.response?.games ?? []),
      ...(json.response?.nextGames ?? []),
    ];

    for (const item of allEntries) {
      const gamePk = Number(item.boxScore);
      if (!Number.isFinite(gamePk) || gamePk <= 0) continue;

      const awayName = item.awayProbablePitcher?.trim();
      const homeName = item.homeProbablePitcher?.trim();

      const awayEraParsed = Number.parseFloat(String(item.awayProbablePitcherEra ?? ""));
      const homeEraParsed = Number.parseFloat(String(item.homeProbablePitcherEra ?? ""));

      const away: MlbProbablePitcher | undefined = awayName
        ? {
            id: Number(item.awayProbablePitcherMlbid) || 0,
            fullName: awayName,
            era: Number.isFinite(awayEraParsed) ? awayEraParsed : undefined,
            wins: Number(item.awayProbablePitcherWins ?? 0),
            losses: Number(item.awayProbablePitcherLosses ?? 0),
          }
        : undefined;

      const home: MlbProbablePitcher | undefined = homeName
        ? {
            id: Number(item.homeProbablePitcherMlbid) || 0,
            fullName: homeName,
            era: Number.isFinite(homeEraParsed) ? homeEraParsed : undefined,
            wins: Number(item.homeProbablePitcherWins ?? 0),
            losses: Number(item.homeProbablePitcherLosses ?? 0),
          }
        : undefined;

      map.set(gamePk, {
        away,
        home,
        stadium: item.stadium?.trim() || undefined,
      });
    }
  } catch {
    // Gracefully ignore if api.lmp.mx is temporarily unreachable
  }

  return map;
}

/**
 * Fetches all active LMP teams for the given season.
 */
export async function fetchLmpTeams(season = LMP_DEFAULT_SEASON): Promise<MlbTeamSummary[]> {
  const data = await fetchMlbJson<{ teams?: MlbTeamSummary[] }>(
    `/v1/teams?sportId=${LMP_SPORT_ID}&leagueId=${LMP_LEAGUE_ID}&season=${season}`
  );
  return data.teams ?? [];
}

/**
 * Fetches current LMP standings with home/away/lastTen split records and run differentials.
 */
export async function fetchLmpStandings(
  season = LMP_DEFAULT_SEASON
): Promise<MlbStandingRecord[]> {
  const data = await fetchMlbJson<{
    records?: Array<{ teamRecords?: MlbStandingRecord[] }>;
  }>(`/v1/standings?leagueId=${LMP_LEAGUE_ID}&season=${season}&standingsTypes=regularSeason`);

  const allRecords: MlbStandingRecord[] = [];
  for (const group of data.records ?? []) {
    if (group.teamRecords) {
      allRecords.push(...group.teamRecords);
    }
  }
  return allRecords;
}

/**
 * Fetches the LMP schedule with probable pitchers and linescores,
 * enriched with official probable pitchers from api.lmp.mx/3.0.0/scoreboard.
 */
export async function fetchLmpSchedule(options?: {
  season?: string;
  startDate?: string;
  endDate?: string;
  date?: string;
}): Promise<MlbScheduleGame[]> {
  const season = options?.season ?? LMP_DEFAULT_SEASON;
  const params = new URLSearchParams({
    sportId: String(LMP_SPORT_ID),
    leagueId: String(LMP_LEAGUE_ID),
    season,
    hydrate: "probablePitcher,linescore,team",
  });

  if (options?.date) {
    params.set("date", options.date);
  } else {
    if (options?.startDate) params.set("startDate", options.startDate);
    if (options?.endDate) params.set("endDate", options.endDate);
  }

  const anchorDate =
    options?.date ??
    options?.startDate ??
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mazatlan",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

  const [data, lmpPitcherMap] = await Promise.all([
    fetchMlbJson<{
      dates?: Array<{ date: string; games?: MlbScheduleGame[] }>;
    }>(`/v1/schedule?${params.toString()}`, 120),
    fetchLmpScoreboardPitchers(anchorDate),
  ]);

  const games: MlbScheduleGame[] = [];
  for (const dateEntry of data.dates ?? []) {
    for (const game of dateEntry.games ?? []) {
      const lmpInfo = lmpPitcherMap.get(game.gamePk);
      if (lmpInfo) {
        if (!game.teams.away.probablePitcher && lmpInfo.away) {
          game.teams.away.probablePitcher = lmpInfo.away;
        }
        if (!game.teams.home.probablePitcher && lmpInfo.home) {
          game.teams.home.probablePitcher = lmpInfo.home;
        }
        if (!game.venue?.name && lmpInfo.stadium) {
          game.venue = { id: 0, name: lmpInfo.stadium };
        }
      }
      games.push(game);
    }
  }
  return games;
}

/**
 * Fetches a team's roster hydrated with each player's current season batting & pitching statistics.
 */
export async function fetchTeamRosterWithStats(
  teamId: number,
  season = LMP_DEFAULT_SEASON
): Promise<MlbPlayerSeasonStats[]> {
  const data = await fetchMlbJson<{
    roster?: Array<{
      person: MlbPlayerSeasonStats;
      jerseyNumber?: string;
      position: { code: string; name: string; abbreviation: string };
    }>;
  }>(
    `/v1/teams/${teamId}/roster?season=${season}&hydrate=person(stats(type=season,season=${season},sportId=${LMP_SPORT_ID}))`
  );

  return (data.roster ?? []).map((entry) => ({
    ...entry.person,
    primaryNumber: entry.jerseyNumber ?? entry.person.primaryNumber,
    primaryPosition: entry.position ?? entry.person.primaryPosition,
    currentTeam: { id: teamId, name: "" },
  }));
}

/**
 * Fetches the full live feed & boxscore for a single gamePk to extract game logs and bullpen usage.
 */
export async function fetchGameBoxscore(gamePk: number) {
  return fetchMlbJson<{
    gameData?: {
      game?: { pk: number; season: string };
      datetime?: { officialDate: string; dateTime: string };
      status?: { abstractGameState: string; statusCode: string; detailedState: string };
    };
    liveData?: {
      boxscore?: {
        teams?: {
          away?: MlbBoxscoreTeam;
          home?: MlbBoxscoreTeam;
        };
      };
    };
  }>(`/v1.1/game/${gamePk}/feed/live`, 120);
}

export interface MlbBoxscorePlayer {
  person: { id: number; fullName: string };
  jerseyNumber?: string;
  position: { code: string; name: string; abbreviation: string };
  stats?: {
    batting?: {
      atBats?: number;
      runs?: number;
      hits?: number;
      doubles?: number;
      triples?: number;
      homeRuns?: number;
      rbi?: number;
      baseOnBalls?: number;
      strikeOuts?: number;
      leftOnBase?: number;
    };
    pitching?: {
      gamesStarted?: number;
      inningsPitched?: string;
      outs?: number;
      hits?: number;
      runs?: number;
      earnedRuns?: number;
      baseOnBalls?: number;
      strikeOuts?: number;
      homeRuns?: number;
      numberOfPitches?: number;
      strikes?: number;
    };
  };
}

export interface MlbBoxscoreTeam {
  team: { id: number; name: string };
  teamStats?: {
    batting?: {
      runs?: number;
      hits?: number;
      avg?: string;
      ops?: string;
    };
    pitching?: {
      era?: string;
      runs?: number;
      earnedRuns?: number;
      inningsPitched?: string;
    };
  };
  players?: Record<string, MlbBoxscorePlayer>;
  pitchers?: number[]; // Ordered list of pitcher IDs: index 0 is the starting pitcher
}
