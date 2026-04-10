export const logger = {
    info: (msg, data = '') => {
        console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`, data ? JSON.stringify(data) : '');
    },
    warn: (msg, data = '') => {
        console.warn(`\x1b[33m[WARN]\x1b[0m ${msg}`, data ? JSON.stringify(data) : '');
    },
    error: (msg, err = '') => {
        console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`, err instanceof Error ? err.stack : err);
    },
    success: (msg) => {
        console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`);
    }
};
