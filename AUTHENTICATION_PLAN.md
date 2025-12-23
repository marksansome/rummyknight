# Authentication & User Support Implementation Plan

## Overview: Optional Authentication Model

**Core Principle:** Authentication is completely optional. The app works exactly as before for unauthenticated users.

### How It Works

1. **Guest Games (No Auth Required):**
   - Anyone can create a game with player names
   - Game works exactly as current implementation
   - No user accounts needed

2. **Authenticated Game Creation:**
   - If user is signed in when creating a game → they become the **admin**
   - Admin can later edit scores (future feature)
   - Game still works for everyone via game ID

3. **Player Claiming:**
   - Authenticated users can visit any game (via game ID)
   - They can **claim** a player slot in that game
   - Once claimed, that player's scores contribute to the user's statistics
   - One user can only claim one player per game

4. **Statistics:**
   - Only claimed players contribute to user statistics
   - Guest players don't affect any statistics
   - Users can see their claimed games and overall stats

### Benefits

- ✅ **Zero breaking changes** - existing games continue to work
- ✅ **Progressive enhancement** - features unlock when you sign in
- ✅ **Easy sharing** - game IDs work for everyone
- ✅ **Flexible** - mix of authenticated and guest players in same game

## Recommended Solution: Better Auth

**Better Auth** is the best choice for this project because:
- ✅ Built specifically for modern frameworks (works great with Cloudflare Workers)
- ✅ Supports multiple OAuth providers (Google, GitHub, Discord, etc.)
- ✅ Easy to integrate with Hono
- ✅ TypeScript-first with excellent type safety
- ✅ Session management built-in
- ✅ Works seamlessly with D1 database

## Implementation Steps

### 1. Install Dependencies

```bash
npm install better-auth
npm install -D @better-auth/cloudflare
```

### 2. Database Schema Updates

**Key Design Principles:**
- ✅ Games work without authentication (backward compatible)
- ✅ Optional: Users can claim games they create (become admin)
- ✅ Optional: Users can claim player slots in existing games
- ✅ Statistics only tracked for claimed players/games

You'll need to add these tables to your D1 database:

```sql
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
-- Players keep their name for display, but can be linked to a user
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
```

### 3. Better Auth Configuration

Create `src/auth.ts`:

```typescript
import { betterAuth } from "better-auth";
import { cloudflareAdapter } from "@better-auth/cloudflare";

export const auth = betterAuth({
  database: cloudflareAdapter({
    db: (c) => c.env.DB, // D1 database binding
  }),
  emailAndPassword: {
    enabled: true, // Optional: also support email/password
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
    // Add more providers as needed
  },
  baseURL: process.env.BASE_URL || "http://localhost:8787",
  basePath: "/api/auth",
});
```

### 4. Update Routes

Add authentication routes and optional authentication helpers:

```typescript
// In routes.ts
import { auth } from "./auth";

// Helper to get optional session (doesn't require auth)
async function getOptionalSession(c: Context) {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    return session?.user || null;
  } catch {
    return null;
  }
}

// Helper to require authentication
async function requireAuth(c: Context) {
  const user = await getOptionalSession(c);
  if (!user) {
    return c.json({ error: "Authentication required" }, 401);
  }
  return user;
}

// Add auth routes
app.all("/auth/*", async (c) => {
  return auth.handler(c.req.raw);
});

// Create game - works with or without authentication
app.post("/games", async (c) => {
  const body = await c.req.json<CreateGameRequest>();
  const user = await getOptionalSession(c); // Optional
  
  const db = new DatabaseService(c.env.DB);
  const game = await db.createGame(
    body.player_names,
    body.initial_dealer_name,
    user?.id // admin_id if authenticated, null if guest
  );
  
  return c.json({ game_id: game.id });
});

// Claim a player in a game (requires authentication)
app.post("/games/:gameId/claim-player", async (c) => {
  const user = await requireAuth(c);
  const gameId = c.req.param("gameId");
  const body = await c.req.json<{ player_id: number }>();
  
  const db = new DatabaseService(c.env.DB);
  const result = await db.claimPlayer(gameId, body.player_id, user.id);
  
  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }
  
  return c.json({ success: true, message: "Player claimed successfully" });
});

// Get user's statistics
app.get("/users/me/stats", async (c) => {
  const user = await requireAuth(c);
  const db = new DatabaseService(c.env.DB);
  const stats = await db.getUserStats(user.id);
  return c.json(stats);
});

// Get user's games
app.get("/users/me/games", async (c) => {
  const user = await requireAuth(c);
  const db = new DatabaseService(c.env.DB);
  const games = await db.getUserGames(user.id);
  return c.json(games);
});
```

### 5. Frontend Integration

Add sign-in UI and handle authentication state:

