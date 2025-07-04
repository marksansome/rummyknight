import { Hono } from "hono";
import { DatabaseService } from "./database";
import { CloudflareBindings, CreateGameRequest, AddHandRequest } from "./types";

export function createRoutes() {
  const app = new Hono<{ Bindings: CloudflareBindings }>();

  // Create a new game
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

      const db = new DatabaseService(c.env.DB);
      const game = await db.createGame(
        body.player_names,
        body.initial_dealer_name
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

  return app;
}
