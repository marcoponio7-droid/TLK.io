# Utiliser une image Node.js standard
FROM node:lts-slim

# Installer les dépendances système nécessaires à Playwright (Chromium)
# Cette étape est cruciale pour le mode headless
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk-bridge2.0-0 \
    libxkbcommon-x11-0 \
    libgbm-dev \
    libasound2 \
    libxshmfence-dev \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Définir le répertoire de travail
WORKDIR /usr/src/app

# Copier les fichiers de l'application
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

# Installer les dépendances Node.js (Playwright sera installé ici)
RUN npm install

# Installer les navigateurs Playwright (Chromium)
RUN npx playwright install chromium

# Compiler le code TypeScript
RUN npx tsc

# Commande de démarrage du bot
CMD [ "node", "dist/index.js" ]