```javascript
// Check if user is authenticated (returns null if not)
async function getCurrentUser() {
  try {
    const response = await fetch('/api/auth/get-session');
    const data = await response.json();
    return data.user || null;
  } catch {
    return null;
  }
}

// Sign in with provider
function signInWithGoogle() {
  window.location.href = '/api/auth/sign-in/google';
}

// Sign out
async function signOut() {
  await fetch('/api/auth/sign-out', { method: 'POST' });
  window.location.reload();
}

// Claim a player in the current game
async function claimPlayer(playerId) {
  const user = await getCurrentUser();
  if (!user) {
    showMessage('Please sign in to claim a player', 'error');
    return;
  }
  
  try {
    const response = await fetch(`/api/games/${currentGameId}/claim-player`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: playerId })
    });
    
    const data = await response.json();
    if (response.ok) {
      showMessage('Player claimed successfully!');
      await loadGame(); // Reload to show updated state
    } else {
      showMessage(data.error || 'Failed to claim player', 'error');
    }
  } catch (error) {
    showMessage('Failed to claim player', 'error');
  }
}

// Update game display to show claim buttons
function renderPlayers(players, currentUser, claimedPlayerId) {
  return players.map(player => {
    const isClaimed = player.user_id !== null;
    const isMyClaim = currentUser && player.user_id === currentUser.id;
    const canClaim = currentUser && !isClaimed && !claimedPlayerId;
    
    return `
      <div class="player-card ${isMyClaim ? 'claimed-by-me' : ''}">
        <div class="player-name">
          ${player.name}
          ${isClaimed ? '<span class="claimed-badge">✓ Claimed</span>' : ''}
          ${isMyClaim ? '<span class="my-badge">You</span>' : ''}
        </div>
        ${canClaim ? `<button onclick="claimPlayer(${player.id})">Claim This Player</button>` : ''}
        <div class="player-score">${player.total_score}</div>
      </div>
    `;
  }).join('');
}
```

## Alternative: Lucia Auth

If you prefer a lighter-weight solution, **Lucia Auth** is also excellent:

- ✅ Very lightweight
- ✅ Works with Cloudflare Workers
- ✅ Supports OAuth providers
- ✅ More manual setup but more control

## Setup Instructions for Better Auth

### 1. Get OAuth Credentials

**Google OAuth:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `https://your-domain.com/api/auth/callback/google`

**GitHub OAuth:**
1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Create new OAuth App
3. Set callback URL: `https://your-domain.com/api/auth/callback/github`

### 2. Set Environment Variables

Add to `wrangler.jsonc` or use secrets:

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put BETTER_AUTH_SECRET # Random secret for session encryption
wrangler secret put BASE_URL # Your production URL
```

### 3. Run Migrations

Create a new migration file and apply it:

```bash
wrangler d1 migrations apply DB
```

## Features to Implement

### 1. User Authentication (Optional)
- ✅ Sign in with Google/GitHub/etc.
- ✅ Sign out
- ✅ Session management
- ✅ Games work without authentication (backward compatible)

### 2. Game Ownership (Optional)
- ✅ If signed in when creating game → becomes admin
- ✅ Admin can later edit scores (future feature)
- ✅ Guest games work exactly as before

### 3. Player Claiming
- ✅ Authenticated users can claim a player slot in any game
- ✅ Claim by player_id (matches player name or manual selection)
- ✅ One user can only claim one player per game
- ✅ Claimed players link to user account for statistics

### 4. Score Tracking
- ✅ Statistics only tracked for claimed players/games
- ✅ User statistics dashboard (total games, hands played, best/worst scores)
- ✅ Game history per user (only claimed games)
- ✅ Guest players don't affect statistics

### 5. UI Updates
- ✅ Sign in/out buttons (optional, doesn't block usage)
- ✅ User profile dropdown when signed in
- ✅ "Claim Player" button on game page (if signed in and not claimed)
- ✅ Statistics page showing user's claimed games
- ✅ Visual indicator for claimed vs guest players
- ✅ Admin badge/controls for game admin

## Implementation Details

### Game Creation Flow

1. **Guest Game (No Auth):**
   - User creates game with player names
   - `admin_id` = NULL
   - All players are guests (`user_id` = NULL)
   - Works exactly as current implementation

2. **Authenticated Game Creation:**
   - User signs in first
   - Creates game with player names
   - `admin_id` = user.id
   - Players still start as guests, but admin can claim one
   - Other users can claim players later

### Player Claiming Flow

1. User visits game page (authenticated)
2. Sees list of players
3. Can claim any unclaimed player slot
4. Once claimed:
   - Player's `user_id` is set
   - `player_claims` record created
   - `user_game_stats` entry created/updated
   - Statistics start tracking for that user

### Statistics Calculation

- Only claimed players contribute to statistics
- When a hand is added:
  - If player is claimed → update `user_game_stats` and `user_stats`
  - If player is guest → no statistics update
- Statistics include:
  - Total games (unique games with claimed player)
  - Total hands played
  - Best/worst scores
  - Average score

### Database Service Methods Needed

```typescript
// In database.ts
async createGame(
  playerNames: string[],
  initialDealerName: string,
  adminId?: string // Optional
): Promise<Game>

async claimPlayer(
  gameId: string,
  playerId: number,
  userId: string
): Promise<{ success: boolean; error?: string }>

async getUserStats(userId: string): Promise<UserStats>

async getUserGames(userId: string): Promise<GameWithDetails[]>

async isGameAdmin(gameId: string, userId: string): Promise<boolean>

async getClaimedPlayer(gameId: string, userId: string): Promise<Player | null>
```

## Migration Strategy

**No breaking changes needed!**
1. All existing games continue to work (admin_id = NULL, all players are guests)
2. New schema is additive (optional columns)
3. Users can claim players in existing games if they match names
4. Statistics only count from point of claiming forward

## Next Steps

1. Review this plan
2. Choose Better Auth or Lucia Auth
3. Set up OAuth providers
4. Create database migration
5. Implement authentication
6. Add invitation system
7. Update frontend
8. Add statistics tracking

Would you like me to start implementing any of these steps?

