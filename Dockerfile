# Utiliser une image Node.js standard
FROM mcr.microsoft.com/playwright/node:lts

# Installer les dépendances système nécessaires à Playwright (Chromium)
# Cette étape est cruciale pour le mode headless
# Dépendances système gérées par l'image de base Playwright

# Définir le répertoire de travail
WORKDIR /usr/src/app

# Copier les fichiers de l'application
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

# Installer les dépendances Node.js (Playwright sera installé ici)
RUN npm install

# Installer les navigateurs Playwright (Chromium)
# Navigateurs Playwright gérés par l'image de base

# Compiler le code TypeScript
RUN npx tsc

# Commande de démarrage du bot
CMD [ "node", "dist/index.js" ]
