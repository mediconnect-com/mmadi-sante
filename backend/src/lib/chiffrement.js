// Chiffrement AES-256-GCM du numéro de carte d'identité (donnée sensible stockée en base).
// Format stocké : iv.tag.contenu (chacun en base64).
const crypto = require('crypto');
const config = require('../config');

function chiffrer(texte) {
  if (texte === undefined || texte === null || texte === '') return null;
  const iv = crypto.randomBytes(12);
  const chiffreur = crypto.createCipheriv('aes-256-gcm', config.cleChiffrement, iv);
  const contenu = Buffer.concat([chiffreur.update(String(texte), 'utf8'), chiffreur.final()]);
  const tag = chiffreur.getAuthTag();
  return [iv, tag, contenu].map((b) => b.toString('base64')).join('.');
}

function dechiffrer(valeur) {
  if (!valeur) return null;
  try {
    const [iv, tag, contenu] = valeur.split('.').map((p) => Buffer.from(p, 'base64'));
    const dechiffreur = crypto.createDecipheriv('aes-256-gcm', config.cleChiffrement, iv);
    dechiffreur.setAuthTag(tag);
    return Buffer.concat([dechiffreur.update(contenu), dechiffreur.final()]).toString('utf8');
  } catch {
    // Clé changée ou donnée corrompue : on ne plante pas, on n'affiche rien.
    return null;
  }
}

module.exports = { chiffrer, dechiffrer };
