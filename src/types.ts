export interface Game {
  id: string;
  initial_dealer_id?: number;
  admin_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Player {
  id: number;
  game_id: string;
  name: string;
  user_id?: string | null;
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
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  BETTER_AUTH_SECRET?: string;
  BASE_URL?: string;
}

export interface User {
  id: string;
  name: string;
  email: string | null;
  email_verified: boolean;
  image: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlayerClaim {
  id: number;
  player_id: number;
  user_id: string;
  claimed_at: string;
}

export interface UserGameStats {
  id: number;
  user_id: string;
  game_id: string;
  player_id: number;
  total_score: number;
  hands_played: number;
  created_at: string;
  updated_at: string;
}

export interface UserStats {
  user_id: string;
  total_games: number;
  total_hands_played: number;
  best_score: number | null;
  worst_score: number | null;
  average_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface ClaimPlayerRequest {
  player_id: number;
}
