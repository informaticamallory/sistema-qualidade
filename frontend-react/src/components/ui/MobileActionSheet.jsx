import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/* Folha de ações do celular.

   Nas listagens, a coluna de ações some abaixo de 1024px — os ícones ficam
   pequenos demais para o dedo. No lugar dela, tocar na linha abre este painel
   vindo de baixo, com os mesmos botões em tamanho de toque.

   O padrão já existia copiado em seis telas (Injeção, Montagem, Cartões,
   Fichas, Calibração e Usuários). Este componente é a primeira versão
   compartilhada; as seis anteriores continuam com a cópia delas, e migrá-las
   é tarefa própria.

   Não traz CSS: as classes `.mobile-action-sheet*` já estão declaradas sem
   escopo naquelas telas e, como o Vite junta todo o CSS num arquivo só,
   valem para o sistema inteiro. Declarar mais uma cópia aqui só mudaria qual
   das variantes existentes vence pela ordem do bundle. */

/**
 * @param {object|null} item      Registro selecionado. `null` mantém fechado.
 * @param {string}      titulo    Identificador mostrado no topo.
 * @param {() => void}  onFechar  Fecha a folha.
 * @param {Array}       acoes     `{ id, rotulo, icone, className, onClick }`.
 *                                `onClick` recebe o item; fechar é automático.
 */
export default function MobileActionSheet({ item, titulo, onFechar, acoes = [] }) {
    /* Esc fecha, como nas telas de referência. O listener só existe enquanto
       a folha está aberta. */
    useEffect(() => {
        if (!item) return;
        const aoTeclar = (evento) => {
            if (evento.key === 'Escape') onFechar();
        };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, [item, onFechar]);

    /* Durante os 0,28s da animação de saída o título troca para o rótulo
       genérico, porque `item` já é nulo. É o mesmo comportamento das seis
       telas que já usavam este padrão; guardar o último título exigiria ref
       lida na renderização ou setState em efeito, e o lint deste projeto
       recusa as duas. Não compensa a complexidade por um piscar de fração
       de segundo. */
    if (typeof document === 'undefined') return null;

    /* O elemento fica sempre montado, aberto ou não: a entrada é uma
       transição de `transform`, que precisa de um estado anterior para
       animar. Sem `.open` ele não recebe eventos (`pointer-events: none`). */
    return createPortal(
        <div className={`mobile-action-sheet ${item ? 'open' : ''}`}>
            <div className="mobile-action-sheet-backdrop" onClick={onFechar} />
            <div className="mobile-action-sheet-panel" role="dialog" aria-modal="true"
                aria-label={titulo || 'Ações do registro'}>
                <div className="mobile-action-sheet-handle" />
                <p className="mobile-action-sheet-title">
                    {titulo || 'Registro selecionado'}
                </p>
                {item && (
                    <div className="mobile-action-sheet-buttons">
                        {acoes.map((acao) => (
                            <button key={acao.id} type="button"
                                className={`btn ${acao.className || ''}`.trim()}
                                onClick={() => {
                                    /* Fecha antes de agir: a ação costuma abrir
                                       um modal, e a folha ficaria por cima. */
                                    onFechar();
                                    acao.onClick(item);
                                }}>
                                <i className={`fas ${acao.icone}`} aria-hidden="true"></i>
                                <span>{acao.rotulo}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
