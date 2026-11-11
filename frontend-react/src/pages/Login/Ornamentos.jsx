/* Elementos gráficos do painel esquerdo, desenhados em SVG.

   Em vez de recortar a imagem de referência, as formas são vetor: acompanham
   qualquer proporção de tela, não pesam no carregamento e podem ter a cor
   trocada por token. Todos são decorativos — `aria-hidden`, fora da ordem de
   leitura, porque não carregam informação que o texto já não dê.

   COMO A COMPOSIÇÃO FUNCIONA
   --------------------------
   A primeira versão desenhava faixas laranja sobre um fundo escuro, e nunca
   chegava perto da referência. O modelo certo é o inverso: o painel inteiro
   é laranja, e uma ILHA escura recortada no meio dele é que abre espaço para
   a fotografia e para o texto.

   Por isso a moldura é um caminho só, com `fill-rule="evenodd"`: um retângulo
   que cobre tudo, menos o contorno da ilha. O buraco deixa passar o que está
   atrás — a fotografia e o gradiente escuro da vitrine. */

/* Contorno da ilha escura, em coordenadas de 0 a 100.

   Fica numa constante porque é usado duas vezes: para furar a moldura
   laranja e para desenhar o filete claro que acompanha a borda. Mexer aqui
   muda as duas de uma vez. */
const ILHA = `
    M8 0
    C5 26 4 54 5.5 76
    C6.4 87 11 95.5 25 100
    L67 100
    C75 88 83 72 87 55
    C90 44 94 20 96.5 0
    Z
`;

export function CurvasVitrine() {
    return (
        <svg
            className="login-curvas"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <linearGradient id="molduraLaranja" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ff8a00" />
                    <stop offset="45%" stopColor="#ff6600" />
                    <stop offset="100%" stopColor="#ff8a00" />
                </linearGradient>
                <linearGradient id="fileteClaro" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffb257" />
                    <stop offset="50%" stopColor="#ff8a00" />
                    <stop offset="100%" stopColor="#ffb257" />
                </linearGradient>
            </defs>

            {/* Moldura laranja com a ilha vazada */}
            <path
                fillRule="evenodd"
                d={`M0 0 H100 V100 H0 Z ${ILHA}`}
                fill="url(#molduraLaranja)"
            />

            {/* Filete mais claro acompanhando a borda da ilha, para a moldura
                não ficar chapada. Só traço, sem preenchimento. */}
            <path
                d={ILHA}
                fill="none"
                stroke="url(#fileteClaro)"
                strokeWidth="1.6"
                opacity="0.75"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
}

/* Onda que atravessa a divisa dos dois painéis.

   Na referência a curva laranja não termina na borda da vitrine: ela passa
   por cima do lado branco e emoldura o cartão pela esquerda. Por isso mora
   dentro do painel de acesso e se estende para fora dele, em vez de ser mais
   uma forma do SVG da vitrine — que está recortado pelo overflow. */
export function OndaDivisoria() {
    return (
        <svg
            className="login-onda"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <linearGradient id="ondaLaranja" x1="0" y1="0" x2="0.6" y2="1">
                    <stop offset="0%" stopColor="#ff8a00" />
                    <stop offset="50%" stopColor="#ff6600" />
                    <stop offset="100%" stopColor="#ff8a00" />
                </linearGradient>
                <linearGradient id="ondaAcento" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffb257" />
                    <stop offset="100%" stopColor="#ff8a00" />
                </linearGradient>
            </defs>

            <path
                d="M67.6 0 C58 22 52 44 42 66 C34 82 18 93 6.6 100 L66.6 100
                   C80 84 90 62 93 40 C95 26 94.5 12 93.4 0 Z"
                fill="url(#ondaLaranja)"
            />

            {/* Fio claro na aresta de fora, o mesmo realce da referência */}
            <path
                d="M93.4 0 C94.5 12 95 26 93 40 C90 62 80 84 66.6 100"
                fill="none"
                stroke="url(#ondaAcento)"
                strokeWidth="2"
                opacity="0.85"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
}

/* Selo de qualidade. O recorte serrilhado é feito com tracejado na borda, em
   vez de um polígono de 40 vértices escrito à mão: mesma leitura visual,
   uma linha de CSS, e a espessura acompanha o tamanho. */
export function SeloQualidade() {
    return (
        <svg
            className="login-selo"
            viewBox="0 0 120 142"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <radialGradient id="seloBrilho" cx="50%" cy="42%" r="58%">
                    <stop offset="0%" stopColor="#ffb257" />
                    <stop offset="62%" stopColor="#ff8a00" />
                    <stop offset="100%" stopColor="#ff6600" />
                </radialGradient>
            </defs>

            {/* Fitas, atrás do disco */}
            <path d="M38 92 L38 138 L52 128 L60 140 L60 92 Z" fill="#ff6600" />
            <path d="M82 92 L82 138 L68 128 L60 140 L60 92 Z" fill="#ff8a00" />

            {/* Serrilha: tracejado grosso em volta do disco */}
            <circle
                cx="60" cy="58" r="50"
                fill="none"
                stroke="#ff8a00"
                strokeWidth="12"
                strokeDasharray="5 7"
                strokeLinecap="round"
            />

            {/* Disco */}
            <circle cx="60" cy="58" r="45" fill="url(#seloBrilho)" />
            <circle
                cx="60" cy="58" r="37"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2.5"
                opacity="0.9"
            />

            {/* Check */}
            <path
                d="M42 59 L55 72 L80 44"
                fill="none"
                stroke="#ffffff"
                strokeWidth="9"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
