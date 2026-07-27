/**
 * Mapa slug → URL pública da página do Catálogo 2026.
 *
 * As imagens estão no bucket público `catalogo-2026` do Supabase (rendered
 * a partir do PDF oficial, 1191×1685px, ~150–250KB cada).
 *
 * Slugs são as chaves que a Mila usa na tool `mostrar_catalogo`.
 */

const SUPABASE_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const BUCKET = "catalogo-2026";

function urlDaPagina(slug: string): string {
  return `${SUPABASE_BASE}/storage/v1/object/public/${BUCKET}/${slug}.jpg`;
}

/**
 * Slugs válidos + rótulo humano (usado nas legendas do WhatsApp).
 * Ordem = ordem no catálogo.
 */
export const PAGINAS_CATALOGO: Record<string, { rotulo: string; pagina: number }> = {
  "cores": { rotulo: "Cores disponíveis", pagina: 2 },
  "mesas": { rotulo: "Mesas / Escrivaninhas", pagina: 3 },
  "mesa-em-l": { rotulo: "Mesas em L", pagina: 4 },
  "mesa-dupla": { rotulo: "Mesas duplas", pagina: 5 },
  "mesa-com-baus": { rotulo: "Mesas com baús", pagina: 6 },
  "mesa-reuniao": { rotulo: "Mesas de reunião", pagina: 7 },
  "balcao": { rotulo: "Balcões", pagina: 8 },
  "gaveteiro": { rotulo: "Gaveteiros soltos", pagina: 9 },
  "estante-com-mesa": { rotulo: "Estante + mesa (combo)", pagina: 10 },
  "estante-basica": { rotulo: "Estantes (linha básica)", pagina: 11 },
  "estante-grande": { rotulo: "Estantes grandes", pagina: 12 },
  "estante-baixa": { rotulo: "Estantes baixas", pagina: 13 },
  "nichos": { rotulo: "Nichos", pagina: 14 },
  "combos": { rotulo: "Combos da Mini", pagina: 15 },
  "armario-estante": { rotulo: "Armário estante", pagina: 16 },
  "sapateira": { rotulo: "Sapateiras", pagina: 17 },
  "baus": { rotulo: "Baús", pagina: 18 },
  "cabeceira": { rotulo: "Mesas de cabeceira", pagina: 19 },
  "comoda": { rotulo: "Cômodas", pagina: 20 },
  "roupeiro-2-portas": { rotulo: "Roupeiro 2 portas", pagina: 21 },
  "roupeiro-3-portas": { rotulo: "Roupeiro 3 portas", pagina: 22 },
  "roupeiro-4-portas": { rotulo: "Roupeiro 4 portas", pagina: 23 },
  "armario-multiuso": { rotulo: "Armários multiuso", pagina: 24 },
  "buffet-2-portas": { rotulo: "Buffet até 2 portas", pagina: 25 },
  "buffet-3-portas": { rotulo: "Buffet 3 portas", pagina: 26 },
  "buffet-4-portas": { rotulo: "Buffet 4 portas", pagina: 27 },
  "aparador": { rotulo: "Aparadores", pagina: 28 },
  "rack": { rotulo: "Racks", pagina: 29 },
  "mesa-jantar": { rotulo: "Mesas de jantar", pagina: 30 },
  "carrinho-cafe": { rotulo: "Carrinhos de café / bar", pagina: 31 },
  "armario-gelagua": { rotulo: "Armários para gelágua", pagina: 32 },
  "armario-vertical": { rotulo: "Armários verticais", pagina: 33 },
  "armario-suspenso": { rotulo: "Armários suspensos", pagina: 34 },
  "area-servico": { rotulo: "Área de serviço", pagina: 35 },
  "wc": { rotulo: "Armários de WC (banheiro)", pagina: 36 },
};

export type SlugCatalogo = keyof typeof PAGINAS_CATALOGO;

export function urlCatalogo(slug: string): string | null {
  if (!(slug in PAGINAS_CATALOGO)) return null;
  return urlDaPagina(slug);
}

export function rotuloCatalogo(slug: string): string | null {
  return PAGINAS_CATALOGO[slug]?.rotulo ?? null;
}

export const SLUGS_DISPONIVEIS = Object.keys(PAGINAS_CATALOGO);
