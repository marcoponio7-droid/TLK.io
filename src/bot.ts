// src/bot.ts

import { chromium, Browser, BrowserContext, Page, Locator } from 'playwright';
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
        console.log(`[INFO] ${blockedUsers.length} pseudos bloqués chargés: ${blockedUsers.join(', ')}`);
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
 */
async function loadCookies(context: BrowserContext): Promise<void> {
    try {
        const cookiesJson = await fs.readFile(COOKIE_PATH, 'utf-8');
        const rawCookies = JSON.parse(cookiesJson);
        const cookies = rawCookies.map((c: any) => {
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
 * Vérifie si la session est valide.
 */
async function isSessionValid(page: Page): Promise<boolean> {
    try {
        await page.waitForSelector(SELECTORS.CHAT_LOADED, { timeout: 10000 });
        console.log("[INFO] Session valide. Le champ de message est visible.");
        return true;
    } catch (error) {
        console.log("[AVERTISSEMENT] Session invalide ou déconnectée.");
        return false;
    }
}

/**
 * Fonction principale pour démarrer le bot.
 */
async function startBot() {
    console.log("[DÉMARRAGE] Lancement du bot de modération tlk.io...");

    browser = await chromium.launch({ 
        headless: true,
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined
    });
    context = await browser.newContext();

    await loadCookies(context);

    page = await context.newPage();
    await page.goto(TLK_URL, { waitUntil: 'domcontentloaded' });

    console.log("[INFO] Attente du chargement complet de la page...");
    await page.waitForTimeout(5000);
    
    console.log(`[DEBUG] URL actuelle: ${page.url()}`);
    console.log(`[DEBUG] Titre de la page: ${await page.title()}`);
    
    const isLoaded = await page.locator(SELECTORS.CHAT_LOADED).count();
    console.log(`[DEBUG] Champ de message trouvé: ${isLoaded > 0 ? 'OUI' : 'NON'}`);
    
    await page.screenshot({ path: 'debug-screenshot.png' });
    console.log(`[DEBUG] Capture d'écran sauvegardée: debug-screenshot.png`);

    await loadBlockedUsers();
    console.log("[SUCCÈS] Démarrage du serveur Keep-Alive, de la surveillance et du timer...");
    startKeepAliveServer();
    await startMonitoring(page);
    startRulesTimer(page);
}

/**
 * Envoie le message des règles dans le chat.
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
 */
function startRulesTimer(page: Page): void {
    setInterval(() => {
        sendRulesMessage(page);
    }, RULES_INTERVAL_MS);
    console.log(`[INFO] Timer des règles démarré. Envoi toutes les ${RULES_INTERVAL_MS / 1000 / 60} minutes.`);
}

/**
 * Supprime un message en utilisant JavaScript directement (comme Tampermonkey).
 */
async function deleteMessage(postElement: Locator): Promise<void> {
    try {
        // Utiliser evaluate pour exécuter le code comme Tampermonkey le fait
        const deleted = await postElement.evaluate((post: Element) => {
            // Simuler mouseenter
            post.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
            
            // Récupérer tous les boutons
            const buttons = post.querySelectorAll("button");
            if (buttons.length >= 2) {
                // Cliquer sur le 2ème bouton (index 1)
                (buttons[1] as HTMLButtonElement).click();
                return true;
            } else if (buttons.length === 1) {
                // Si un seul bouton, essayer de cliquer dessus
                (buttons[0] as HTMLButtonElement).click();
                return true;
            }
            return false;
        });

        if (deleted) {
            console.log("[SUPPRESSION] Message supprimé avec succès.");
        } else {
            console.log("[AVERTISSEMENT] Aucun bouton de suppression trouvé.");
        }
    } catch (error) {
        console.error("[ERREUR] Échec de la suppression du message:", error);
    }
}

/**
 * Vérifie si un post contient un média (comme le script Tampermonkey).
 */
async function postHasMedia(postElement: Locator): Promise<boolean> {
    try {
        // Vérifier les balises img, video, svg
        const mediaCount = await postElement.locator('img, video, svg').count();
        if (mediaCount > 0) return true;

        // Vérifier les liens vers des fichiers médias
        const links = await postElement.locator('a[href]').all();
        for (const link of links) {
            const href = await link.getAttribute('href');
            if (href && MEDIA_REGEX.test(href)) {
                return true;
            }
        }

        return false;
    } catch (error) {
        return false;
    }
}

/**
 * Vérifie si un post est d'un utilisateur bloqué (correspondance exacte comme Tampermonkey).
 */
async function isBlockedUser(postElement: Locator): Promise<{ blocked: boolean; username: string }> {
    try {
        const nameEl = postElement.locator(SELECTORS.POST_NAME);
        if (await nameEl.count() === 0) {
            return { blocked: false, username: '' };
        }

        const username = (await nameEl.innerText()).trim();
        const blocked = blockedUsers.includes(username);
        
        return { blocked, username };
    } catch (error) {
        return { blocked: false, username: '' };
    }
}

/**
 * Vérifie et supprime un post si nécessaire.
 */
async function checkAndDelete(postElement: Locator): Promise<void> {
    try {
        // Vérifier si c'est un utilisateur bloqué
        const { blocked, username } = await isBlockedUser(postElement);
        if (blocked) {
            console.log(`[ALERTE] Suppression - Pseudo bloqué: ${username}`);
            await deleteMessage(postElement);
            return;
        }

        // Vérifier si le post contient un média
        if (await postHasMedia(postElement)) {
            console.log(`[ALERTE] Suppression - Média détecté de: ${username || 'inconnu'}`);
            await deleteMessage(postElement);
            return;
        }
    } catch (error) {
        // Ignorer les erreurs silencieusement
    }
}

/**
 * Démarre la surveillance des nouveaux messages (comme Tampermonkey).
 */
async function startMonitoring(page: Page): Promise<void> {
    await page.waitForSelector(SELECTORS.POST_CONTAINER, { state: 'attached', timeout: 30000 });
    console.log("[INFO] Surveillance démarrée - Utilisation du sélecteur dl.post");

    const processedIds = new Set<string>();
    let loopCount = 0;

    while (true) {
        try {
            // Récupérer tous les posts (dl.post)
            const allPosts = await page.locator(SELECTORS.POST_CONTAINER).all();
            
            loopCount++;
            if (loopCount % 60 === 0) {
                console.log(`[DEBUG] Surveillance active - ${allPosts.length} posts détectés`);
            }

            // Scanner tous les posts (comme le fait Tampermonkey avec setInterval)
            for (const post of allPosts) {
                try {
                    // Essayer d'obtenir un identifiant unique pour ce post
                    const postId = await post.evaluate((el) => {
                        // Utiliser l'index dans le DOM ou créer un hash du contenu
                        const text = el.textContent || '';
                        return `${el.className}_${text.slice(0, 50)}`;
                    });

                    // Vérifier si on a déjà traité ce post
                    if (!processedIds.has(postId)) {
                        await checkAndDelete(post);
                        processedIds.add(postId);
                        
                        // Limiter la taille du set pour éviter les fuites mémoire
                        if (processedIds.size > 500) {
                            const iterator = processedIds.values();
                            for (let i = 0; i < 100; i++) {
                                const value = iterator.next().value;
                                if (value) processedIds.delete(value);
                            }
                        }
                    }
                } catch (e) {
                    // Ignorer les erreurs individuelles
                }
            }
        } catch (error) {
            console.error("[ERREUR] Erreur de surveillance:", error);
            try {
                await page.reload();
                await page.waitForSelector(SELECTORS.CHAT_LOADED, { timeout: 10000 });
            } catch (reloadError) {
                console.error("[ERREUR] Échec du rechargement:", reloadError);
            }
        }
        
        // Vérification toutes les 300ms (comme Tampermonkey)
        await page.waitForTimeout(300);
    }
}

/**
 * Démarre un mini-serveur HTTP pour maintenir le service actif et gérer l'admin.
 */
function startKeepAliveServer(): void {
    const app = express();
    const port = process.env.PORT || 5000;

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    const adminAuth = (req: any, res: any, next: any) => {
        if (req.query.key !== ADMIN_KEY) {
            return res.status(403).send('Accès refusé. Clé d\'administration invalide.');
        }
        next();
    };

    app.get('/', (req, res) => {
        res.status(200).send('tlk.io Mod Bot is running and active.');
    });

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

export { startBot, saveCookies, loadCookies, isSessionValid, browser, context, page, startRulesTimer, startMonitoring, loadBlockedUsers, saveBlockedUsers };
