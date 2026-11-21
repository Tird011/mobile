import type { Catalog } from './types';

/** Human-readable names from the catalog, with a fallback for ids. */
export function ingredientName(catalog: Catalog | null, id: string): string {
  const i = catalog?.ingredients.find((x) => x.id === id);
  return i ? i.name : id.replace(/_/g, ' ');
}
export function dishName(catalog: Catalog | null, id: string): string {
  return catalog?.menu.find((d) => d.id === id)?.name ?? id.replace(/_/g, ' ');
}
