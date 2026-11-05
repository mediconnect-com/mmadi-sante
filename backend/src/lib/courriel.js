// Envoi d'e-mails transactionnels via l'API HTTPS de Resend (aucun port SMTP : compatible avec l'hébergement gratuit de Render).
//   - RESEND_API_KEY définie  -> envoi réel ;
//   - sinon, hors production  -> le message est affiché dans la console (et conservé dans `boiteDeTest`) ;
//   - sinon, en production    -> erreur journalisée (aucun message n'est envoyé).
const config = require('../config');

const boiteDeTest = []; // utilisée uniquement par les tests automatiques (hors production)

async function envoyerCourriel({ a, sujet, texte, html }) {
  const { cleResend, expediteur } = config.courriel;
  if (!cleResend) {
    if (config.production) {
      console.error(`[COURRIEL] RESEND_API_KEY absente : e-mail « ${sujet} » non envoyé.`);
      return false;
    }
    boiteDeTest.push({ a, sujet, texte, html });
    if (boiteDeTest.length > 50) boiteDeTest.shift();
    console.log(`\n[COURRIEL — mode développement, rien n'est envoyé]\nÀ : ${a}\nObjet : ${sujet}\n${texte}\n`);
    return true;
  }
  const reponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cleResend}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: expediteur, to: [a], subject: sujet, text: texte, html }),
    signal: AbortSignal.timeout(15000),
  });
  if (!reponse.ok) {
    const detail = (await reponse.text().catch(() => '')).slice(0, 300);
    throw new Error(`Resend a répondu ${reponse.status} : ${detail}`);
  }
  return true;
}

const echapper = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function courrielReinitialisation({ prenom, lien, minutes }) {
  const duree = minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60} heure${minutes > 60 ? 's' : ''}` : `${minutes} minutes`;
  const texte =
    `Bonjour ${prenom},\n\n` +
    `Vous avez demandé à réinitialiser votre mot de passe MmadiSanté. Ouvrez ce lien pour en choisir un nouveau (valable ${duree}, utilisable une seule fois) :\n\n${lien}\n\n` +
    `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste inchangé.\n\nMmadiSanté`;
  const html =
    `<p>Bonjour ${echapper(prenom)},</p>` +
    `<p>Vous avez demandé à réinitialiser votre mot de passe MmadiSanté. Cliquez sur le bouton pour en choisir un nouveau (lien valable ${duree}, utilisable une seule fois).</p>` +
    `<p><a href="${echapper(lien)}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Choisir un nouveau mot de passe</a></p>` +
    `<p style="font-size:13px;color:#555">Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br>${echapper(lien)}</p>` +
    `<p style="font-size:13px;color:#555">Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste inchangé.</p>`;
  return { sujet: 'MmadiSanté : réinitialisation de votre mot de passe', texte, html };
}

function courrielMotDePasseModifie({ prenom }) {
  const texte = `Bonjour ${prenom},\n\nLe mot de passe de votre compte MmadiSanté vient d'être modifié. Si ce n'était pas vous, demandez immédiatement une nouvelle réinitialisation depuis la page de connexion et prévenez l'administrateur.\n\nMmadiSanté`;
  const html = `<p>Bonjour ${echapper(prenom)},</p><p>Le mot de passe de votre compte MmadiSanté vient d'être modifié.</p><p>Si ce n'était pas vous, demandez immédiatement une nouvelle réinitialisation depuis la page de connexion et prévenez l'administrateur.</p>`;
  return { sujet: 'MmadiSanté : votre mot de passe a été modifié', texte, html };
}

module.exports = { envoyerCourriel, courrielReinitialisation, courrielMotDePasseModifie, boiteDeTest };
