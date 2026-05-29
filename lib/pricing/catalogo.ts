/**
 * Catálogo da Mini Marcenaria — METADADOS apenas (modelos, cores,
 * adicionais e puxadores possíveis). Os PREÇOS vivem no MINIDECK; a Mila
 * chama o endpoint `https://minideck.arcomini.com.br/api/calcular-orcamento`
 * pra obter o valor calculado.
 */

export type CategoriaCor =
  | "branco" | "preto" | "madeirado" | "cinza"
  | "kashimir" | "azul" | "verde" | "laca";

export type TipoCor = "Sólidos" | "Madeiras" | "Lacas";

export interface Cor {
  nome: string;
  tipo: TipoCor;
  categoria: CategoriaCor;
}

export const CORES: Cor[] = [
  { nome: "Branco Textura", tipo: "Sólidos", categoria: "branco" },
  { nome: "Preto Textura", tipo: "Sólidos", categoria: "preto" },
  { nome: "Cinza Lunar", tipo: "Sólidos", categoria: "cinza" },
  { nome: "Cinza Cronos", tipo: "Sólidos", categoria: "cinza" },
  { nome: "Titânio", tipo: "Sólidos", categoria: "cinza" },
  { nome: "Gianduia", tipo: "Sólidos", categoria: "kashimir" },
  { nome: "Azul Índigo", tipo: "Sólidos", categoria: "azul" },
  { nome: "Verde Relva", tipo: "Sólidos", categoria: "verde" },
  { nome: "Legno", tipo: "Madeiras", categoria: "madeirado" },
  { nome: "Nogueira Veneto", tipo: "Madeiras", categoria: "madeirado" },
  { nome: "Freijó", tipo: "Madeiras", categoria: "madeirado" },
  { nome: "Laca Branca", tipo: "Lacas", categoria: "laca" },
  { nome: "Laca Cinza", tipo: "Lacas", categoria: "laca" },
  { nome: "Laca Bege", tipo: "Lacas", categoria: "laca" },
];

export const CATEGORIAS_MODELO: Record<string, string[]> = {
  Mesas: [
    "Mesa Home Office 2 gavetas", "Mesa Home Office 1 gaveta", "Mesa Home Office nicho",
    "Mesa gaveta e porta", "Mesa bela", "Mesa sem gavetas", "Mesa em L",
    "Mesa de reunião", "Mesa quadrada", "Mesa dupla com nicho central", "Mesa industrial",
  ],
  "Racks e Buffets": [
    "Rack 2 portas", "Rack 3 portas", "Rack 4 portas",
    "Rack 2 portas com gavetas", "Rack 3 portas com gavetas", "Rack 4 portas com gavetas",
    "Rack 2 portas e nicho no meio", "Rack Thalita",
    "Buffet 3 portas", "Buffet 4 portas", "Buffet 5 portas",
    "Buffet 3 portas com gavetas", "Buffet 4 portas com gavetas", "Buffet 5 portas com gavetas",
    "Aparador",
  ],
  "Armários e Guarda-roupas": [
    "Armário baixo", "Armário estante", "Armário copa", "Armário multiuso",
    "Armário área de serviço", "Armário com nicho central",
    "Guarda roupa básico", "Guarda roupa com 3 gavetas", "Guarda roupa com 2 gavetas",
    "Guarda roupa 7 espaços", "Guarda roupa industrial", "Maleiro",
  ],
  "Estantes e Nichos": [
    "Estante vertical", "Estante vertical dupla", "Estante desencontrada",
    "Estante 7 espaços", "Estante horizontal", "Estante industrial",
    "Nicho simples", "Nicho duplo",
  ],
  "Cômodas e Gaveteiros": [
    "Cômoda 4 gavetas", "Cômoda 5 gavetas", "Cômoda 4 gavetas nicho", "Gaveteiro",
  ],
  "Mesas de Cabeceira": [
    "Mesa cabeceira prateleira", "Mesa de cabeceira 1 gaveta",
    "Mesa de cabeceira 2 gavetas", "Mesa de cabeceira 3 gavetas", "Cabeceira industrial",
  ],
  Sapateiras: ["Sapateira vertical", "Sapateira 4 pares", "Sapateira 6 pares"],
  Carrinhos: ["Carrinho de café", "Carrinho de café com gaveta", "Carrinho industrial"],
  Outros: [
    "Baú com tampa", "Baú sem tampa", "Suporte ventilador", "Móvel gelágua",
    "Balcão de atendimento", "Gôndola de loja",
  ],
};

export const MODELOS: string[] = Object.values(CATEGORIAS_MODELO).flat();

export const PUXADOR_TIPOS = ["Fecho e toque", "Cava", "Alça", "Concha", "Ponto", "Passante"] as const;
export type PuxadorTipo = typeof PUXADOR_TIPOS[number];

export const PUXADOR_CORES = ["Preto", "Prata Cromado", "Prata Fosco", "Bronze", "Dourado"] as const;
export type PuxadorCor = typeof PUXADOR_CORES[number];

export const ADICIONAIS_BOOLEAN = [
  { key: "rodinhas", label: "Rodinhas" },
  { key: "pePalito", label: "Pé palito" },
  { key: "baseMadeira", label: "Base madeira" },
  { key: "baseMetalon", label: "Base metalon" },
  { key: "moldura", label: "Moldura" },
  { key: "espessura25mm", label: "Espessura 25 mm" },
] as const;
export type AdicionalBooleanKey = typeof ADICIONAIS_BOOLEAN[number]["key"];

export const ADICIONAIS_QUANTIDADE = [
  { key: "gavetaBranco", label: "Gaveta branco" },
  { key: "gavetaCor", label: "Gaveta cor" },
  { key: "chaves", label: "Chaves" },
  { key: "prateleiraBranco", label: "Prateleira adicional branco" },
  { key: "prateleiraCor", label: "Prateleira adicional cor" },
] as const;
export type AdicionalQtdKey = typeof ADICIONAIS_QUANTIDADE[number]["key"];
