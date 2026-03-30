# 🎵 Vinyl Advisor — Deployment

## Railway deployment (5 minuten)

### 1. GitHub repo aanmaken
```bash
cd vinyl-deploy
git init
git add .
git commit -m "Initial deploy"
gh repo create vinyl-advisor --private --push
```

### 2. Railway koppelen
- Ga naar https://railway.app
- Login met GitHub
- New Project → Deploy from GitHub repo → kies `vinyl-advisor`

### 3. Environment variables instellen in Railway
Ga naar je project → Variables → voeg toe:
- `ANTHROPIC_API_KEY` = (je key uit .env)
- `DISCOGS_TOKEN` = (je key uit .env)
- `APP_PIN` = 4153

### 4. Klaar
Railway geeft je een URL zoals `vinyl-advisor-production.up.railway.app`
Die werkt altijd, geen ngrok meer nodig.

## Wat werkt online
- ✅ Foto analyseren via Claude Vision
- ✅ Discogs zoeken, collectie, wantlist
- ✅ PIN beveiliging
- ✅ Deelder adviseur

## Wat nog niet werkt online
- ❌ Numbers/Excel integratie (vereist AppleScript, alleen lokaal)
