"use strict";
// src/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
const bot_1 = require("./bot");
(0, bot_1.startBot)().catch(error => {
    console.error("[ERREUR GLOBALE] Une erreur inattendue s'est produite:", error);
    process.exit(1);
});
