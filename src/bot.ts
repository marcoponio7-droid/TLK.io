// src/bot.ts

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs/promises';
import { COOKIE_PATH, TLK_URL, SELECTORS, BLOCKED_USERS, MEDIA_REGEX, RULES_MESSAGE, RULES_INTERVAL_MS } from './config';

let browser: Browser;
let context: BrowserContext;
let page: Page;

/**
 * Sauvegarde les cookies de session dans un fichier JSON.
 * @param context Le contexte du navigateur.
 */
async function saveCookies(context: BrowserContext): Promise<void> {
    try {
        const cookies = await context.cookies();
        await fs.writeFile(COOKIE_PATH, JSON.stringify(cookies, null, 2));
        console.log(`[INFO] Cookies sauvegardés dans ${COOKIE_PATH}`);
    } catch (error) {
        console.error("[ERREUR] Échec de la sauvegarde des cookies:", error);
    }
}

/**
 * Charge les cookies de session depuis un fichier JSON.
 * @param context Le contexte du navigateur.
 */
async function loadCookies(context: BrowserContext): Promise<void> {
    try {
        const cookiesJson = await fs.readFile(COOKIE_PATH, 'utf-8');
        const cookies = JSON.parse(cookiesJson);
        await context.addCookies(cookies);
        console.log(`[INFO] Cookies chargés depuis ${COOKIE_PATH}`);
    } catch (error) {
        // Si le fichier n'existe pas ou est invalide, on continue sans cookies.
        console.error("[ERREUR] Échec du chargement des cookies. Démarrage d'une nouvelle session.", error);
    }
}

/**
 * Vérifie si la session est valide en cherchant un élément clé du chat.
 * @param page La page Playwright.
 * @returns Vrai si la session est valide (l'élément clé est présent).
 */
async function isSessionValid(page: Page): Promise<boolean> {
    try {
        // On vérifie la présence du champ d'entrée de message, signe que l'utilisateur est connecté et que le chat est chargé.
        await page.waitForSelector(SELECTORS.CHAT_LOADED, { timeout: 10000 });
        console.log("[INFO] Session valide. Le champ de message est visible.");
        return true;
    } catch (error) {
        console.log("[AVERTISSEMENT] Session invalide ou déconnectée. Le champ de message n'est pas visible.");
        return false;
    }
}

/**
 * Fonction principale pour démarrer le bot.
 */
async function startBot() {
    console.log("[DÉMARRAGE] Lancement du bot de modération tlk.io...");

    // Configuration pour l'hébergement Render (mode headless)
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();

    // 1. Chargement des cookies
    await loadCookies(context);

    // 2. Navigation vers tlk.io
    page = await context.newPage();
    await page.goto(TLK_URL, { waitUntil: 'domcontentloaded' });

    // 3. On suppose que la session est valide et on attend le chargement complet
    console.log("[INFO] Attente du chargement complet de la page...");
    await page.waitForTimeout(5000); // Attendre 5 secondes pour le chargement du chat

    // 4. Démarrage de la surveillance et du timer
    console.log("[SUCCÈS] Démarrage de la surveillance et du timer...");
    await startMonitoring(page);
    startRulesTimer(page);

    // Pour l'instant, on laisse le bot tourner indéfiniment pour simuler le 24/7
    // process.on('SIGINT', async () => {
    //     console.log("[ARRÊT] Fermeture du navigateur...");
    //     await browser.close();
    //     process.exit(0);
    // });
}

// startBot().catch(error => {
//     console.error("[ERREUR GLOBALE] Une erreur inattendue s'est produite:", error);
//     if (browser) browser.close();
//     process.exit(1);
// });

// Fonctions de modération et d'envoi de messages (Phase 3 & 4)

/**
 * Envoie le message des règles dans le chat.
 * @param page La page Playwright.
 */
async function sendRulesMessage(page: Page): Promise<void> {
    try {
        await page.fill(SELECTORS.INPUT_FIELD, RULES_MESSAGE);
        await page.click(SELECTORS.SEND_BUTTON);
        console.log("[INFO] Message des règles envoyé.");
    } catch (error) {
        console.error("[ERREUR] Échec de l'envoi du message des règles:", error);
    }
}

/**
 * Démarre le timer pour l'envoi horaire du message des règles.
 * @param page La page Playwright.
 */
function startRulesTimer(page: Page): void {
    setInterval(() => {
        sendRulesMessage(page);
    }, RULES_INTERVAL_MS);
    console.log(`[INFO] Timer des règles démarré. Envoi toutes les ${RULES_INTERVAL_MS / 1000 / 60} minutes.`);
}

