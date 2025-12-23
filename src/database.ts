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
  UserStats,
  UserGameStats,
} from "./types";

export class DatabaseService {
  constructor(private db: D1Database) {}

  async createGame(
    playerNames: string[],
    initialDealerName: string,
    adminId?: string | null
  ): Promise<Game> {
    const gameId = this.generateGameId();

    await this.db
      .prepare("INSERT INTO games (id, admin_id) VALUES (?, ?)")
      .bind(gameId, adminId || null)
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
      admin_id: adminId || null,
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

    // Update user stats for claimed players
    const claimedPlayers = await this.db
      .prepare(
        "SELECT DISTINCT user_id, player_id FROM player_claims WHERE player_id IN (SELECT player_id FROM hand_scores WHERE hand_id = ?)"
      )
      .bind(handId)
      .all<{ user_id: string; player_id: number }>();

    for (const claim of claimedPlayers.results || []) {
      // Update user_game_stats
      const playerScore = scores.find((s) => s.player_id === claim.player_id);
      if (playerScore) {
        await this.db
          .prepare(
            `
            UPDATE user_game_stats 
            SET total_score = total_score + ?, 
                hands_played = hands_played + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND game_id = ? AND player_id = ?
            `
          )
          .bind(playerScore.score, claim.user_id, gameId, claim.player_id)
          .run();
      }

      // Update global user stats
      await this.updateUserStats(claim.user_id);
    }

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

  async claimPlayer(
    gameId: string,
    playerId: number,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    // Verify game exists
    const game = await this.db
      .prepare("SELECT id FROM games WHERE id = ?")
      .bind(gameId)
      .first<{ id: string }>();
    
    if (!game) {
      return { success: false, error: "Game not found" };
    }

    // Verify player exists and belongs to this game
    const player = await this.db
      .prepare("SELECT id, user_id FROM players WHERE id = ? AND game_id = ?")
      .bind(playerId, gameId)
      .first<{ id: number; user_id: string | null }>();
    
    if (!player) {
      return { success: false, error: "Player not found in this game" };
    }

    // Check if player is already claimed
    if (player.user_id !== null) {
      return { success: false, error: "Player is already claimed" };
    }

    // Check if user already claimed a player in this game
    const existingClaim = await this.db
      .prepare(
        "SELECT player_id FROM player_claims WHERE user_id = ? AND player_id IN (SELECT id FROM players WHERE game_id = ?)"
      )
      .bind(userId, gameId)
      .first<{ player_id: number }>();
    
    if (existingClaim) {
      return { success: false, error: "You have already claimed a player in this game" };
    }

    // Claim the player
    await this.db
      .prepare("UPDATE players SET user_id = ? WHERE id = ?")
      .bind(userId, playerId)
      .run();

    await this.db
      .prepare("INSERT INTO player_claims (player_id, user_id) VALUES (?, ?)")
      .bind(playerId, userId)
      .run();

    // Initialize user game stats
    const currentScore = await this.db
      .prepare(
        "SELECT COALESCE(SUM(hs.score), 0) as total_score FROM hand_scores hs JOIN hands h ON hs.hand_id = h.id WHERE hs.player_id = ? AND h.game_id = ?"
      )
      .bind(playerId, gameId)
      .first<{ total_score: number }>();

    const handsCount = await this.db
      .prepare("SELECT COUNT(*) as count FROM hands WHERE game_id = ?")
      .bind(gameId)
      .first<{ count: number }>();

    await this.db
      .prepare(
        "INSERT INTO user_game_stats (user_id, game_id, player_id, total_score, hands_played) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(
        userId,
        gameId,
        playerId,
        currentScore?.total_score || 0,
        handsCount?.count || 0
      )
      .run();

    // Update global user stats
    await this.updateUserStats(userId);

    return { success: true };
  }

  async getUserStats(userId: string): Promise<UserStats | null> {
    const stats = await this.db
      .prepare("SELECT * FROM user_stats WHERE user_id = ?")
      .bind(userId)
      .first<UserStats>();
    
    return stats || null;
  }

  async getUserGames(userId: string): Promise<GameWithDetails[]> {
    // Get all games where user has claimed a player
    const gameIds = await this.db
      .prepare(
        "SELECT DISTINCT game_id FROM user_game_stats WHERE user_id = ? ORDER BY updated_at DESC"
      )
      .bind(userId)
      .all<{ game_id: string }>();

    const games: GameWithDetails[] = [];
    for (const row of gameIds.results || []) {
      const game = await this.getGame(row.game_id);
      if (game) {
        games.push(game);
      }
    }

    return games;
  }

  async isGameAdmin(gameId: string, userId: string): Promise<boolean> {
    const game = await this.db
      .prepare("SELECT admin_id FROM games WHERE id = ?")
      .bind(gameId)
      .first<{ admin_id: string | null }>();
    
    return game?.admin_id === userId;
  }

  async getClaimedPlayer(gameId: string, userId: string): Promise<Player | null> {
    const player = await this.db
      .prepare(
        "SELECT p.* FROM players p JOIN player_claims pc ON p.id = pc.player_id WHERE p.game_id = ? AND pc.user_id = ?"
      )
      .bind(gameId, userId)
      .first<Player>();
    
    return player || null;
  }

  private async updateUserStats(userId: string): Promise<void> {
    // Get aggregated stats from user_game_stats
    const stats = await this.db
      .prepare(
        `
        SELECT 
          COUNT(DISTINCT game_id) as total_games,
          SUM(hands_played) as total_hands_played,
          MAX(total_score) as best_score,
          MIN(total_score) as worst_score,
          AVG(total_score) as average_score
        FROM user_game_stats
        WHERE user_id = ?
        `
      )
      .bind(userId)
      .first<{
        total_games: number;
        total_hands_played: number;
        best_score: number | null;
        worst_score: number | null;
        average_score: number | null;
      }>();

    if (stats) {
      // Insert or update user_stats
      await this.db
        .prepare(
          `
          INSERT INTO user_stats (user_id, total_games, total_hands_played, best_score, worst_score, average_score, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id) DO UPDATE SET
            total_games = excluded.total_games,
            total_hands_played = excluded.total_hands_played,
            best_score = excluded.best_score,
            worst_score = excluded.worst_score,
            average_score = excluded.average_score,
            updated_at = CURRENT_TIMESTAMP
          `
        )
        .bind(
          userId,
          stats.total_games || 0,
          stats.total_hands_played || 0,
          stats.best_score,
          stats.worst_score,
          stats.average_score
        )
        .run();
    }
  }

  private generateGameId(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }
}
