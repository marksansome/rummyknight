import { Hono } from "hono";
import { createRoutes } from "./routes";

const app = new Hono<{ Bindings: CloudflareBindings }>();

// API routes
app.route("/api", createRoutes());

// Landing page route
app.get("/", async (c) => {
  const rootRequest = new Request(new URL("/", c.req.url), c.req.raw);
  return c.env.ASSETS.fetch(rootRequest);
});

// New game form route
app.get("/new", async (c) => {
  const rootRequest = new Request(new URL("/", c.req.url), c.req.raw);
  return c.env.ASSETS.fetch(rootRequest);
});

// Game page route - serve the main HTML file and let frontend handle routing
app.get("/game/:gameId", async (c) => {
  // Serve the main index.html file for all game routes
  const rootRequest = new Request(new URL("/", c.req.url), c.req.raw);
  return c.env.ASSETS.fetch(rootRequest);
});

// Serve static files (including the main page) - catch-all must be last
app.get("/*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
