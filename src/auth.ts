import { betterAuth } from "better-auth";
import { cloudflareAdapter } from "@better-auth/cloudflare";
import { CloudflareBindings } from "./types";

export function createAuth(env: CloudflareBindings) {
  const config: any = {
    database: cloudflareAdapter({
      db: env.DB, // D1 database binding
    }),
    baseURL: env.BASE_URL || "http://localhost:8787",
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET || "change-me-in-production",
  };

  // Only add social providers if credentials are provided
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    config.socialProviders = {
      ...(config.socialProviders || {}),
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    };
  }

  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    config.socialProviders = {
      ...(config.socialProviders || {}),
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
    };
  }

  return betterAuth(config);
}

