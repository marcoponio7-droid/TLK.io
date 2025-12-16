"use strict";
// src/config.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.SELECTORS = exports.COOKIE_PATH = exports.TLK_URL = exports.RULES_INTERVAL_MS = exports.RULES_MESSAGE = exports.MEDIA_REGEX = exports.ADMIN_KEY = void 0;
// Clé d'administration pour l'interface web (à définir dans les variables d'environnement Render)
exports.ADMIN_KEY = process.env.ADMIN_KEY || "default_admin_key";
// Regex pour détecter les liens directs vers les fichiers médias.
// Inclut les extensions demandées : .jpg .jpeg .png .gif .webp .svg .tiff .pdf .ai .eps .psd .mp4
// Note: La détection des liens d'hébergeurs sera gérée par une logique plus complexe dans le bot.
exports.MEDIA_REGEX = /\.(jpg|jpeg|png|gif|webp|svg|tiff|pdf|ai|eps|psd|mp4)(\?|$)/i;
// Message des règles à envoyer toutes les heures.
// Le message est formaté pour éviter les retours à la ligne inutiles sur tlk.io.
exports.RULES_MESSAGE = "━━━━━━━━🏴‍☠️REGLES DU CHAT🏴‍☠️━━━━━━━━ ━━ 🔺Les images sont bloquées par la modération🔺━ ━━ 📝 Liste d’autorisation pour poster des images ━━ ━━━━━━━━❄️Merci de respecter❄️━━━━━━━";
// Intervalle d'envoi du message de règles en millisecondes (1 heure).
exports.RULES_INTERVAL_MS = 60 * 60 * 1000;
// URL de tlk.io
exports.TLK_URL = "https://tlk.io/grenadine"; // URL du chat déduite des cookies fournis
// Chemin pour sauvegarder et charger les cookies de session.
exports.COOKIE_PATH = "session-cookies.json";
// Sélecteurs DOM (basés sur les scripts Tampermonkey fonctionnels)
exports.SELECTORS = {
    // Sélecteur pour tous les messages postés (conteneur complet)
    POST_CONTAINER: 'dl.post',
    // Sélecteur pour le nom de l'utilisateur
    POST_NAME: '.post-name',
    // Sélecteur pour le contenu du message
    POST_CONTENT: 'dd.post-message',
    // Sélecteur pour le champ de saisie de message
    INPUT_FIELD: '.message-input',
    // Sélecteur pour le bouton d'envoi
    SEND_BUTTON: '.button',
    // Sélecteur pour détecter si le chat est chargé
    CHAT_LOADED: '.message-input'
};
