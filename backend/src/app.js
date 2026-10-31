// Application Express : assemblage de la sécurité, des routes /api/v1 et de la gestion d'erreurs.
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const prisma = require('./lib/prisma');
const { routeIntrouvable, gestionErreurs } = require('./middleware/erreurs');

const app = express();
app.set('trust proxy', 1); // Render / Railway placent l'API derrière un proxy
app.disable('x-powered-by');

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    // Seul le site web déclaré dans FRONTEND_URL peut appeler l'API depuis un navigateur.
    origin(origine, rappel) {
      if (!origine || config.originesAutorisees.includes(origine)) return rappel(null, true);
      return rappel(null, false);
    },
    exposedHeaders: ['Content-Disposition'],
  })
);
app.use(express.json({ limit: '100kb' }));

const v1 = express.Router();

// Santé : sert de « health check » à l'hébergeur (et réveille la base).
v1.get('/sante', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ statut: 'ok', baseDeDonnees: 'ok' });
  } catch (e) {
    console.error('[SANTÉ] base injoignable :', e.message);
    res.status(503).json({ statut: 'erreur', baseDeDonnees: 'injoignable' });
  }
});

v1.use('/auth', require('./routes/auth'));
v1.use('/profil', require('./routes/profil'));
v1.use('/utilisateurs', require('./routes/utilisateurs'));
v1.use('/documents', require('./routes/documents'));
v1.use('/medecin', require('./routes/medecin'));
v1.use('/admin', require('./routes/admin'));
v1.use('/specialites', require('./routes/specialites'));
v1.use('/medecins', require('./routes/medecins'));
v1.use('/rendez-vous', require('./routes/rendezvous'));

app.use('/api/v1', v1);
app.get('/', (req, res) => res.json({ nom: 'API MmadiSanté', version: 'v1', sante: '/api/v1/sante' }));

app.use(routeIntrouvable);
app.use(gestionErreurs);

module.exports = app;
