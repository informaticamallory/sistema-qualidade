import { logoMallory } from './recursos';

/* Logotipo MALLORY.

   O arquivo oficial tem fundo laranja chapado (ver recursos.js), então ele
   não é uma imagem solta: é uma PLACA. Quem usa este componente ganha a
   placa inteira, e o CSS trata disso — a faixa inclinada do topo usa o
   mesmo laranja do arquivo para a emenda sumir.

   Sem o arquivo, o componente cai no wordmark composto com a Sora. Esse
   caminho continua aqui de propósito: é o que mantém a tela montável se o
   arquivo for trocado, removido ou falhar ao carregar.

   props:
     tom       'claro' (sobre o painel escuro) | 'laranja' (rodapé do cartão)
     tamanho   'g' | 'm' | 'p'
     titulo    texto alternativo */
export default function MarcaMallory({ tom = 'claro', tamanho = 'm', titulo = 'Mallory' }) {
    if (logoMallory) {
        return (
            <img
                className={`marca-mallory marca-oficial marca-${tamanho}`}
                src={logoMallory}
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
