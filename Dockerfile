# Utiliser une image Node.js avec les dépendances Playwright
FROM mcr.microsoft.com/playwright/node:lts-jammy

# Définir le répertoire de travail
WORKDIR /usr/src/app

# Copier les fichiers de l'application
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

# Installer les dépendances Node.js
RUN npm install

# Compiler le code TypeScript
RUN npx tsc

# Exposer le port (non nécessaire pour un bot, mais bonne pratique)
# EXPOSE 3000

# Commande de démarrage du bot
CMD [ "node", "dist/index.js" ]
