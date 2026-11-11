import { logoMallory } from './recursos';

/* Logotipo MALLORY.

   Enquanto o arquivo oficial não está no projeto, compõe o wordmark com a
   Sora — a fonte de título que o sistema já carrega — em vez de inventar um
   desenho novo. Assim que `recursos.js` apontar para o SVG de verdade, este
   componente passa a servir a imagem e nenhuma tela precisa mudar.

   props:
     tom       'claro' (branco, sobre o painel escuro) | 'laranja' (rodapé)
     tamanho   'g' | 'm' | 'p'
     titulo    texto alternativo; vazio quando a marca é decorativa e o nome
               já está escrito ao lado */
export default function MarcaMallory({ tom = 'claro', tamanho = 'm', titulo = 'Mallory' }) {
    const classe = `marca-mallory marca-${tom} marca-${tamanho}`;

    if (logoMallory) {
        return <img className={classe} src={logoMallory} alt={titulo} />;
    }

    return (
        <span className={classe} role="img" aria-label={titulo || undefined}>
            MALLORY
        </span>
    );
}
