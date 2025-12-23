-- Migration number: 0002 	 2025-01-XX

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    email_verified INTEGER DEFAULT 0,
    image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Accounts table (for OAuth providers)
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Update games table: admin_id is optional (NULL = guest game)
ALTER TABLE games ADD COLUMN admin_id TEXT;
CREATE INDEX IF NOT EXISTS idx_games_admin_id ON games(admin_id);

-- Update players table: user_id is optional (NULL = guest player)
ALTER TABLE players ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_players_user_id ON players(user_id);

-- Player claims: Track when a user claims a player slot
CREATE TABLE IF NOT EXISTS player_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(player_id, user_id) -- One user can only claim a player once
);
CREATE INDEX IF NOT EXISTS idx_player_claims_user_id ON player_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_player_claims_player_id ON player_claims(player_id);

-- User game statistics (only for claimed players/games)
CREATE TABLE IF NOT EXISTS user_game_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    player_id INTEGER NOT NULL, -- The player slot they claimed
    total_score INTEGER DEFAULT 0,
    hands_played INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    UNIQUE(user_id, game_id, player_id) -- One user can only have one claim per game
);

-- Global user statistics (across all claimed games)
CREATE TABLE IF NOT EXISTS user_stats (
    user_id TEXT PRIMARY KEY,
    total_games INTEGER DEFAULT 0, -- Games where they claimed a player
    total_hands_played INTEGER DEFAULT 0,
    best_score INTEGER,
    worst_score INTEGER,
    average_score REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

