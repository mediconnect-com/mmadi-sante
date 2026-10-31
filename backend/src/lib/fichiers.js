// Contrôles des fichiers téléversés : type réel (signature binaire) et nom nettoyé.
const TYPES_AUTORISES = {
  'application/pdf': (b) => b.length > 4 && b.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) =>
    b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
};

/** Vérifie que le type annoncé est autorisé ET que le contenu correspond vraiment à ce type. */
function fichierValide(typeMime, contenu) {
  const verif = TYPES_AUTORISES[typeMime];
  return Boolean(verif && verif(contenu));
}

/** Multer décode les noms en latin1 : on restaure l'UTF-8, puis on retire tout chemin et caractère de contrôle. */
function nettoyerNomFichier(nomOriginal) {
  let nom = Buffer.from(nomOriginal || 'document', 'latin1').toString('utf8');
  nom = nom.replace(/[\\/]+/g, '_').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (nom || 'document').slice(0, 150);
}

module.exports = { fichierValide, nettoyerNomFichier };
