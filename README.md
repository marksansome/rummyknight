# 🃏 Rummy Knight - Score Tracker

A beautiful, modern web application for tracking Rummy game scores. Built with Cloudflare Workers, D1 Database, and Hono framework.

## Features

- **Multi-player Support**: Track games with 2-4 players
- **Unique Game URLs**: Each game gets a unique URL for easy sharing
- **Real-time Scoring**: Add hands and see scores update instantly
- **Game History**: View complete hand history and player statistics
- **Responsive Design**: Works perfectly on desktop and mobile devices
- **Modern UI**: Beautiful gradient design with smooth animations
- **Automatic Dealer Rotation**: Dealer automatically rotates to the next player after each hand

## Tech Stack

- **Backend**: Cloudflare Workers with Hono framework
- **Database**: Cloudflare D1 (SQLite)
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Deployment**: Cloudflare Workers

## Setup Instructions

### Prerequisites

- Node.js (v18 or higher)
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflare account

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd rummyknight
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Wrangler**
   ```bash
   # Copy the example configuration
   cp wrangler.example.jsonc wrangler.jsonc
   ```

4. **Create D1 Database**
   ```bash
   wrangler d1 create rummyknight-db
   ```

5. **Update database ID**
   - Copy the database ID from the output of the previous command
   - Update the `database_id` in `wrangler.jsonc` (replace `your-database-id-here`)

6. **Initialize database schema**
   ```bash
   wrangler d1 execute rummyknight-db --file=migrations/0001_initial.sql
   ```

7. **Start development server**
   ```bash
   npm run dev
   ```

8. **Deploy to production**
   ```bash
   npm run deploy
   ```

## Usage

### Creating a New Game

1. Open the application in your browser
2. Enter player names (2-4 players required)
3. Select the initial dealer from the dropdown
4. Click "Start Game"
5. Share the unique game URL with other players

### Adding Hands

1. Enter scores for each player
2. Click "Add Hand" (dealer is automatically selected)
3. View updated totals and hand history

### Game Features

- **Player Rankings**: Players are automatically ranked by total score
- **Hand History**: Complete table of all hands played
- **Current Dealer**: Shows who dealt the last hand
- **Next Dealer**: Automatically displays who will deal the next hand
- **Game Statistics**: Total hands played and game ID

## API Endpoints

### Create Game
```
POST /api/games
Content-Type: application/json

{
  "player_names": ["Player1", "Player2", "Player3"],
  "initial_dealer_name": "Player1"
}
```

### Get Game Details
```
GET /api/games/{gameId}
```

### Get Next Dealer
```
GET /api/games/{gameId}/next-dealer
```

### Add Hand
```
POST /api/games/{gameId}/hands
Content-Type: application/json

{
  "dealer_player_id": null,  // Auto-select if null
  "scores": [
    {"player_id": 1, "score": 10},
    {"player_id": 2, "score": -5},
    {"player_id": 3, "score": 15}
  ]
}
```

## Database Schema

The application uses four main tables:

- **games**: Stores game information including initial dealer
- **players**: Stores player information for each game
- **hands**: Stores individual hand details
- **hand_scores**: Stores scores for each player in each hand

## Development

### Project Structure

```
├── src/
│   ├── index.ts          # Main application entry point
│   ├── routes.ts         # API route definitions
│   ├── database.ts       # Database service layer
│   └── types.ts          # TypeScript type definitions
├── public/
│   └── index.html        # Frontend application
├── migrations/
│   └── 0001_initial.sql  # Database schema
├── wrangler.jsonc        # Cloudflare Workers configuration
└── package.json          # Dependencies and scripts
```

### Available Scripts

- `npm run dev`: Start development server
- `npm run deploy`: Deploy to Cloudflare Workers
- `npm run cf-typegen`: Generate Cloudflare types

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use this project for your own Rummy games!

```txt
npm install
npm run dev
```

```txt
npm run deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```
