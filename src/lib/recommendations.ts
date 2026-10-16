// Hybrid Recommendation Engine for LMP Games
// Combines smoothed Expected Runs projection with a 4-Factor Scorecard (Starter, Bullpen, Offense, Home/Park)

export interface TeamMetrics {
  id: number;
  name: string;
  shortName: string;
  abbreviation: string;
  venueName: string;
  wins: number;
  losses: number;
  winningPercentage: number;
  gamesBack: string;
  streakCode: string;
  runsScored: number;
  runsAllowed: number;
  runDifferential: number;
  homeWins: number;
  homeLosses: number;
  awayWins: number;
  awayLosses: number;
  lastTenWins: number;
  lastTenLosses: number;
  teamAvg: number;
  teamOps: number;
  teamEra: number;
  bullpenEra: number;
  recentRunsPerGame?: number; // Last 5 games average runs scored
  bullpenPitchesLast2Days?: number; // Reliever workload over the previous 2 days
}

export interface PitcherMetrics {
  id: number;
  fullName: string;
  pitchHand: string; // "R" | "L"
  gamesStarted: number;
  wins: number;
  losses: number;
  inningsPitched: number;
  era: number;
  whip: number;
  strikeOuts: number;
  walks: number;
}

export interface GameMatchupInput {
  gamePk: number;
  officialDate: string;
  gameDate: string;
  statusCode: string;
  detailedState: string;
  venueName: string;
  awayTeam: TeamMetrics;
  homeTeam: TeamMetrics;
  awayScore?: number | null;
  homeScore?: number | null;
  awayHits?: number | null;
  homeHits?: number | null;
  awayErrors?: number | null;
  homeErrors?: number | null;
  probableAwayPitcher: PitcherMetrics | null;
  probableHomePitcher: PitcherMetrics | null;
}

export interface FactorEvaluation {
  category: "Starter" | "Bullpen" | "Offense" | "HomeField";
  label: string;
  advantage: "away" | "home" | "even";
  /** Score from -2 (strong away advantage) to +2 (strong home advantage) */
  score: number;
  awayValue: string;
  homeValue: string;
  summary: string;
}

export interface MarketRecommendation {
  market: "Ganador" | "Hándicap" | "Totales";
  pick: string;
  line: string;
  confidence: "Alta" | "Media" | "Moderada";
  rationale: string;
  result: "won" | "lost" | "pending";
}

export interface HybridGameAnalysis {
  projectedAwayRuns: number;
  projectedHomeRuns: number;
  projectedTotalRuns: number;
  projectedMargin: number; // home - away
  overallAdvantage: "away" | "home" | "even";
  totalScorecardPoints: number; // Sum of factor scores (-8 to +8)
  markets: {
    moneyline: MarketRecommendation;
    runline: MarketRecommendation;
    totals: MarketRecommendation;
  };
  factors: FactorEvaluation[];
}

// Winter league baseline constants for Bayesian smoothing early in the season
const LEAGUE_AVG_RUNS_PER_TEAM = 4.35;
const LEAGUE_AVG_ERA = 3.95;
const LEAGUE_BOOK_TOTAL_LINE = 8.5;

/**
 * Applies early-season Bayesian smoothing so 1 or 2 blowout games do not distort projections.
 */
function smoothRate(observedRate: number, sampleGames: number, baseline: number, priorWeight = 4): number {
  if (sampleGames <= 0 || !Number.isFinite(observedRate) || observedRate <= 0) {
    return baseline;
  }
  return (observedRate * sampleGames + baseline * priorWeight) / (sampleGames + priorWeight);
}

/**
 * Estimates a starter's effective ERA with sample-size smoothing based on innings pitched.
 */
