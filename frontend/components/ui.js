'use client';
// Petits composants d'interface réutilisables (Tailwind).
import { ROLES } from '@/lib/constantes';

export function Chargement({ texte = 'Chargement…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-marque-600 border-t-transparent" />
      <span>{texte}</span>
    </div>
  );
}

export function Alerte({ type = 'erreur', children }) {
  if (!children) return null;
  const styles = {
    erreur: 'border-red-200 bg-red-50 text-red-800',
    succes: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-sky-200 bg-sky-50 text-sky-800',
  };
  return (
    <div role={type === 'erreur' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${styles[type]}`}>
      {children}
    </div>
  );
}

export function Carte({ titre, action, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {(titre || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {titre && <h2 className="text-lg font-semibold text-slate-800">{titre}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Champ({ label, valeur, onChange, type = 'text', requis = false, aide, ...reste }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {requis && <span className="text-red-600"> *</span>}
      </span>
      <input
        type={type}
        value={valeur ?? ''}
        onChange={(e) => onChange(e.target.value)}
        required={requis}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-marque-600 focus:outline-none focus:ring-2 focus:ring-marque-500/30"
        {...reste}
      />
      {aide && <span className="mt-1 block text-xs text-slate-500">{aide}</span>}
    </label>
  );
}

export function Selecteur({ label, valeur, onChange, options, requis = false }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {requis && <span className="text-red-600"> *</span>}
      </span>
      <select
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        required={requis}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-marque-600 focus:outline-none focus:ring-2 focus:ring-marque-500/30"
      >
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Bouton({ variante = 'primaire', enCours = false, children, className = '', ...reste }) {
  const styles = {
    primaire: 'bg-marque-600 text-white hover:bg-marque-700 focus:ring-marque-500/40',
    secondaire: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus:ring-slate-300/60',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500/40',
    discret: 'text-marque-700 hover:bg-marque-50 focus:ring-marque-500/30',
  };
  return (
    <button
      {...reste}
      disabled={enCours || reste.disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${styles[variante]} ${className}`}
    >
      {enCours && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function BadgeRole({ role }) {
  const styles = {
    PATIENT: 'bg-sky-100 text-sky-800',
    MEDECIN: 'bg-emerald-100 text-emerald-800',
    ADMIN: 'bg-violet-100 text-violet-800',
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[role] || ''}`}>{ROLES[role] || role}</span>;
}

export function Page({ titre, sousTitre, children, action }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{titre}</h1>
          {sousTitre && <p className="mt-1 text-slate-600">{sousTitre}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-6">{children}</div>
    </div>
  );
}
