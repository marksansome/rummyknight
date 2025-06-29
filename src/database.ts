import {
  Game,
  Player,
  Hand,
  HandScore,
  PlayerWithScore,
  HandWithScores,
  GameWithDetails,
  CreateGameRequest,
  AddHandRequest,
} from "./types";

export class DatabaseService {
  constructor(private db: D1Database) {}

  async createGame(
    playerNames: string[],
    initialDealerName: string
  ): Promise<Game> {
    const gameId = this.generateGameId();

    await this.db
      .prepare("INSERT INTO games (id) VALUES (?)")
      .bind(gameId)
      .run();

    let initialDealerId: number | undefined;

    for (let i = 0; i < playerNames.length; i++) {
      const name = playerNames[i];
      const result = await this.db
        .prepare("INSERT INTO players (game_id, name) VALUES (?, ?)")
        .bind(gameId, name)
        .run();

      // If this is the initial dealer, store their ID
      if (name === initialDealerName) {
        initialDealerId = result.meta.last_row_id;
      }
    }

    // Update the game with the initial dealer ID
    if (initialDealerId) {
      await this.db
        .prepare("UPDATE games SET initial_dealer_id = ? WHERE id = ?")
        .bind(initialDealerId, gameId)
        .run();
    }

    return {
      id: gameId,
      initial_dealer_id: initialDealerId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  async getGame(gameId: string): Promise<GameWithDetails | null> {
    const game = await this.db
      .prepare("SELECT * FROM games WHERE id = ?")
      .bind(gameId)
      .first<Game>();
    if (!game) return null;

    const players = await this.getPlayersWithScores(gameId);
    const hands = await this.getHandsWithScores(gameId);

    return {
      ...game,
      players,
      hands,
    };
  }

  async getPlayersWithScores(gameId: string): Promise<PlayerWithScore[]> {
    const players = await this.db
      .prepare(
        `
      SELECT p.*, COALESCE(SUM(hs.score), 0) as total_score
      FROM players p
      LEFT JOIN hand_scores hs ON p.id = hs.player_id
      LEFT JOIN hands h ON hs.hand_id = h.id
      WHERE p.game_id = ?
      GROUP BY p.id
      ORDER BY p.id
    `
      )
      .bind(gameId)
      .all<PlayerWithScore>();

    return players.results || [];
  }

  async getHandsWithScores(gameId: string): Promise<HandWithScores[]> {
    // Use a single JOIN query to get all hands with scores
    const handsWithScores = await this.db
      .prepare(
        `
      SELECT 
        h.id,
        h.game_id,
        h.hand_number,
        h.dealer_player_id,
        h.created_at,
        p.name as dealer_name,
        hs.id as score_id,
        hs.player_id,
        hs.score
      FROM hands h
      JOIN players p ON h.dealer_player_id = p.id
      LEFT JOIN hand_scores hs ON h.id = hs.hand_id
      WHERE h.game_id = ?
      ORDER BY h.hand_number, hs.player_id
    `
      )
      .bind(gameId)
      .all<{
        id: number;
        game_id: string;
        hand_number: number;
        dealer_player_id: number;
        created_at: string;
        dealer_name: string;
        score_id: number | null;
        player_id: number | null;
        score: number | null;
      }>();

    // Group the results by hand
    const handsMap = new Map<number, HandWithScores>();

    for (const row of handsWithScores.results || []) {
      if (!handsMap.has(row.id)) {
        handsMap.set(row.id, {
          id: row.id,
          game_id: row.game_id,
          hand_number: row.hand_number,
          dealer_player_id: row.dealer_player_id,
          created_at: row.created_at,
          dealer_name: row.dealer_name,
          scores: [],
        });
      }

      if (
        row.player_id !== null &&
        row.score !== null &&
        row.score_id !== null
      ) {
        handsMap.get(row.id)!.scores.push({
          id: row.score_id,
          hand_id: row.id,
          player_id: row.player_id,
          score: row.score,
          created_at: row.created_at,
        });
      }
    }

    return Array.from(handsMap.values());
  }

  // Get only recent hands for better performance
  async getRecentHandsWithScores(
    gameId: string,
    limit: number = 20
  ): Promise<HandWithScores[]> {
    const handsWithScores = await this.db
      .prepare(
        `
      SELECT 
        h.id,
        h.game_id,
        h.hand_number,
        h.dealer_player_id,
        h.created_at,
        p.name as dealer_name,
        hs.id as score_id,
        hs.player_id,
        hs.score
      FROM hands h
      JOIN players p ON h.dealer_player_id = p.id
      LEFT JOIN hand_scores hs ON h.id = hs.hand_id
      WHERE h.game_id = ?
      ORDER BY h.hand_number DESC, hs.player_id
      LIMIT ?
    `
      )
      .bind(gameId, limit * 4) // Multiply by 4 to account for scores per hand
      .all<{
        id: number;
        game_id: string;
        hand_number: number;
        dealer_player_id: number;
        created_at: string;
        dealer_name: string;
        score_id: number | null;
        player_id: number | null;
        score: number | null;
      }>();

    // Group the results by hand
    const handsMap = new Map<number, HandWithScores>();

    for (const row of handsWithScores.results || []) {
      if (!handsMap.has(row.id)) {
        handsMap.set(row.id, {
          id: row.id,
          game_id: row.game_id,
          hand_number: row.hand_number,
          dealer_player_id: row.dealer_player_id,
          created_at: row.created_at,
          dealer_name: row.dealer_name,
          scores: [],
        });
      }

      if (
        row.player_id !== null &&
        row.score !== null &&
        row.score_id !== null
      ) {
        handsMap.get(row.id)!.scores.push({
          id: row.score_id,
          hand_id: row.id,
          player_id: row.player_id,
          score: row.score,
          created_at: row.created_at,
        });
      }
    }

    // Return hands in ascending order (oldest first)
    return Array.from(handsMap.values()).sort(
      (a, b) => a.hand_number - b.hand_number
    );
  }

  async addHand(
    gameId: string,
    dealerPlayerId: number,
    scores: { player_id: number; score: number }[]
  ): Promise<Hand> {
    // Get the next hand number
    const lastHand = await this.db
      .prepare(
        `
      SELECT MAX(hand_number) as max_hand
      FROM hands
      WHERE game_id = ?
    `
      )
      .bind(gameId)
      .first<{ max_hand: number }>();

    const handNumber = (lastHand?.max_hand || 0) + 1;

    // Create the hand
    const handResult = await this.db
      .prepare(
        `
      INSERT INTO hands (game_id, hand_number, dealer_player_id)
      VALUES (?, ?, ?)
    `
      )
      .bind(gameId, handNumber, dealerPlayerId)
      .run();

    const handId = handResult.meta.last_row_id;

    // Add scores for each player
    for (const score of scores) {
      await this.db
        .prepare(
          `
        INSERT INTO hand_scores (hand_id, player_id, score)
        VALUES (?, ?, ?)
      `
        )
        .bind(handId, score.player_id, score.score)
        .run();
    }

    // Update game timestamp
    await this.db
      .prepare(
        `
      UPDATE games SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `
      )
      .bind(gameId)
      .run();

    return {
      id: handId!,
      game_id: gameId,
      hand_number: handNumber,
      dealer_player_id: dealerPlayerId,
      created_at: new Date().toISOString(),
    };
  }

  async getPlayers(gameId: string): Promise<Player[]> {
    const players = await this.db
      .prepare(
        `
      SELECT * FROM players WHERE game_id = ? ORDER BY id
    `
      )
      .bind(gameId)
      .all<Player>();

    return players.results || [];
  }

  async getNextDealer(gameId: string): Promise<number> {
    const game = await this.db
      .prepare("SELECT initial_dealer_id FROM games WHERE id = ?")
      .bind(gameId)
      .first<{ initial_dealer_id: number }>();
    const players = await this.getPlayers(gameId);

    if (!game || !game.initial_dealer_id || players.length === 0) {
      return players[0]?.id || 1;
    }

    // Get the last hand to see who dealt last
    const lastHand = await this.db
      .prepare(
        `
      SELECT dealer_player_id 
      FROM hands 
      WHERE game_id = ? 
      ORDER BY hand_number DESC 
      LIMIT 1
    `
      )
      .bind(gameId)
      .first<{ dealer_player_id: number }>();

    if (!lastHand) {
      // No hands played yet, use initial dealer
      return game.initial_dealer_id;
    }

    // Find the current dealer's position
    const currentDealerIndex = players.findIndex(
      (p) => p.id === lastHand.dealer_player_id
    );
    if (currentDealerIndex === -1) {
      return game.initial_dealer_id;
    }

    // Get the next player (rotate)
    const nextDealerIndex = (currentDealerIndex + 1) % players.length;
    return players[nextDealerIndex].id;
  }

  private generateGameId(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }
}
