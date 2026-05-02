/** Branding constants — overridable via VITE_ environment variables. */

export const BRAND_NAME = import.meta.env.VITE_BRAND_NAME || 'IgaraLead';
export const BRAND_URL = import.meta.env.VITE_BRAND_URL || 'https://igaralead.com.br';
export const CONTROL_PLANE_NAME =
  import.meta.env.VITE_CONTROL_PLANE_NAME || import.meta.env.VITE_HUB_NAME || 'Painel central';
/** @deprecated use CONTROL_PLANE_NAME */
export const HUB_NAME = CONTROL_PLANE_NAME;
export const NEXUS_NAME = import.meta.env.VITE_NEXUS_NAME || 'Nexus';
export const ENTITY_NAME = import.meta.env.VITE_ENTITY_NAME || 'Entity';
export const AMPLEX_NAME = import.meta.env.VITE_AMPLEX_NAME || 'Amplex';
