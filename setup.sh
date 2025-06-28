#!/bin/bash

echo "🃏 Setting up Rummy Knight..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI is not installed. Please install it first:"
    echo "npm install -g wrangler"
    exit 1
fi

# Check if user is logged in to Cloudflare
if ! wrangler whoami &> /dev/null; then
    echo "❌ Please log in to Cloudflare first:"
    echo "wrangler login"
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

echo "🗄️ Creating D1 database..."
DB_OUTPUT=$(wrangler d1 create rummyknight 2>&1)
echo "$DB_OUTPUT"

# Extract database ID from output
DB_ID=$(echo "$DB_OUTPUT" | grep -o 'Created D1 database .*' | cut -d' ' -f4)

if [ -z "$DB_ID" ]; then
    echo "❌ Failed to create database or extract database ID"
    exit 1
fi

echo "🆔 Database ID: $DB_ID"

echo "📝 Updating wrangler.jsonc with database ID..."
# Update the database_id in wrangler.jsonc
sed -i.bak "s/\"database_id\": \"rummyknight-db\"/\"database_id\": \"$DB_ID\"/" wrangler.jsonc

echo "🗃️ Initializing database schema..."
wrangler d1 execute rummyknight-db --file=migrations/0001_initial.sql

echo "✅ Setup complete!"
echo ""
echo "🚀 To start development:"
echo "npm run dev"
echo ""
echo "🌐 To deploy to production:"
echo "npm run deploy" 