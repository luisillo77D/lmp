-- LMP Analytics & Picks Database Schema (Supabase / PostgreSQL)

-- 1. Teams Table
CREATE TABLE IF NOT EXISTS public.teams (
  id INTEGER PRIMARY KEY, -- MLB Stats API team ID (e.g. 5482 for Algodoneros de Guasave)
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  venue_name TEXT,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  winning_percentage NUMERIC(5, 3) NOT NULL DEFAULT 0.000,
  games_back TEXT DEFAULT '-',
  streak_code TEXT DEFAULT '-',
  runs_scored INTEGER NOT NULL DEFAULT 0,
  runs_allowed INTEGER NOT NULL DEFAULT 0,
  run_differential INTEGER NOT NULL DEFAULT 0,
  home_wins INTEGER NOT NULL DEFAULT 0,
  home_losses INTEGER NOT NULL DEFAULT 0,
  away_wins INTEGER NOT NULL DEFAULT 0,
  away_losses INTEGER NOT NULL DEFAULT 0,
  last_ten_wins INTEGER NOT NULL DEFAULT 0,
  last_ten_losses INTEGER NOT NULL DEFAULT 0,
  team_avg NUMERIC(4, 3) DEFAULT 0.000,
  team_ops NUMERIC(4, 3) DEFAULT 0.000,
  team_era NUMERIC(5, 2) DEFAULT 0.00,
  bullpen_era NUMERIC(5, 2) DEFAULT 0.00,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Players Table
CREATE TABLE IF NOT EXISTS public.players (
  id INTEGER PRIMARY KEY, -- MLB Stats API person ID
  team_id INTEGER REFERENCES public.teams(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  primary_number TEXT,
  position_code TEXT NOT NULL, -- P, C, 1B, 2B, 3B, SS, OF, DH
  position_name TEXT NOT NULL,
  bat_side TEXT DEFAULT 'R', -- R, L, S
  pitch_hand TEXT DEFAULT 'R', -- R, L
  -- Season batting summary
  games_played INTEGER NOT NULL DEFAULT 0,
  at_bats INTEGER NOT NULL DEFAULT 0,
  runs INTEGER NOT NULL DEFAULT 0,
  hits INTEGER NOT NULL DEFAULT 0,
  doubles INTEGER NOT NULL DEFAULT 0,
  triples INTEGER NOT NULL DEFAULT 0,
  home_runs INTEGER NOT NULL DEFAULT 0,
  rbi INTEGER NOT NULL DEFAULT 0,
  base_on_balls INTEGER NOT NULL DEFAULT 0,
  strike_outs INTEGER NOT NULL DEFAULT 0,
  stolen_bases INTEGER NOT NULL DEFAULT 0,
  avg NUMERIC(4, 3) DEFAULT 0.000,
  obp NUMERIC(4, 3) DEFAULT 0.000,
  slg NUMERIC(4, 3) DEFAULT 0.000,
  ops NUMERIC(4, 3) DEFAULT 0.000,
  -- Season pitching summary
  games_pitched INTEGER NOT NULL DEFAULT 0,
  games_started INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  innings_pitched NUMERIC(5, 1) DEFAULT 0.0,
  pitched_hits INTEGER NOT NULL DEFAULT 0,
  earned_runs INTEGER NOT NULL DEFAULT 0,
  pitched_walks INTEGER NOT NULL DEFAULT 0,
  pitched_strikeouts INTEGER NOT NULL DEFAULT 0,
  home_runs_allowed INTEGER NOT NULL DEFAULT 0,
  era NUMERIC(5, 2) DEFAULT 0.00,
  whip NUMERIC(5, 2) DEFAULT 0.00,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Games Table
CREATE TABLE IF NOT EXISTS public.games (
  game_pk BIGINT PRIMARY KEY, -- MLB Stats API unique gamePk
  season TEXT NOT NULL DEFAULT '2026',
  official_date DATE NOT NULL,
  game_date TIMESTAMPTZ NOT NULL,
  status_code TEXT NOT NULL, -- S (Scheduled), PW (Pre-Game), I (In Progress), F (Final)
  detailed_state TEXT NOT NULL,
  venue_name TEXT,
  away_team_id INTEGER NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  home_team_id INTEGER NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  away_score INTEGER,
  home_score INTEGER,
  away_hits INTEGER,
  home_hits INTEGER,
  away_errors INTEGER,
  home_errors INTEGER,
  probable_away_pitcher_id INTEGER REFERENCES public.players(id) ON DELETE SET NULL,
  probable_home_pitcher_id INTEGER REFERENCES public.players(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Player Game Stats Table (Game Logs for streaks, splits & bullpen workload)
CREATE TABLE IF NOT EXISTS public.player_game_stats (
  id BIGSERIAL PRIMARY KEY,
  game_pk BIGINT NOT NULL REFERENCES public.games(game_pk) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  opponent_team_id INTEGER NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  official_date DATE NOT NULL,
  is_home BOOLEAN NOT NULL DEFAULT FALSE,
  stat_group TEXT NOT NULL CHECK (stat_group IN ('batting', 'pitching')),
  -- Batting game stats
  at_bats INTEGER DEFAULT 0,
  runs INTEGER DEFAULT 0,
  hits INTEGER DEFAULT 0,
  doubles INTEGER DEFAULT 0,
  triples INTEGER DEFAULT 0,
  home_runs INTEGER DEFAULT 0,
  rbi INTEGER DEFAULT 0,
  base_on_balls INTEGER DEFAULT 0,
  strike_outs INTEGER DEFAULT 0,
  left_on_base INTEGER DEFAULT 0,
  -- Pitching game stats
  is_starter BOOLEAN DEFAULT FALSE,
  innings_pitched NUMERIC(4, 1) DEFAULT 0.0,
  outs_pitched INTEGER DEFAULT 0,
  pitched_hits INTEGER DEFAULT 0,
  pitched_runs INTEGER DEFAULT 0,
  earned_runs INTEGER DEFAULT 0,
  pitched_walks INTEGER DEFAULT 0,
  pitched_strikeouts INTEGER DEFAULT 0,
  home_runs_allowed INTEGER DEFAULT 0,
  pitches_thrown INTEGER DEFAULT 0,
  strikes_thrown INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_pk, player_id, stat_group)
);

-- Indexes for fast analytical queries
CREATE INDEX IF NOT EXISTS idx_games_official_date ON public.games(official_date DESC);
CREATE INDEX IF NOT EXISTS idx_games_teams ON public.games(away_team_id, home_team_id);
CREATE INDEX IF NOT EXISTS idx_players_team_id ON public.players(team_id);
CREATE INDEX IF NOT EXISTS idx_player_game_stats_player_date ON public.player_game_stats(player_id, official_date DESC);
CREATE INDEX IF NOT EXISTS idx_player_game_stats_team_date ON public.player_game_stats(team_id, official_date DESC);
CREATE INDEX IF NOT EXISTS idx_player_game_stats_group ON public.player_game_stats(stat_group, official_date DESC);

-- Enable Row Level Security (public read access, service_role write access)
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_game_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on teams"
  ON public.teams FOR SELECT USING (true);

CREATE POLICY "Allow public read access on players"
  ON public.players FOR SELECT USING (true);

CREATE POLICY "Allow public read access on games"
  ON public.games FOR SELECT USING (true);

CREATE POLICY "Allow public read access on player_game_stats"
  ON public.player_game_stats FOR SELECT USING (true);
