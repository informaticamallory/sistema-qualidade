/* Elementos gráficos do painel esquerdo, desenhados em SVG.

   Em vez de recortar a imagem de referência, as formas são vetor: acompanham
   qualquer proporção de tela, não pesam no carregamento e podem ter a cor
   trocada por token. Todos são decorativos — `aria-hidden`, fora da ordem de
   leitura, porque não carregam informação que o texto já não dê. */

/* Curvas laranja das extremidades. O preserveAspectRatio="none" deixa as
   formas esticarem com o painel; são curvas largas, então a distorção não
   aparece. */
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
                <linearGradient id="curvaQuente" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ff8a00" />
                    <stop offset="100%" stopColor="#ff6600" />
                </linearGradient>
                <linearGradient id="curvaFria" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0%" stopColor="#ff6600" />
                    <stop offset="100%" stopColor="#ff8a00" />
                </linearGradient>
            </defs>

            {/* Faixa inclinada atrás do logotipo */}
            <path
                d="M0 0 H30 L23.5 13 H0 Z"
                fill="url(#curvaQuente)"
            />
            {/* Lâmina da borda esquerda, descendo */}
            <path
                d="M0 2 H7.5 C13 22 10 50 2.5 70 C1.4 73 0 77 0 81 Z"
                fill="url(#curvaFria)"
                opacity="0.92"
            />
            {/* Onda rasa da base. A crista mais alta fica em y≈95, abaixo da
                linha onde os pilares terminam — senão o ícone laranja do
                pilar cai sobre o laranja da onda e some. */}
            <path
                d="M0 97.4 C20 94.6 45 99.4 70 96.4 C84 94.7 93 96.4 100 98 V100 H0 Z"
                fill="url(#curvaQuente)"
                opacity="0.94"
            />
        </svg>
    );
}

/* Curva que separa o painel esquerdo do formulário. Fica na borda direita da
   vitrine e avança sobre o fundo claro, como na referência. Só aparece a
   partir do desktop, onde existem as duas colunas. */
export function CurvaDivisoria() {
    return (
        <svg
            className="login-divisoria"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <linearGradient id="curvaBorda" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff8a00" />
                    <stop offset="55%" stopColor="#ff6600" />
                    <stop offset="100%" stopColor="#ff8a00" />
                </linearGradient>
            </defs>
            <path
                d="M0 0 H100 V100 H0 C46 76 62 44 36 0 Z"
                fill="url(#curvaBorda)"
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