function getEffectiveStarterEra(pitcher: PitcherMetrics | null, teamEra: number): number {
  const fallbackBaseline = teamEra > 0 ? (teamEra + LEAGUE_AVG_ERA) / 2 : LEAGUE_AVG_ERA;
  if (!pitcher || pitcher.inningsPitched <= 0) {
    return fallbackBaseline;
  }
  return (pitcher.era * pitcher.inningsPitched + fallbackBaseline * 12) / (pitcher.inningsPitched + 12);
}

/**
 * Evaluates a single LMP matchup and produces both the Expected Runs projection
 * and the 4-Factor Scorecard for Moneyline (Ganador), Runline (Hándicap ±1.5), and Totals (Totales).
 */
export function evaluateGameMatchup(matchup: GameMatchupInput): HybridGameAnalysis {
  const { awayTeam, homeTeam, probableAwayPitcher, probableHomePitcher } = matchup;

  const awayGamesPlayed = Math.max(awayTeam.wins + awayTeam.losses, 0);
  const homeGamesPlayed = Math.max(homeTeam.wins + homeTeam.losses, 0);

  // 1. Offensive runs per game (smoothed with league baseline + recent 5-game form)
  const rawAwayRpg = awayGamesPlayed > 0 ? awayTeam.runsScored / awayGamesPlayed : LEAGUE_AVG_RUNS_PER_TEAM;
  const rawHomeRpg = homeGamesPlayed > 0 ? homeTeam.runsScored / homeGamesPlayed : LEAGUE_AVG_RUNS_PER_TEAM;

  const seasonAwayOffense = smoothRate(rawAwayRpg, awayGamesPlayed, LEAGUE_AVG_RUNS_PER_TEAM, 4);
  const seasonHomeOffense = smoothRate(rawHomeRpg, homeGamesPlayed, LEAGUE_AVG_RUNS_PER_TEAM, 4);

  const recentAwayOffense = awayTeam.recentRunsPerGame ?? seasonAwayOffense;
  const recentHomeOffense = homeTeam.recentRunsPerGame ?? seasonHomeOffense;

  const blendedAwayOffense = seasonAwayOffense * 0.65 + recentAwayOffense * 0.35;
  const blendedHomeOffense = seasonHomeOffense * 0.65 + recentHomeOffense * 0.35;

  // 2. Starting pitcher effective ERA (55% weight ~ 5 innings)
  const awayStarterEra = getEffectiveStarterEra(probableAwayPitcher, awayTeam.teamEra);
  const homeStarterEra = getEffectiveStarterEra(probableHomePitcher, homeTeam.teamEra);

  // 3. Bullpen effective ERA + fatigue penalty (45% weight ~ 4 innings)
  const rawAwayBullpenEra = awayTeam.bullpenEra > 0 ? awayTeam.bullpenEra : awayTeam.teamEra || LEAGUE_AVG_ERA;
  const rawHomeBullpenEra = homeTeam.bullpenEra > 0 ? homeTeam.bullpenEra : homeTeam.teamEra || LEAGUE_AVG_ERA;

  const awayBullpenFatiguePenalty =
    (awayTeam.bullpenPitchesLast2Days ?? 0) > 110 ? 0.45 : (awayTeam.bullpenPitchesLast2Days ?? 0) > 75 ? 0.2 : 0;
  const homeBullpenFatiguePenalty =
    (homeTeam.bullpenPitchesLast2Days ?? 0) > 110 ? 0.45 : (homeTeam.bullpenPitchesLast2Days ?? 0) > 75 ? 0.2 : 0;

  const effectiveAwayBullpenEra =
    smoothRate(rawAwayBullpenEra, awayGamesPlayed, LEAGUE_AVG_ERA, 3) + awayBullpenFatiguePenalty;
  const effectiveHomeBullpenEra =
    smoothRate(rawHomeBullpenEra, homeGamesPlayed, LEAGUE_AVG_ERA, 3) + homeBullpenFatiguePenalty;

  // Composite runs prevented profile for each pitching staff
  const awayStaffCompositeEra = awayStarterEra * 0.55 + effectiveAwayBullpenEra * 0.45;
  const homeStaffCompositeEra = homeStarterEra * 0.55 + effectiveHomeBullpenEra * 0.45;

  const awayPitchingMultiplier = awayStaffCompositeEra / LEAGUE_AVG_ERA;
  const homePitchingMultiplier = homeStaffCompositeEra / LEAGUE_AVG_ERA;

  const homeFieldRunBoost = 0.18;

  const rawProjectedAwayRuns = blendedAwayOffense * homePitchingMultiplier;
  const rawProjectedHomeRuns = blendedHomeOffense * awayPitchingMultiplier + homeFieldRunBoost;

  const projectedAwayRuns = Number(Math.max(1.8, Math.min(8.5, rawProjectedAwayRuns)).toFixed(1));
  const projectedHomeRuns = Number(Math.max(1.8, Math.min(8.5, rawProjectedHomeRuns)).toFixed(1));
  const projectedTotalRuns = Number((projectedAwayRuns + projectedHomeRuns).toFixed(1));
  const projectedMargin = Number((projectedHomeRuns - projectedAwayRuns).toFixed(1));

  // --- 4-FACTOR SCORECARD ---

  // Factor 1: Starting Pitcher Matchup
  const starterDiff = awayStarterEra - homeStarterEra;
  let starterScore = 0;
  if (starterDiff >= 0.85) starterScore = 2;
  else if (starterDiff >= 0.3) starterScore = 1;
  else if (starterDiff <= -0.85) starterScore = -2;
  else if (starterDiff <= -0.3) starterScore = -1;

  const awayStarterLabel = probableAwayPitcher
    ? `${probableAwayPitcher.fullName} (${probableAwayPitcher.pitchHand}) · ${awayStarterEra.toFixed(2)} ERA est.`
    : `Por anunciar (${awayStarterEra.toFixed(2)} ERA est.)`;
  const homeStarterLabel = probableHomePitcher
    ? `${probableHomePitcher.fullName} (${probableHomePitcher.pitchHand}) · ${homeStarterEra.toFixed(2)} ERA est.`
    : `Por anunciar (${homeStarterEra.toFixed(2)} ERA est.)`;

  const starterFactor: FactorEvaluation = {
    category: "Starter",
    label: "Pitcheo Abridor",
    advantage: starterScore > 0 ? "home" : starterScore < 0 ? "away" : "even",
    score: starterScore,
    awayValue: awayStarterLabel,
    homeValue: homeStarterLabel,
    summary:
      starterScore > 0
        ? `${homeTeam.shortName} tiene ventaja en la loma inicial (${homeStarterEra.toFixed(2)} vs ${awayStarterEra.toFixed(2)} ERA proyectado).`
        : starterScore < 0
        ? `${awayTeam.shortName} presenta mejor brazo abridor (${awayStarterEra.toFixed(2)} vs ${homeStarterEra.toFixed(2)} ERA proyectado).`
        : "Duelo de abridores parejo en efectividad proyectada.",
  };

  // Factor 2: Bullpen & Workload
  const bullpenDiff = effectiveAwayBullpenEra - effectiveHomeBullpenEra;
  let bullpenScore = 0;
  if (bullpenDiff >= 0.65) bullpenScore = 2;
  else if (bullpenDiff >= 0.25) bullpenScore = 1;
  else if (bullpenDiff <= -0.65) bullpenScore = -2;
  else if (bullpenDiff <= -0.25) bullpenScore = -1;

  const bullpenFactor: FactorEvaluation = {
    category: "Bullpen",
    label: "Bullpen y Descanso",
    advantage: bullpenScore > 0 ? "home" : bullpenScore < 0 ? "away" : "even",
    score: bullpenScore,
    awayValue: `${effectiveAwayBullpenEra.toFixed(2)} ERA${awayBullpenFatiguePenalty > 0 ? " (Carga alta)" : " (Descansado)"}`,
    homeValue: `${effectiveHomeBullpenEra.toFixed(2)} ERA${homeBullpenFatiguePenalty > 0 ? " (Carga alta)" : " (Descansado)"}`,
    summary:
      bullpenScore > 0
        ? `El relevo de ${homeTeam.shortName} proyecta mayor solidez para cerrar el juego (${effectiveHomeBullpenEra.toFixed(2)} vs ${effectiveAwayBullpenEra.toFixed(2)}).`
        : bullpenScore < 0
        ? `El bullpen de ${awayTeam.shortName} llega con ventaja para las últimas entradas (${effectiveAwayBullpenEra.toFixed(2)} vs ${effectiveHomeBullpenEra.toFixed(2)}).`
        : "Ambos cuerpos de relevo llegan con efectividad y descanso similares.",
  };

  // Factor 3: Recent Offense & Lineup Momentum
  const offenseDiff = blendedHomeOffense - blendedAwayOffense;
  let offenseScore = 0;
  if (offenseDiff >= 0.75) offenseScore = 2;
  else if (offenseDiff >= 0.25) offenseScore = 1;
  else if (offenseDiff <= -0.75) offenseScore = -2;
  else if (offenseDiff <= -0.25) offenseScore = -1;

  const offenseFactor: FactorEvaluation = {
    category: "Offense",
    label: "Ofensiva Reciente (5J)",
    advantage: offenseScore > 0 ? "home" : offenseScore < 0 ? "away" : "even",
    score: offenseScore,
    awayValue: `${blendedAwayOffense.toFixed(2)} C/J (${awayTeam.runsScored} C total)`,
    homeValue: `${blendedHomeOffense.toFixed(2)} C/J (${homeTeam.runsScored} C total)`,
    summary:
      offenseScore > 0
        ? `La ofensiva de ${homeTeam.shortName} produce más carreras por juego (${blendedHomeOffense.toFixed(2)} vs ${blendedAwayOffense.toFixed(2)}).`
        : offenseScore < 0
        ? `El bateo de ${awayTeam.shortName} llega con mejor ritmo productor (${blendedAwayOffense.toFixed(2)} vs ${blendedHomeOffense.toFixed(2)}).`
        : "Producción ofensiva equilibrada entre ambos clubes.",
  };

  // Factor 4: Home/Away Split & Venue Context
  const homeWinPct =
    homeTeam.homeWins + homeTeam.homeLosses > 0
      ? homeTeam.homeWins / (homeTeam.homeWins + homeTeam.homeLosses)
      : 0.54;
  const awayWinPct =
    awayTeam.awayWins + awayTeam.awayLosses > 0
      ? awayTeam.awayWins / (awayTeam.awayWins + awayTeam.awayLosses)
      : 0.46;

  const splitDiff = homeWinPct - awayWinPct;
  const homeFieldScore = splitDiff >= 0.25 ? 2 : splitDiff >= 0.05 ? 1 : splitDiff <= -0.2 ? -1 : 0;

  const homeFieldFactor: FactorEvaluation = {
    category: "HomeField",
    label: "Localía y Estadio",
    advantage: homeFieldScore > 0 ? "home" : homeFieldScore < 0 ? "away" : "even",
    score: homeFieldScore,
    awayValue: `${awayTeam.awayWins}-${awayTeam.awayLosses} Visitante (${awayTeam.streakCode})`,
    homeValue: `${homeTeam.homeWins}-${homeTeam.homeLosses} Local (${homeTeam.streakCode})`,
    summary:
      homeFieldScore > 0
        ? `${homeTeam.shortName} aprovecha su condición de local en ${matchup.venueName || homeTeam.venueName}.`
        : homeFieldScore < 0
        ? `${awayTeam.shortName} ha respondido bien jugando en gira (${awayTeam.awayWins}-${awayTeam.awayLosses}).`
        : "Desempeño neutro entre localía y gira.",
  };

  const factors = [starterFactor, bullpenFactor, offenseFactor, homeFieldFactor];
  const totalScorecardPoints = factors.reduce((acc, f) => acc + f.score, 0);

  // --- MARKET RECOMMENDATIONS (Ganador, Hándicap ±1.5, Totales) ---
  const isFinalWithScores =
    matchup.statusCode === "F" &&
    typeof matchup.awayScore === "number" &&
    typeof matchup.homeScore === "number" &&
    matchup.awayScore !== matchup.homeScore;

  const actualAwayScore = matchup.awayScore ?? 0;
  const actualHomeScore = matchup.homeScore ?? 0;

  // 1. Ganador (Moneyline)
  const favoredIsHome = projectedMargin > 0 || (projectedMargin === 0 && totalScorecardPoints >= 0);
  const favoredTeam = favoredIsHome ? homeTeam : awayTeam;
  const underdogTeam = favoredIsHome ? awayTeam : homeTeam;
  const absMargin = Math.abs(projectedMargin);
  const absPoints = Math.abs(totalScorecardPoints);

  const mlConfidence: "Alta" | "Media" | "Moderada" =
    absMargin >= 1.1 && absPoints >= 3 ? "Alta" : absMargin >= 0.5 || absPoints >= 2 ? "Media" : "Moderada";

  const mlResult: "won" | "lost" | "pending" = isFinalWithScores
    ? (favoredIsHome ? actualHomeScore > actualAwayScore : actualAwayScore > actualHomeScore)
      ? "won"
      : "lost"
    : "pending";

  const moneylineRec: MarketRecommendation = {
    market: "Ganador",
    pick: `${favoredTeam.shortName} a Ganar`,
    line: `Proy: ${favoredTeam.abbreviation} ${(favoredIsHome ? projectedHomeRuns : projectedAwayRuns).toFixed(1)} - ${(favoredIsHome ? projectedAwayRuns : projectedHomeRuns).toFixed(1)}`,
    confidence: mlConfidence,
    rationale: `${favoredTeam.shortName} proyecta ventaja de +${absMargin.toFixed(1)} carreras y +${absPoints} puntos en el semáforo de factores.`,
    result: mlResult,
  };

  // 2. Hándicap (Runline ±1.5)
  const coverMinus15 = absMargin >= 1.4 && absPoints >= 3;
  const runlineConfidence: "Alta" | "Media" | "Moderada" = coverMinus15
    ? absMargin >= 1.8
      ? "Alta"
      : "Media"
    : absMargin <= 0.7
    ? "Alta"
    : "Media";

  const actualFavoredMargin = favoredIsHome
    ? actualHomeScore - actualAwayScore
    : actualAwayScore - actualHomeScore;

  const rlResult: "won" | "lost" | "pending" = isFinalWithScores
    ? coverMinus15
      ? actualFavoredMargin >= 2
        ? "won"
        : "lost"
      : actualFavoredMargin <= 1
      ? "won"
      : "lost"
    : "pending";

  const runlineRec: MarketRecommendation = coverMinus15
    ? {
        market: "Hándicap",
        pick: `${favoredTeam.shortName} -1.5`,
        line: "Hándicap -1.5 C",
        confidence: runlineConfidence,
        rationale: `El margen proyectado de ${absMargin.toFixed(1)} carreras respalda que ${favoredTeam.shortName} cubra la línea de -1.5.`,
        result: rlResult,
      }
    : {
        market: "Hándicap",
        pick: `${underdogTeam.shortName} +1.5`,
        line: "Hándicap +1.5 C",
        confidence: runlineConfidence,
        rationale: `Juego cerrado (margen estimado de ${absMargin.toFixed(1)} carreras) que da alto valor a ${underdogTeam.shortName} +1.5 carreras.`,
        result: rlResult,
      };

  // 3. Totales (Altas / Bajas respecto a línea base de 8.5)
  const totalDelta = projectedTotalRuns - LEAGUE_BOOK_TOTAL_LINE;
  const isOver = totalDelta >= 0;
  const absTotalDelta = Math.abs(totalDelta);
  const totalsConfidence: "Alta" | "Media" | "Moderada" =
    absTotalDelta >= 1.0 ? "Alta" : absTotalDelta >= 0.5 ? "Media" : "Moderada";

  const actualTotalRuns = actualAwayScore + actualHomeScore;
  const totalsResult: "won" | "lost" | "pending" = isFinalWithScores
    ? isOver
      ? actualTotalRuns > LEAGUE_BOOK_TOTAL_LINE
        ? "won"
        : "lost"
      : actualTotalRuns < LEAGUE_BOOK_TOTAL_LINE
      ? "won"
      : "lost"
    : "pending";

  const totalsRec: MarketRecommendation = {
    market: "Totales",
    pick: `${isOver ? "ALTAS" : "BAJAS"} ${LEAGUE_BOOK_TOTAL_LINE}`,
    line: `Total Proy: ${projectedTotalRuns.toFixed(1)} C`,
    confidence: totalsConfidence,
    rationale: isOver
      ? `La proyección combinada de ${projectedTotalRuns.toFixed(1)} carreras supera la línea de ${LEAGUE_BOOK_TOTAL_LINE} por el ritmo ofensivo y pitcheo.`
      : `El duelo de pitcheo proyecta ${projectedTotalRuns.toFixed(1)} carreras combinadas, favoreciendo las Bajas de ${LEAGUE_BOOK_TOTAL_LINE}.`,
    result: totalsResult,
  };

  return {
    projectedAwayRuns,
    projectedHomeRuns,
    projectedTotalRuns,
    projectedMargin,
    overallAdvantage: totalScorecardPoints > 0 ? "home" : totalScorecardPoints < 0 ? "away" : "even",
    totalScorecardPoints,
    markets: {
      moneyline: moneylineRec,
      runline: runlineRec,
      totals: totalsRec,
    },
    factors,
  };
}

