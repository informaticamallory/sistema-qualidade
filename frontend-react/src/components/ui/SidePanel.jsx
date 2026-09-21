/* Painel lateral das listagens — o "Panorama" que aparece ao clicar numa
   linha da tabela.

   Saiu de dentro da Inspeção de Injeção. O miolo muda de tela para tela e vem
   como `children`; o que se repete é a moldura: vazio, carregando, cabeçalho
   com título e botão de fechar, título e subtítulo do item escolhido.

   As classes `.piece-panorama*` continuam no CSS da Injeção, que a Montagem
   também usa. O Vite junta tudo num arquivo só, então elas já valem para o
   sistema inteiro; mover as regras exigiria acertar as três telas de uma vez.

   props:
     titulo      nome do painel, no vazio e no cabeçalho
     textoVazio  o que dizer quando nada foi escolhido
     iconeVazio  ícone do estado vazio
     item        o registro escolhido; null mostra o vazio
     carregando  mostra o rodopio no lugar do conteúdo
     nome        título do item escolhido
     subtitulo   linha fina abaixo do nome
     onFechar    () => void */

export default function SidePanel({
    titulo,
    textoVazio,
    iconeVazio = 'fa-chart-column',
    item,
    carregando = false,
    nome,
    subtitulo,
    onFechar,
    children
}) {
    return (
        <aside className="piece-panorama" aria-live="polite">
            {!item ? (
                <div className="piece-panorama-empty">
                    <i className={`fas ${iconeVazio}`}></i>
                    <h3>{titulo}</h3>
                    <p>{textoVazio}</p>
                </div>
            ) : carregando ? (
                <div className="piece-panorama-empty">
                    <i className="fas fa-spinner fa-spin"></i>
                    <p>Carregando {titulo.toLowerCase()}...</p>
                </div>
            ) : (
                <>
                    <div className="piece-panorama-header">
                        <span>{titulo}</span>
                        <button type="button" onClick={onFechar} aria-label={`Fechar ${titulo.toLowerCase()}`}>
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                    <h3>{nome}</h3>
                    {subtitulo && <p className="piece-panorama-code">{subtitulo}</p>}
                    {children}
                </>
            )}
        </aside>
    );
}
