// Point d'entrée : démarre le serveur HTTP.
const config = require('./config');
const app = require('./app');

const serveur = app.listen(config.port, () => {
  console.log(`[API] MmadiSanté démarrée sur le port ${config.port} (${config.production ? 'production' : 'développement'})`);
  console.log(`[API] Origines autorisées (CORS) : ${config.originesAutorisees.join(', ')}`);
});

// Arrêt propre quand l'hébergeur redémarre le service.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[API] ${signal} reçu, arrêt...`);
    serveur.close(() => process.exit(0));
  });
}
