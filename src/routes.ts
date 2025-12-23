import { Hono, Context } from "hono";
import { DatabaseService } from "./database";
import {
  CloudflareBindings,
  CreateGameRequest,
  AddHandRequest,
  ClaimPlayerRequest,
} from "./types";
import { createAuth } from "./auth";

// Helper to get optional session (doesn't require auth)
async function getOptionalSession(
  c: Context<{ Bindings: CloudflareBindings }>
) {
  try {
    const auth = createAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    return session?.user || null;
  } catch {
    return null;
  }
}

// Helper to require authentication
async function requireAuth(c: Context<{ Bindings: CloudflareBindings }>) {
  const user = await getOptionalSession(c);
  if (!user) {
    return null;
  }
  return user;
}

export function createRoutes() {
  const app = new Hono<{ Bindings: CloudflareBindings }>();

  // Auth routes - handle all auth requests
  app.all("/auth/*", async (c) => {
    const auth = createAuth(c.env);
    return auth.handler(c.req.raw);
  });

  // Get current session (optional)
  app.get("/auth/session", async (c) => {
    const user = await getOptionalSession(c);
    return c.json({ user });
  });

  // Create a new game (works with or without authentication)
  app.post("/games", async (c) => {
    try {
      const body = await c.req.json<CreateGameRequest>();

      if (
        !body.player_names ||
        body.player_names.length < 2 ||
        body.player_names.length > 4
      ) {
        return c.json({ error: "Game must have 2-4 players" }, 400);
      }

      if (
        !body.initial_dealer_name ||
        !body.player_names.includes(body.initial_dealer_name)
      ) {
        return c.json(
          { error: "Initial dealer must be one of the players" },
          400
        );
      }

      // Get optional user session
      const user = await getOptionalSession(c);
      const adminId = user?.id || null;

      const db = new DatabaseService(c.env.DB);
      const game = await db.createGame(
        body.player_names,
        body.initial_dealer_name,
        adminId
      );

      return c.json({ game_id: game.id });
    } catch (error) {
      console.error("Error creating game:", error);
      return c.json({ error: "Failed to create game" }, 500);
    }
  });

  // Get game details
  app.get("/games/:gameId", async (c) => {
    try {
      const gameId = c.req.param("gameId");
      const db = new DatabaseService(c.env.DB);
      const game = await db.getGame(gameId);

      if (!game) {
        return c.json({ error: "Game not found" }, 404);
      }

      return c.json(game);
    } catch (error) {
      console.error("Error getting game:", error);
      return c.json({ error: "Failed to get game" }, 500);
    }
  });

  // Get next dealer for a game
  app.get("/games/:gameId/next-dealer", async (c) => {
    try {
      const gameId = c.req.param("gameId");
      const db = new DatabaseService(c.env.DB);

      // Verify game exists
      const game = await db.getGame(gameId);
      if (!game) {
        return c.json({ error: "Game not found" }, 404);
      }

      const nextDealerId = await db.getNextDealer(gameId);
      const nextDealer = game.players.find((p) => p.id === nextDealerId);

      return c.json({
        dealer_id: nextDealerId,
        dealer_name: nextDealer?.name || "Unknown",
      });
    } catch (error) {
      console.error("Error getting next dealer:", error);
      return c.json({ error: "Failed to get next dealer" }, 500);
    }
  });

  // Add a new hand to a game
  app.post("/games/:gameId/hands", async (c) => {
    try {
      const gameId = c.req.param("gameId");
      const body = await c.req.json<AddHandRequest>();

      const db = new DatabaseService(c.env.DB);

      // Verify game exists
      const game = await db.getGame(gameId);
      if (!game) {
        return c.json({ error: "Game not found" }, 404);
      }

      // If no dealer specified, automatically select the next dealer
      let dealerPlayerId = body.dealer_player_id;
      if (!dealerPlayerId) {
        dealerPlayerId = await db.getNextDealer(gameId);
      } else {
        // Verify dealer is a valid player
        const dealerExists = game.players.some((p) => p.id === dealerPlayerId);
        if (!dealerExists) {
          return c.json({ error: "Invalid dealer player" }, 400);
        }
      }

      // Verify all players have scores
      const playerIds = game.players.map((p) => p.id);
      const scorePlayerIds = body.scores.map((s) => s.player_id);

      if (
        playerIds.length !== scorePlayerIds.length ||
        !playerIds.every((id) => scorePlayerIds.includes(id))
      ) {
        return c.json(
          { error: "Scores must be provided for all players" },
          400
        );
      }

      const hand = await db.addHand(gameId, dealerPlayerId, body.scores);

      return c.json(hand);
    } catch (error) {
      console.error("Error adding hand:", error);
      return c.json({ error: "Failed to add hand" }, 500);
    }
  });

  // Claim a player in a game (requires authentication)
  app.post("/games/:gameId/claim-player", async (c) => {
    try {
      const user = await requireAuth(c);
      if (!user) {
        return c.json({ error: "Authentication required" }, 401);
      }

      const gameId = c.req.param("gameId");
      const body = await c.req.json<ClaimPlayerRequest>();

      if (!body.player_id) {
        return c.json({ error: "player_id is required" }, 400);
      }

      const db = new DatabaseService(c.env.DB);
      const result = await db.claimPlayer(gameId, body.player_id, user.id);

      if (!result.success) {
        return c.json({ error: result.error }, 400);
      }

      return c.json({ success: true, message: "Player claimed successfully" });
    } catch (error) {
      console.error("Error claiming player:", error);
      return c.json({ error: "Failed to claim player" }, 500);
    }
  });

  // Get user's statistics (requires authentication)
  app.get("/users/me/stats", async (c) => {
    try {
      const user = await requireAuth(c);
      if (!user) {
        return c.json({ error: "Authentication required" }, 401);
      }

      const db = new DatabaseService(c.env.DB);
      const stats = await db.getUserStats(user.id);

      return c.json(
        stats || {
          user_id: user.id,
          total_games: 0,
          total_hands_played: 0,
          best_score: null,
          worst_score: null,
          average_score: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      );
    } catch (error) {
      console.error("Error getting user stats:", error);
      return c.json({ error: "Failed to get user stats" }, 500);
    }
  });

  // Get user's games (requires authentication)
  app.get("/users/me/games", async (c) => {
    try {
      const user = await requireAuth(c);
      if (!user) {
        return c.json({ error: "Authentication required" }, 401);
      }

      const db = new DatabaseService(c.env.DB);
      const games = await db.getUserGames(user.id);

      return c.json(games);
    } catch (error) {
      console.error("Error getting user games:", error);
      return c.json({ error: "Failed to get user games" }, 500);
    }
  });

  // Get game with user context (shows if user is admin or has claimed a player)
  app.get("/games/:gameId/context", async (c) => {
    try {
      const gameId = c.req.param("gameId");
      const user = await getOptionalSession(c);

      const db = new DatabaseService(c.env.DB);
      const game = await db.getGame(gameId);

      if (!game) {
        return c.json({ error: "Game not found" }, 404);
      }

      let isAdmin = false;
      let claimedPlayer = null;

      if (user) {
        isAdmin = await db.isGameAdmin(gameId, user.id);
        claimedPlayer = await db.getClaimedPlayer(gameId, user.id);
      }

      return c.json({
        game,
        is_admin: isAdmin,
        claimed_player: claimedPlayer,
      });
    } catch (error) {
      console.error("Error getting game context:", error);
      return c.json({ error: "Failed to get game context" }, 500);
    }
  });

  return app;
}
