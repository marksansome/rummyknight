dev:
	npm run dev

deploy-with-migrations: migrate-prod deploy

deploy:
	wrangler deploy

migrate-dev:
	wrangler d1 migrations apply rummyknight --local

migrate-prod:
	wrangler d1 migrations apply rummyknight --remote