/**
 * Grades a locked pre-game market pick against the final score once a game finishes.
 */
export function gradeMarketPick(params: {
  market: "Ganador" | "Hándicap" | "Totales";
  pick: string;
  awayTeamShortName: string;
  homeTeamShortName: string;
  awayScore: number | null | undefined;
  homeScore: number | null | undefined;
  statusCode: string;
}): "won" | "lost" | "pending" {
  const { market, pick, awayTeamShortName, homeTeamShortName, awayScore, homeScore, statusCode } =
    params;

  if (
    statusCode !== "F" ||
    typeof awayScore !== "number" ||
    typeof homeScore !== "number" ||
    awayScore === homeScore
  ) {
    return "pending";
  }

  const pickedHome = pick.startsWith(homeTeamShortName);
  const pickedAway = pick.startsWith(awayTeamShortName);

  if (market === "Ganador") {
    if (pickedHome) return homeScore > awayScore ? "won" : "lost";
    if (pickedAway) return awayScore > homeScore ? "won" : "lost";
    return "pending";
  }

  if (market === "Hándicap") {
    const isMinus15 = pick.includes("-1.5");
    if (pickedHome) {
      const margin = homeScore - awayScore;
      return isMinus15 ? (margin >= 2 ? "won" : "lost") : margin >= -1 ? "won" : "lost";
    }
    if (pickedAway) {
      const margin = awayScore - homeScore;
      return isMinus15 ? (margin >= 2 ? "won" : "lost") : margin >= -1 ? "won" : "lost";
    }
    return "pending";
  }

  if (market === "Totales") {
    const total = awayScore + homeScore;
    if (pick.startsWith("ALTAS")) return total > LEAGUE_BOOK_TOTAL_LINE ? "won" : "lost";
    if (pick.startsWith("BAJAS")) return total < LEAGUE_BOOK_TOTAL_LINE ? "won" : "lost";
  }

  return "pending";
}

