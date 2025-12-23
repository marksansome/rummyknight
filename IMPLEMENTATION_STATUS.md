# Authentication Implementation Status

## ✅ Completed

1. **Dependencies Added**
   - Added `better-auth` and `@better-auth/cloudflare` to `package.json`
   - Run `npm install` to install

2. **Database Migration Created**
   - Created `migrations/0002_add_auth.sql`
   - Adds users, accounts, sessions tables
   - Adds admin_id to games table
   - Adds user_id to players table
   - Adds player_claims, user_game_stats, and user_stats tables

3. **Types Updated**
   - Added User, PlayerClaim, UserGameStats, UserStats interfaces
   - Updated Game and Player interfaces to include optional user_id/admin_id
   - Added ClaimPlayerRequest interface
   - Updated CloudflareBindings with auth-related environment variables

4. **Auth Configuration**
   - Created `src/auth.ts` with Better Auth setup
   - Supports Google and GitHub OAuth (when credentials provided)

5. **Database Service Enhanced**
   - Updated `createGame()` to accept optional `adminId`
   - Added `claimPlayer()` method
   - Added `getUserStats()` method
   - Added `getUserGames()` method
   - Added `isGameAdmin()` method
   - Added `getClaimedPlayer()` method
   - Updated `addHand()` to update user statistics for claimed players

6. **Routes Updated**
   - Added `/api/auth/*` route handler
   - Added `/api/auth/session` endpoint (optional auth)
   - Updated `/api/games` POST to use optional admin_id
   - Added `/api/games/:gameId/claim-player` POST (requires auth)
   - Added `/api/users/me/stats` GET (requires auth)
   - Added `/api/users/me/games` GET (requires auth)
   - Added `/api/games/:gameId/context` GET (optional auth, shows user context)

## 🔧 Next Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Database Migration
```bash
wrangler d1 migrations apply DB
```

### 3. Set Up OAuth Providers (Optional but Recommended)

**Google OAuth:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `https://your-domain.com/api/auth/callback/google`

**GitHub OAuth:**
1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Create new OAuth App
3. Set callback URL: `https://your-domain.com/api/auth/callback/github`

### 4. Set Environment Variables/Secrets

For local development, add to `wrangler.jsonc`:
```jsonc
"vars": {
  "BASE_URL": "http://localhost:8787",
  "BETTER_AUTH_SECRET": "your-secret-key-here"
}
```

For production, use secrets:
```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put BASE_URL
```

### 5. Frontend Updates Needed

The frontend (`public/index.html`) needs to be updated to:
- Show sign in/out buttons
- Display "Claim Player" buttons for authenticated users
- Show user statistics
- Show admin controls for game admins
- Handle authentication state

### 6. Test the Implementation

1. Start dev server: `npm run dev`
2. Test creating a game without auth (should work)
3. Test creating a game with auth (should set admin_id)
4. Test claiming a player (requires auth)
5. Test user stats endpoint

## 📝 API Endpoints

### Authentication
- `GET /api/auth/session` - Get current user (optional, returns null if not authenticated)
- `ALL /api/auth/*` - Better Auth routes (sign-in, sign-out, callbacks, etc.)

### Games
- `POST /api/games` - Create game (works with or without auth)
- `GET /api/games/:gameId` - Get game details
- `GET /api/games/:gameId/context` - Get game with user context (admin status, claimed player)
- `POST /api/games/:gameId/claim-player` - Claim a player (requires auth)
- `POST /api/games/:gameId/hands` - Add hand (works as before)

### User
- `GET /api/users/me/stats` - Get user statistics (requires auth)
- `GET /api/users/me/games` - Get user's claimed games (requires auth)

## 🔍 Notes

- Authentication is completely optional - existing functionality works without it
- Games created without auth have `admin_id = NULL`
- Players start as guests (`user_id = NULL`) until claimed
- Statistics only track claimed players
- One user can only claim one player per game
- Better Auth will automatically create the necessary tables when first used (if using auto-migration)

## ⚠️ Important

Before deploying, make sure to:
1. Set a strong `BETTER_AUTH_SECRET` (use a random string)
2. Set `BASE_URL` to your production domain
3. Configure OAuth redirect URIs correctly
4. Run database migrations in production

