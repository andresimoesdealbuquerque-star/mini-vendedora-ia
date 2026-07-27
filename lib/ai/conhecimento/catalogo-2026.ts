/**
 * Catálogo 2026 da Mini Marcenaria — estruturado a partir do PDF oficial.
 * Injetado no system prompt da Mila (via buildSystemPromptComConhecimento)
 * pra ela conhecer todas as categorias, tamanhos padrão e adicionais
 * disponíveis SEM depender de vision no PDF.
 *
 * Tamanhos: P/M/G/GG (ou A/B/C/D/E/F/G/H pra modelos com variações visuais).
 * "FAZEMOS SOB MEDIDA" = sempre; medidas listadas são só REFERÊNCIA visual.
 * ADICIONE = o que pode acrescentar no orçamento daquele móvel.
 */

export const CATALOGO_2026 = `
# CATÁLOGO 2026 DA MINI — DECORE ISSO

Você conhece cada peça deste catálogo de cor. Quando o cliente pedir um móvel, sabe imediatamente: os tamanhos padrão, os modelos disponíveis (A/B/C/D…), e o que pode adicionar. Se pedirem foto/modelo, ofereça mandar do WhatsApp — o catálogo em PDF está no link da bio da Mini.

TODAS as categorias abaixo são **feitas sob medida** — os tamanhos listados são a referência padrão do PDF; se o cliente quiser diferente, é sob medida (e a Formini calcula igual).

## MESAS / ESCRIVANINHAS (modelos A–H)
Tamanhos padrão (compr × prof × alt):
- P: 75×45×75
- M: 100×45×75
- G: 130×45×75
- GG: 150×45×75

## MESAS EM L (modelos A, B)
- P: 130×130×75 (prof 45)
- M: 150×150×75 (prof 50)
- G: 170×170×75 (prof 50)
Adicione: chaves, puxador, moldura

## MESAS DUPLAS (modelos A, B)
- P: 170×50×75
- M: 180×50×75
- G: 190×50×75
- GG: 200×50×75
Adicione: porta, chaves, puxador

## MESAS C/ BAÚS (modelos A, B)
- Mesa 100×45×60 + baús 45×40×50
- Mesa 150×45×60 + baús 45×40×50
Adicione: moldura, gaveta

## MESAS DE REUNIÃO (modelo B)
- P: 160×80×75
- M: 180×90×75
- G: 180×100×75

## BALCÕES (modelos A, B, C, D)
- A/B: 120×50×115
- C/D: 80×40×100
Adicione: chaves, puxador, moldura, gaveta, porta, rodízios

## GAVETEIROS SOLTOS (modelos A, B)
- 40×40×70 (ambos)
Adicione: chaves, puxador, moldura, gaveta

## ESTANTE + MESA (combo, modelo A)
- Mesa 150×72×75 + estante 75×30×200
Adicione: portas, chaves, puxador

## ESTANTES (modelos A, B, C, D)
- A: 50×35×160
- B: 50×35×180
- C: 80×35×180
- D: 80×35×180
Adicione: pés palito, base de madeira, rodízios, porta, chaves

## ESTANTES GRANDES (modelos A–F)
- A: 80×35×180
- B: 100×35×160
- C/D: 100×35×180 / 100×35×160
- E/F: 100×35×180
Adicione: base de madeira, rodízios, porta

## ESTANTES BAIXAS (modelos A–D)
- A: 90×35×100
- B: 100×35×100
- C: 100×35×100
- D: 150×35×90
Adicione: base de madeira, rodízios, porta

## NICHOS (modelos A–F) — NÃO instalamos na parede
- A: 30×30×30
- B: 60×30×30
- C: 60×30×60
- D/E: 130×30×35
- F: 130×30×65
Adicione: porta, chaves, puxador

## COMBOS DA MINI (kits com mais de um móvel, modelos A–F)
- A: Mesa 130×45×80 + estante 50×35×160 + nichos 60×30×30
- B: Mesa 150×45×75 + estante 50×35×160 + nichos 60×30×30
- C: Mesa 130×45×80 + estante 50×35×160
- D: Mesa 150×45×75 + estante 50×35×160
- E: Mesa 130×45×80 + estante 50×35×160 + nichos 60×30×30
- F: 2 mesas 100×45×75 + gaveteiro 50×45×75 + carrinho 40×30×65
Adicione: base de madeira, rodízios, porta, chaves

## ARMÁRIO ESTANTE (modelos A, B)
- A: 100×35×160
- B: 100×35×180
Adicione: rodízios, porta, chaves, puxador, moldura

## SAPATEIRAS (modelos A–I)
- A: 75×35×48 · B: 104×35×48 · C: 50×40×95 · D: 80×40×95
- E: 50×40×180 · F: 80×40×180 · G: 70×35×48
- H: 70×30×125 · I: 150×30×125
Adicione: rodízios, base de madeira, chaves, puxador, moldura

## BAÚS (modelos A–D)
- A/B: 50×50×50
- C: 88×40×45
- D: 138×40×45
Adicione: base de madeira, rodízios, puxador, moldura

## MESAS DE CABECEIRA (modelos A–F)
- P: 40×40×50
- M: 50×40×50
- G: 60×40×60
- GG: 70×40×60
Adicione: pés palito, base de madeira, rodízios, puxador, chaves, moldura

## CÔMODAS (modelos A–F)
- A/C: 80×50×90
- B: 80×50×100
- D: 100×50×100
- E/F: 150×50×90
Adicione: base de madeira, rodízios, puxador, chaves, moldura

## ROUPEIRO 2 PORTAS (modelos A–F)
- P: 70×50×190 · M: 80×50×190 · G: 90×50×190
Adicione: base de madeira, rodízios, puxador, chaves, moldura

## ROUPEIRO 3 PORTAS (modelos A–F)
- P: 105×50×190 · M: 120×50×190 · G: 135×50×190
Adicione: base de madeira, rodízios, puxador, chaves, moldura

## ROUPEIRO 4 PORTAS (modelos A–F)
- P: 140×50×190 · M: 160×50×190 · G: 180×50×190
Adicione: base de madeira, rodízios, puxador, chaves, moldura

## ARMÁRIOS MULTIUSO (modelos A, B — 2 famílias de largura)
Família A (mais larga):
- P: 70×40×160 · M: 80×40×180 · G: 80×40×190 · GG: 80×40×200
Família B (estreita):
- P: 40×40×160 · M: 40×40×180 · G: 50×40×190 · GG: 50×40×200

## BUFFET ATÉ 2 PORTAS (modelos A–D)
- A/B: 80×40×85
- C: 100×40×85
- D: 130×50×90
Adicione: rodízios, puxador, moldura, chaves

## BUFFET 3 PORTAS (modelos A–D)
- A/B/C: 130×40×85
- D: 160×40×85
Adicione: rodízios, puxador, moldura, chaves, gaveta

## BUFFET 4 PORTAS (modelos A–D)
- A/B/C: 160×40×85
- D: 180×40×85
Adicione: rodízios, puxador, moldura, chaves, gaveta

## APARADOR (modelos A, B)
- P: 100×40×85 · M: 130×40×85 · G: 160×40×85
Adicione: prateleira, gaveta

## RACKS (modelos A–H)
- P: 130×40×60 · M: 160×40×60 · G: 180×40×60 · GG: 200×40×60
Adicione: rodízios, puxador, chaves, gaveta

## MESAS DE JANTAR (modelos A, B)
Modelo A (quadrada):
- P: 90×90×75 · M: 100×100×75 · G: 130×130×75
Modelo B (retangular):
- P: 130×90×75 · M: 160×90×75 · G: 200×90×75

## CARRINHOS DE CAFÉ / BAR (modelos A, B)
- P: 60×45×85 · M: 80×45×85 · G: 100×45×85
Adicione: base de madeira, puxador, chaves, moldura

## ARMÁRIOS P/ GELÁGUA (modelos A, B)
- 40×45×180 (ambos)
Adicione: rodízios, base de madeira, puxador, chaves, moldura

## ARMÁRIOS VERTICAIS (modelos A–D)
- P: 60×45×180 · M: 70×45×180 · G: 80×45×180
Adicione: rodízios, puxador, moldura, chaves, gaveta

## ARMÁRIOS SUSPENSOS (modelos A–F) — NÃO instalamos na parede
- A/B/C/D: 130×35×70
- E/F: 160×35×70
Adicione: puxador, chaves, moldura

## ÁREA DE SERVIÇO (modelos A–D)
- A: 80×40×180
- B: 50×40×180
- C/D: 75×40×180
Adicione: rodízios, puxador, moldura, chaves

## WC (armário de banheiro, modelos A–D)
- 70×35×40 (todos)
Adicione: puxador, moldura, chaves, gaveta

---

## CORES DO CATÁLOGO (13 no total)
- **Sólidos (8):** Verde Relva, Azul Índigo, Titânio, Gianduia, Cinza Cronos, Cinza Lunar, Branco Textura, Preto Textura
- **Madeirados (3):** Freijó, Legno, Nogueira Veneto
- **Lacas (3):** Laca Branca, Laca Cinza, Laca Bege *(laca é ~40% mais cara que sólido/madeirado)*

## LIMITAÇÕES REAIS (não iludir cliente)
- Não instalamos móveis suspensos na parede — nichos e armários suspensos vão prontos, mas cliente providencia instalação.
- Não fazemos móvel embutido / marcenaria fixa — só móvel solto.
- Só o que está nesse catálogo (+ o que dá pra derivar em variação de tamanho/cor). Se pedirem categoria fora (cama, sofá, cozinha planejada), diga que não trabalhamos e ofereça alternativa próxima (pediu cama → cabeceira; pediu planejado → roupeiro solto).
`.trim();
