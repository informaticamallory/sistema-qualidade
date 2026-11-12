import { logoMallory, logoMalloryLaranja } from './recursos';

/* Logotipo MALLORY.

   Duas versões do mesmo arquivo oficial, escolhidas pelo fundo em que a
   marca vai cair:

     'laranja'  letras laranja, fundo transparente — para o branco do
                cartão. É a que a tela usa hoje.
     'claro'    letras brancas sobre a placa laranja do arquivo original —
                para quando a marca for cair sobre um fundo escuro.

   A versão transparente existe porque a placa, sobre o cartão branco, lia
   como recorte colado. Ver a nota em recursos.js.

   Sem os arquivos, o componente cai no wordmark composto com a Sora. Esse
   caminho continua aqui de propósito: é o que mantém a tela montável se um
   arquivo for trocado, removido ou falhar ao carregar.

   props:
     tom       'laranja' (sobre fundo claro) | 'claro' (sobre fundo escuro)
     tamanho   'g' | 'm' | 'p'
     titulo    texto alternativo */
export default function MarcaMallory({ tom = 'laranja', tamanho = 'm', titulo = 'Mallory' }) {
    const arquivo = tom === 'claro' ? logoMallory : logoMalloryLaranja;

    if (arquivo) {
        return (
            <img
                className={`marca-mallory marca-oficial marca-${tom} marca-${tamanho}`}
                src={arquivo}
                alt={titulo}
                width="205"
                height="41"
            />
        );
    }

    return (
        <span className={`marca-mallory marca-texto marca-${tom} marca-${tamanho}`} role="img" aria-label={titulo || undefined}>
            MALLORY
        </span>
    );
}
