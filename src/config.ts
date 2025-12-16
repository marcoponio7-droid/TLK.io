// src/config.ts

// Clé d'administration pour l'interface web (à définir dans les variables d'environnement Render)
export const ADMIN_KEY: string = process.env.ADMIN_KEY || "default_admin_key";

// Regex pour détecter les liens directs vers les fichiers médias.
// Inclut les extensions demandées : .jpg .jpeg .png .gif .webp .svg .tiff .pdf .ai .eps .psd .mp4
// Note: La détection des liens d'hébergeurs sera gérée par une logique plus complexe dans le bot.
export const MEDIA_REGEX: RegExp = /\.(jpg|jpeg|png|gif|webp|svg|tiff|pdf|ai|eps|psd|mp4)(\?|$)/i;

// Message des règles à envoyer toutes les heures.
// Le message est formaté pour éviter les retours à la ligne inutiles sur tlk.io.
export const RULES_MESSAGE: string = "━━━━━━━━🏴‍☠️REGLES DU CHAT🏴‍☠️━━━━━━━━ ━━ 🔺Les images sont bloquées par la modération🔺━ ━━ 📝 Liste d’autorisation pour poster des images ━━ ━━━━━━━━❄️Merci de respecter❄️━━━━━━━";

// Intervalle d'envoi du message de règles en millisecondes (1 heure).
export const RULES_INTERVAL_MS: number = 60 * 60 * 1000;

// URL de tlk.io
export const TLK_URL: string = "https://tlk.io/grenadine"; // URL du chat déduite des cookies fournis

// Chemin pour sauvegarder et charger les cookies de session.
export const COOKIE_PATH: string = "session-cookies.json";

// Sélecteurs DOM
export const SELECTORS = {
    // Sélecteur pour tous les messages postés
    POST_MESSAGE: 'dd.post-message',
    // Sélecteur pour le nom de l'utilisateur
    POST_NAME: '.post-name',
    // Sélecteur pour le contenu du message
    POST_CONTENT: '.post-message',
    // Sélecteur pour le bouton de suppression (TRÈS IMPORTANT)
    DELETE_BUTTON: 'button#delete-message.post-time-button',
    // Sélecteur pour le champ de saisie de message
    INPUT_FIELD: '#message-input',
    // Sélecteur pour le bouton d'envoi
    SEND_BUTTON: '#send-button',
    // Sélecteur pour détecter si le chat est chargé (ex: le champ d'entrée)
    CHAT_LOADED: '#message-input'
};
