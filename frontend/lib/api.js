// Client HTTP de l'API MmadiSanté.

// ⚠ PIÈGE FRÉQUENT : l'URL de l'API doit inclure son chemin COMPLET, « /api/v1 » compris.
//    OK  : https://mmadi-sante-api.onrender.com/api/v1
//    NON : https://mmadi-sante-api.onrender.com
//  Elle est configurée dans NEXT_PUBLIC_API_URL (frontend/.env.local en local, variable
//  d'environnement du service « mmadi-sante-web » sur Render) et figée à la construction (build).
function normaliserUrlApi(brut) {
  let url = (brut || '').trim().replace(/\/+$/, '');
  if (!url) url = 'http://localhost:4000/api/v1';
  if (!/\/api\/v\d+$/.test(url)) {
    // Filet de sécurité : on complète le chemin manquant et on prévient dans la console.
    console.warn(
      `[MmadiSanté] NEXT_PUBLIC_API_URL ("${url}") ne se termine pas par /api/v1 : le chemin a été ajouté automatiquement. ` +
        'Corrigez la variable pour éviter toute ambiguïté.'
    );
    url += '/api/v1';
  }
  return url;
}

export const API_URL = normaliserUrlApi(process.env.NEXT_PUBLIC_API_URL);

const CLE_JETON = 'mmadi_jeton';

export function lireJeton() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(CLE_JETON);
  } catch {
    return null;
  }
}
export function ecrireJeton(jeton) {
  try {
    window.localStorage.setItem(CLE_JETON, jeton);
  } catch {
    /* stockage indisponible (navigation privée stricte) : la session durera le temps de la page */
  }
}
export function effacerJeton() {
  try {
    window.localStorage.removeItem(CLE_JETON);
  } catch {
    /* rien à faire */
  }
}

export class ErreurApi extends Error {
  constructor(statut, message) {
    super(message);
    this.statut = statut;
  }
}

/**
 * Appelle l'API.
 *  - json : objet envoyé en JSON
 *  - formData : envoi de fichiers (multipart)
 *  - reponse : 'json' (défaut) ou 'blob' (téléchargement d'un fichier)
 */
export async function appelApi(chemin, { methode = 'GET', json, formData, reponse = 'json' } = {}) {
  const headers = {};
  const jeton = lireJeton();
  if (jeton) headers.Authorization = `Bearer ${jeton}`;

  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (formData) {
    body = formData; // le navigateur ajoute lui-même le Content-Type multipart
  }

  let res;
  try {
    res = await fetch(API_URL + chemin, { method: methode, headers, body });
  } catch {
    throw new ErreurApi(
      0,
      "Impossible de joindre le serveur. S'il vient d'être sollicité après une période d'inactivité, " +
        'il se réveille : patientez environ une minute puis réessayez.'
    );
  }

  if (res.status === 401 && jeton) {
    // Session expirée ou compte supprimé : on se déconnecte proprement.
    effacerJeton();
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('mmadi:deconnecte'));
  }

  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const corps = await res.json();
      if (corps && corps.erreur) message = corps.erreur;
    } catch {
      /* réponse non JSON : on garde le message générique */
    }
    throw new ErreurApi(res.status, message);
  }

  return reponse === 'blob' ? res.blob() : res.json();
}

/** Envoie une requête légère pour « réveiller » l'API gratuite (mise en veille) sans attendre la réponse. */
export function reveillerApi() {
  fetch(API_URL + '/sante').catch(() => {});
}
