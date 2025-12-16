// src/bot.ts

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import express from 'express';
import * as fs from 'fs/promises';
import { COOKIE_PATH, TLK_URL, SELECTORS, MEDIA_REGEX, RULES_MESSAGE, RULES_INTERVAL_MS, ADMIN_KEY } from './config';

let browser: Browser;
let blockedUsers: string[] = [];
const BLOCKED_USERS_PATH = path.join(process.cwd(), 'blocked-users.json');
let context: BrowserContext;
let page: Page;

/**
 * Charge la liste des pseudos bloqués depuis le fichier JSON.
 */
async function loadBlockedUsers(): Promise<void> {
    try {
        const data = await fs.readFile(BLOCKED_USERS_PATH, 'utf-8');
        const json = JSON.parse(data);
        blockedUsers = json.blocked || [];
        console.log(`[INFO] ${blockedUsers.length} pseudos bloqués chargés.`);
    } catch (error) {
        console.error("[ERREUR] Échec du chargement des pseudos bloqués. Utilisation d'une liste vide.", error);
        blockedUsers = [];
    }
}

/**
 * Sauvegarde la liste des pseudos bloqués dans le fichier JSON.
 */
async function saveBlockedUsers(): Promise<void> {
    try {
        const data = JSON.stringify({ blocked: blockedUsers }, null, 2);
        await fs.writeFile(BLOCKED_USERS_PATH, data);
        console.log(`[INFO] ${blockedUsers.length} pseudos bloqués sauvegardés.`);
    } catch (error) {
        console.error("[ERREUR] Échec de la sauvegarde des pseudos bloqués:", error);
    }
}

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
        const rawCookies = JSON.parse(cookiesJson);
        const cookies = rawCookies.map((c: any) => {
            // Convertir sameSite de Firefox vers Playwright
            let sameSite: 'Strict' | 'Lax' | 'None' = 'Lax';
            if (c.sameSite === 'no_restriction' || c.sameSite === 'None') {
                sameSite = 'None';
            } else if (c.sameSite === 'Strict' || c.sameSite === 'strict') {
                sameSite = 'Strict';
            }
            
            return {
                name: c.name,
                value: c.value,
                domain: c.domain,
                path: c.path || '/',
                expires: c.expirationDate ? Math.floor(c.expirationDate) : -1,
                httpOnly: c.httpOnly || false,
                secure: c.secure || false,
                sameSite: sameSite
            };
        });
        console.log(`[DEBUG] Cookies à charger: ${cookies.length}`);
        await context.addCookies(cookies);
        console.log(`[INFO] Cookies chargés depuis ${COOKIE_PATH}`);
    } catch (error) {
        console.log("[INFO] Pas de cookies existants ou erreur de chargement. Démarrage d'une nouvelle session.");
        console.error(error);
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

    // Configuration pour l'hébergement Replit (mode headless avec Chromium système)
    browser = await chromium.launch({ 
        headless: true,
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined
    });
    context = await browser.newContext();

    // 1. Chargement des cookies
    await loadCookies(context);

    // 2. Navigation vers tlk.io
    page = await context.newPage();
    await page.goto(TLK_URL, { waitUntil: 'domcontentloaded' });

    // 3. On suppose que la session est valide et on attend le chargement complet
    console.log("[INFO] Attente du chargement complet de la page...");
    await page.waitForTimeout(5000); // Attendre 5 secondes pour le chargement du chat
    
    // Debug: afficher l'URL actuelle et le titre de la page
    console.log(`[DEBUG] URL actuelle: ${page.url()}`);
    console.log(`[DEBUG] Titre de la page: ${await page.title()}`);
    
    // Vérifier si on voit le champ de message (signe qu'on est connecté)
    const isLoaded = await page.locator(SELECTORS.CHAT_LOADED).count();
    console.log(`[DEBUG] Champ de message trouvé: ${isLoaded > 0 ? 'OUI' : 'NON'}`);
    
    // Prendre une capture d'écran pour debug
    await page.screenshot({ path: 'debug-screenshot.png' });
    console.log(`[DEBUG] Capture d'écran sauvegardée: debug-screenshot.png`);
    
    // Afficher le HTML principal pour voir ce que le bot voit
    const bodyText = await page.locator('body').innerText();
    console.log(`[DEBUG] Contenu page (premiers 500 chars): ${bodyText.substring(0, 500)}`);

    // 4. Démarrage du serveur Keep-Alive, de la surveillance et du timer
    await loadBlockedUsers(); // Charger la liste des pseudos bloqués
    console.log("[SUCCÈS] Démarrage du serveur Keep-Alive, de la surveillance et du timer...");
    startKeepAliveServer();
    await startMonitoring(page);
    startRulesTimer(page);

    // Pour l'instant, on laisse le bot tourner indéfiniment pour simuler le 24/7
    // process.on('SIGINT', async () => {
    //     console.log("[ARRÊT] Fermeture du navigateur...");
    //     await browser.close();
    //     process.exit(0);
    // });
}

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
        await page.waitForTimeout(300);

        // 2. Essayer plusieurs sélecteurs pour le bouton de suppression
        let deleteButton = postElement.locator(SELECTORS.DELETE_BUTTON);
        let buttonCount = await deleteButton.count();
        
        if (buttonCount === 0) {
            // Alternative: chercher le bouton danger (rouge) de suppression
            deleteButton = postElement.locator('.button--danger, button[title*="delete"], button[title*="suppr"]');
            buttonCount = await deleteButton.count();
        }
        
        if (buttonCount === 0) {
            // Dernière alternative: 2ème bouton
            deleteButton = postElement.locator('button:nth-child(2)');
        }

        await deleteButton.first().click({ timeout: 5000 });
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
        const pseudoMinuscule = pseudo.trim().replace(/:$/, '').toLowerCase();
        const blockedMinuscule = blockedUsers.map(u => u.toLowerCase());

        // 1. Vérification par pseudo
        if (blockedMinuscule.includes(pseudoMinuscule)) {
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
        const linkRegex = /(https?:\/\/[^\s]+)/g;
        let match;
        
        while ((match = linkRegex.exec(message)) !== null) {
            const link = match[0];
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

    let loopCount = 0;
    while (true) {
        try {
            // Récupérer tous les messages
            const allPosts = await page.locator(SELECTORS.POST_MESSAGE).all();
            
            // Log périodique pour debug (toutes les 60 itérations = ~30 secondes)
            loopCount++;
            if (loopCount % 60 === 0) {
                console.log(`[DEBUG] Surveillance active - ${allPosts.length} messages détectés`);
            }
            
            if (allPosts.length > 0) {
                // On ne vérifie que le dernier message pour éviter de re-traiter tout l'historique
                const latestPost = allPosts[allPosts.length - 1];
                const currentMessageId = await latestPost.getAttribute('id');

                if (currentMessageId && currentMessageId !== lastMessageId) {
                    console.log(`[DEBUG] Nouveau message détecté: ${currentMessageId}`);
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

/**
 * Démarre un mini-serveur HTTP pour maintenir le service Render actif et gérer l'admin.
 */
function startKeepAliveServer(): void {
    const app = express();
    const port = process.env.PORT || 5000;

    // Middleware pour le parsing JSON et URL-encoded
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Middleware de sécurité pour l'interface admin
    const adminAuth = (req: any, res: any, next: any) => {
        if (req.query.key !== ADMIN_KEY) {
            return res.status(403).send('Accès refusé. Clé d\'administration invalide.');
        }
        next();
    };

    // Route Keep-Alive
    app.get('/', (req, res) => {
        res.status(200).send('tlk.io Mod Bot is running and active.');
    });

    // Routes d'administration (Phase 3)
    app.get('/admin/blocked-users', adminAuth, (req, res) => {
        const html = `
            <!DOCTYPE html>
            <html lang="fr">
            <head>
                <meta charset="UTF-8">
                <title>Admin Pseudos Bloqués</title>
                <style>
                    body { font-family: sans-serif; margin: 20px; }
                    .container { max-width: 600px; margin: auto; }
                    h1 { border-bottom: 2px solid #ccc; padding-bottom: 10px; }
                    ul { list-style: none; padding: 0; }
                    li { margin-bottom: 10px; padding: 8px; border: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
                    form { margin-top: 20px; padding: 15px; border: 1px solid #ccc; }
                    input[type="text"] { padding: 8px; width: 70%; }
                    button { padding: 8px 15px; cursor: pointer; }
                    .remove-btn { background-color: #f44336; color: white; border: none; }
                    .add-btn { background-color: #4CAF50; color: white; border: none; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Gestion des Pseudos Bloqués</h1>
                    <p>Accès sécurisé par clé d'administration.</p>
                    
                    <h2>Liste Actuelle (${blockedUsers.length})</h2>
                    <ul>
                        ${blockedUsers.map(pseudo => `
                            <li>
                                <span>${pseudo}</span>
                                <form method="POST" action="/admin/blocked-users/remove?key=${ADMIN_KEY}">
                                    <input type="hidden" name="pseudo" value="${pseudo}">
                                    <button type="submit" class="remove-btn">Supprimer</button>
                                </form>
                            </li>
                        `).join('')}
                    </ul>

                    <h2>Ajouter un Pseudo</h2>
                    <form method="POST" action="/admin/blocked-users/add?key=${ADMIN_KEY}">
                        <input type="text" name="pseudo" placeholder="Nouveau pseudo à bloquer" required>
                        <button type="submit" class="add-btn">Ajouter</button>
                    </form>
                </div>
            </body>
            </html>
        `;
        res.send(html);
    });

    app.post('/admin/blocked-users/add', adminAuth, async (req, res) => {
        const pseudo = req.body.pseudo ? req.body.pseudo.trim() : null;
        if (pseudo && !blockedUsers.includes(pseudo)) {
            blockedUsers.push(pseudo);
            await saveBlockedUsers();
            await loadBlockedUsers();
            console.log(`[ADMIN] Pseudo ajouté: ${pseudo}`);
        }
        res.redirect(`/admin/blocked-users?key=${ADMIN_KEY}`);
    });

    app.post('/admin/blocked-users/remove', adminAuth, async (req, res) => {
        const pseudo = req.body.pseudo ? req.body.pseudo.trim() : null;
        const initialLength = blockedUsers.length;
        blockedUsers = blockedUsers.filter(u => u !== pseudo);
        if (blockedUsers.length < initialLength) {
            await saveBlockedUsers();
            await loadBlockedUsers();
            console.log(`[ADMIN] Pseudo supprimé: ${pseudo}`);
        }
        res.redirect(`/admin/blocked-users?key=${ADMIN_KEY}`);
    });

    app.listen(port, () => {
        console.log(`[INFO] Keep-Alive Server started on port ${port}`);
        console.log(`[INFO] Admin accessible via /admin/blocked-users?key=${ADMIN_KEY}`);
    });
}

// Export de la fonction pour la rendre testable et exécutable
export { startBot, saveCookies, loadCookies, isSessionValid, browser, context, page, startRulesTimer, startMonitoring, loadBlockedUsers, saveBlockedUsers };