/**
 * Simule le clic sur le bouton de suppression d'un message.
 * @param postElement Le localisateur Playwright du message (dd.post-message).
 */
async function deleteMessage(postElement: any): Promise<void> {
    try {
        // 1. Simuler le survol pour faire apparaître le bouton
        await postElement.hover();

        // 2. Cliquer sur le bouton de suppression
        const deleteButton = postElement.locator(SELECTORS.DELETE_BUTTON);
        await deleteButton.click({ timeout: 5000 }); // Temps d'attente court pour le clic

        console.log("[SUPPRESSION] Message supprimé avec succès.");
    } catch (error) {
        console.error("[ERREUR] Échec de la suppression du message:", error);
    }
}

/**
 * Vérifie si un message doit être supprimé.
 * @param postElement Le localisateur Playwright du message (dd.post-message).
 */
async function checkAndDelete(postElement: any): Promise<void> {
    try {
        const pseudoElement = postElement.locator(SELECTORS.POST_NAME);
        const messageElement = postElement.locator(SELECTORS.POST_CONTENT);

        const pseudo = await pseudoElement.innerText();
        const message = await messageElement.innerText();
        const innerHTML = await messageElement.innerHTML();

        let shouldDelete = false;
        let reason = "";

        // 1. Vérification par pseudo
        if (BLOCKED_USERS.includes(pseudo.trim())) {
            shouldDelete = true;
            reason = `Pseudo interdit: ${pseudo.trim()}`;
        }

        // 2. Vérification par contenu média (balises)
        if (innerHTML.includes('<img') || innerHTML.includes('<video') || innerHTML.includes('<svg')) {
            shouldDelete = true;
            reason = reason || "Contient une balise média (img, video, svg)";
        }

        // 3. Vérification par contenu média (liens directs ou markdown)
        // On cherche les liens directs (y compris le markdown ![](url))
        const links = message.match(/(https?:\/\/[^\s]+)/g) || [];
        
        for (const link of links) {
            if (MEDIA_REGEX.test(link)) {
                shouldDelete = true;
                reason = reason || `Lien média direct détecté: ${link}`;
                break;
            }
        }

        if (shouldDelete) {
            console.log(`[ALERTE] Suppression de: [${pseudo.trim()}] - Raison: ${reason}`);
            await deleteMessage(postElement);
        }

    } catch (error) {
        // Ignorer les erreurs de messages qui disparaissent ou qui sont en cours de chargement
        // console.error("[ERREUR] Échec de la vérification du message:", error);
    }
}

/**
 * Démarre la surveillance des nouveaux messages.
 * @param page La page Playwright.
 */
async function startMonitoring(page: Page): Promise<void> {
    // Utiliser page.waitForSelector pour s'assurer que le chat est chargé
    await page.waitForSelector(SELECTORS.POST_MESSAGE, { state: 'attached' });

    // Utiliser page.locator pour surveiller les nouveaux messages
    const chatContainer = page.locator('dl.posts');

    // On utilise une boucle infinie pour surveiller l'ajout de nouveaux éléments
    // Playwright n'a pas d'API native pour MutationObserver, on doit donc sonder ou utiliser une approche plus complexe.
    // Pour la simplicité et la robustesse sur Render, on va sonder le dernier message.

    let lastMessageId: string | null = null;

    while (true) {
        try {
            // Récupérer tous les messages
            const allPosts = await page.locator(SELECTORS.POST_MESSAGE).all();
            
            if (allPosts.length > 0) {
                // On ne vérifie que le dernier message pour éviter de re-traiter tout l'historique
                const latestPost = allPosts[allPosts.length - 1];
                const currentMessageId = await latestPost.getAttribute('id');

                if (currentMessageId && currentMessageId !== lastMessageId) {
                    await checkAndDelete(latestPost);
                    lastMessageId = currentMessageId;
                }
            }
        } catch (error) {
            console.error("[ERREUR] Erreur de surveillance:", error);
            // Tenter de recharger la page en cas d'erreur grave (déconnexion, crash)
            await page.reload();
            await page.waitForSelector(SELECTORS.CHAT_LOADED, { timeout: 10000 });
        }
        
        // Attendre un court instant avant de vérifier à nouveau (sondage)
        await page.waitForTimeout(500); // Vérification toutes les 500ms
    }
}

// Export de la fonction pour la rendre testable et exécutable
export { startBot, saveCookies, loadCookies, isSessionValid, browser, context, page, startRulesTimer, startMonitoring };
