import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './ui.css';

/* Confirmação de saída com alterações pendentes.

   O diálogo existia repetido no JSX da Injeção e da Montagem, com o CSS
   duplicado nos dois arquivos de página. Virou componente para as telas novas
   não dependerem de o estilo de outra página estar no pacote — foi essa
   dependência invisível que deixou os botões de ação cinzas no Cadastro.

   props:
     aberto     controla a exibição
     onCancelar volta para o formulário
     onSair     descarta e fecha
     titulo / mensagem  textos, com o padrão do sistema */
export default function ConfirmarSaida({
    aberto,
    onCancelar,
    onSair,
    titulo = 'Alterações não salvas',
    mensagem = 'Você tem alterações que ainda não foram salvas. Deseja realmente sair sem salvar?'
}) {
    const cancelarRef = useRef(null);

    /* O foco vai para Cancelar, não para "Sair sem salvar": num alertdialog o
       foco inicial deve cair na opção segura, para Enter apressado não
       descartar o preenchimento. */
    useEffect(() => {
        if (aberto) cancelarRef.current?.focus();
    }, [aberto]);

    useEffect(() => {
        if (!aberto) return;
        const aoTeclar = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); onCancelar?.(); }
        };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, [aberto, onCancelar]);

    if (!aberto || typeof document === 'undefined') return null;

    return createPortal(
        <div className="unsaved-confirm-overlay" onClick={onCancelar}>
            <div className="unsaved-confirm-dialog" role="alertdialog" aria-modal="true"
                aria-labelledby="unsaved-confirm-title"
                onClick={(e) => e.stopPropagation()}>
                <div className="unsaved-confirm-icon">
                    <i className="fas fa-exclamation-triangle" aria-hidden="true"></i>
                </div>
                <div className="unsaved-confirm-copy">
                    <h2 id="unsaved-confirm-title">{titulo}</h2>
                    <p>{mensagem}</p>
                </div>
                <div className="unsaved-confirm-actions">
                    <button ref={cancelarRef} type="button" className="btn-confirm-cancel"
                        onClick={onCancelar}>
                        Cancelar
                    </button>
                    <button type="button" className="btn-confirm-leave" onClick={onSair}>
                        Sair sem salvar
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
