// Outils partagés autour des fiches médecins : spécialités associées, recherche, détection des doublons.
const { ErreurHttp } = require('./erreurs');

/** Minuscules, sans accents ni ponctuation : « Éloïse  Dupont-Martin » -> « eloise dupont martin ». */
function normaliser(texte) {
  return String(texte || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Clé de comparaison d'un numéro de téléphone : ses 9 derniers chiffres (« +33 6 12… » = « 06 12… »). */
function cleTelephone(tel) {
  const chiffres = String(tel || '').replace(/\D/g, '');
  return chiffres.length >= 6 ? chiffres.slice(-9) : '';
}

/**
 * Remplace les spécialités d'un médecin par la liste fournie.
 * Une spécialité désactivée ne peut plus être ajoutée, mais reste si le médecin l'a déjà.
 */
async function remplacerSpecialites(tx, medecinId, ids) {
  const uniques = [...new Set(ids)];
  if (uniques.length > 0) {
    const trouvees = await tx.specialite.findMany({ where: { id: { in: uniques } } });
    if (trouvees.length !== uniques.length) throw new ErreurHttp(400, 'Une des spécialités indiquées est inconnue.');
    const dejaLiees = new Set(
      (await tx.medecinSpecialite.findMany({ where: { medecinId }, select: { specialiteId: true } })).map((l) => l.specialiteId)
    );
    const indisponible = trouvees.find((s) => !s.actif && !dejaLiees.has(s.id));
    if (indisponible) throw new ErreurHttp(400, `La spécialité « ${indisponible.libelle} » n'est plus disponible.`);
  }
  await tx.medecinSpecialite.deleteMany({ where: { medecinId, specialiteId: { notIn: uniques } } });
  if (uniques.length > 0) {
    await tx.medecinSpecialite.createMany({
      data: uniques.map((specialiteId) => ({ medecinId, specialiteId })),
      skipDuplicates: true,
    });
  }
}

/**
 * Cherche dans la base les médecins qui correspondent à une personne saisie :
 *   - même téléphone (identifiant fort)          -> raison « telephone »
 *   - même nom + prénom (ordre indifférent)      -> raison « nom » (peut être un homonyme)
 */
async function chercherDoublons(client, { nom, prenom, telephone }, include) {
  const medecins = await client.utilisateur.findMany({ where: { role: 'MEDECIN' }, take: 5000, include });
  const cleTel = cleTelephone(telephone);
  const a = normaliser(nom);
  const b = normaliser(prenom);
  const resultats = [];
  for (const m of medecins) {
    if (cleTel && cleTelephone(m.telephone) === cleTel) {
      resultats.push({ raison: 'telephone', medecin: m });
      continue;
    }
    const mn = normaliser(m.nom);
    const mp = normaliser(m.prenom);
    if ((mn === a && mp === b) || (mn === b && mp === a)) resultats.push({ raison: 'nom', medecin: m });
  }
  return resultats;
}

/** Filtre en mémoire (insensible aux accents et à la casse) pour l'annuaire. */
function filtrerAnnuaire(medecins, { q, specialiteId, type }) {
  const termes = normaliser(q).split(' ').filter(Boolean);
  return medecins.filter((m) => {
    if (specialiteId && !m.specialites.some((l) => l.specialiteId === specialiteId)) return false;
    if (type && !m.specialites.some((l) => l.specialite.type === type)) return false;
    if (termes.length === 0) return true;
    const texte = normaliser([m.nom, m.prenom, ...m.specialites.map((l) => l.specialite.libelle)].join(' '));
    return termes.every((t) => texte.includes(t));
  });
}

module.exports = { normaliser, cleTelephone, remplacerSpecialites, chercherDoublons, filtrerAnnuaire };
