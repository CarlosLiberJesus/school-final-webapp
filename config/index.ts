// src/config/index.ts
import dotenv from 'dotenv';
dotenv.config(); // <--- CHAMADA 1: Tenta carregar .env do CWD (Current Working Directory)

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // Em build, será E:\MCPs\school-moodle-mcp\build\config
const projectRoot = path.resolve(__dirname, '..', '..'); // Será E:\MCPs\school-moodle-mcp
const envPath = path.join(projectRoot, '.env'); // Será E:\MCPs\school-moodle-mcp\.env

console.log("=> Env path " + envPath);
// <--- CHAMADA 2: Tenta carregar .env de um caminho específico
const loadEnvResult = dotenv.config({ path: envPath });

if (loadEnvResult.error) {
    console.error(`Config: Error loading .env from ${envPath}: ${loadEnvResult.error.message}`);
} else {
    // console.info(`Config: Successfully loaded .env from ${envPath}`); // DESCOMENTE ISTO!
    // console.info('Config: Loaded variables from explicit path:', loadEnvResult.parsed); // DESCOMENTE ISTO!
}

// PARA DEBUG, adicione logs IMEDIATAMENTE ANTES de aceder a process.env
console.log('--- DEBUG PROCESS.ENV ---');
console.log('process.env.MOODLE_URL AFTER ALL DOTENV CALLS:', process.env.MOODLE_URL);
console.log('process.env.MOODLE_TOKEN AFTER ALL DOTENV CALLS:', process.env.MOODLE_TOKEN);
console.log('--- END DEBUG PROCESS.ENV ---');


export const MOODLE_URL = process.env.MOODLE_URL;
export const MOODLE_TOKEN = process.env.MOODLE_TOKEN;
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0'; // Mantendo a sua lógica

if (!MOODLE_URL) {
    console.error('Config in src/index.js: FATAL ERROR - MOODLE_URL is not defined in the environment.');
    process.exit(1);
}
if (!MOODLE_TOKEN) {
    console.error('Config in src/index.js FATAL ERROR - MOODLE_TOKEN is not defined in the environment.');
    process.exit(1);
}