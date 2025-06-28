export interface Game {
  id: string;
  initial_dealer_id?: number;
  created_at: string;
  updated_at: string;
}

export interface Player {
  id: number;
  game_id: string;
  name: string;
  created_at: string;
}

export interface Hand {
  id: number;
  game_id: string;
  hand_number: number;
  dealer_player_id: number;
  created_at: string;
}

export interface HandScore {
  id: number;
  hand_id: number;
  player_id: number;
  score: number;
  created_at: string;
}

export interface PlayerWithScore extends Player {
  total_score: number;
}

export interface HandWithScores extends Hand {
  scores: HandScore[];
  dealer_name: string;
}

export interface GameWithDetails extends Game {
  players: PlayerWithScore[];
  hands: HandWithScores[];
}

export interface CreateGameRequest {
  player_names: string[];
  initial_dealer_name: string;
}

export interface AddHandRequest {
  dealer_player_id: number;
  scores: { player_id: number; score: number }[];
}

export interface CloudflareBindings {
  DB: D1Database;
  ASSETS: Fetcher;
}
