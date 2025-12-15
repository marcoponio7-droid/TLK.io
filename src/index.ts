// src/index.ts

import { startBot } from './bot';

startBot().catch(error => {
    console.error("[ERREUR GLOBALE] Une erreur inattendue s'est produite:", error);
    process.exit(1);
});
