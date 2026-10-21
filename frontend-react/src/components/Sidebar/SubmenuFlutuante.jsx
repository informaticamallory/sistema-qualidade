import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';

/* Painel que abre ao lado do ícone quando a sidebar está recolhida.

   Vai em portal para o body porque a `.sidebar` tem `overflow: hidden` — no
   fluxo, o painel seria cortado na primeira coluna de ícones. Preso à tela
   com `position: fixed`, ele fica por cima do conteúdo sem empurrar nada.

   props:
     item          o grupo { key, label, icon, children }
     ancora        { top, right } do botão que abriu, em coordenadas de tela
     focarPrimeiro abre pelo teclado: o foco vai para o primeiro subitem
     isActive      (path) => boolean
     onEntrar      mouse entrou no painel — cancela o fechamento agendado
     onSair        mouse saiu — agenda o fechamento
     onNavegar     clique num subitem */

const MARGEM = 12;          // respiro mínimo das bordas da tela
const AFASTAMENTO = 10;     // distância entre o ícone e o painel

export default function SubmenuFlutuante({
    item,
    ancora,
    focarPrimeiro = false,
    isActive,
    onEntrar,
    onSair,
    onNavegar
}) {
    const painelRef = useRef(null);
    const primeiroItemRef = useRef(null);

    /* Posiciona antes da pintura, já com a altura real medida: o painel nasce
       alinhado ao ícone e sobe quando encostaria no rodapé da tela. É o que
       mantém os últimos grupos do menu acessíveis.

       Escreve direto no style em vez de guardar em estado — um setState aqui
       provocaria uma segunda renderização a cada abertura, e o valor nunca é
       lido de volta pelo React. */
    useLayoutEffect(() => {
        const painel = painelRef.current;
        if (!painel || !ancora) return;

        const altura = painel.offsetHeight;
        const limite = window.innerHeight - MARGEM - altura;
        const topo = Math.max(MARGEM, Math.min(ancora.top, limite));

        painel.style.top = `${topo}px`;
        painel.style.left = `${ancora.right + AFASTAMENTO}px`;
        painel.style.visibility = 'visible';
    }, [ancora]);

    useEffect(() => {
        if (focarPrimeiro) primeiroItemRef.current?.focus();
    }, [focarPrimeiro]);

    if (typeof document === 'undefined' || !ancora) return null;

    return createPortal(
        <div
            ref={painelRef}
            className="sidebar-flyout"
            role="group"
            aria-label={item.label}
            /* Invisível até o useLayoutEffect posicionar: sem isto o painel
               pisca no lugar errado antes de subir. */
            style={{ visibility: 'hidden', top: 0, left: 0 }}
            onMouseEnter={onEntrar}
            onMouseLeave={onSair}
        >
            <p className="sidebar-flyout-titulo">
                <i className={`fas ${item.icon}`} aria-hidden="true"></i>
                <span>{item.label}</span>
            </p>

            <div className="sidebar-flyout-itens">
                {item.children.map((child, indice) => (
                    <Link
                        key={child.path}
                        ref={indice === 0 ? primeiroItemRef : undefined}
                        to={child.path}
                        className={`sidebar-flyout-item ${isActive(child.path) ? 'active' : ''}`}
                        aria-current={isActive(child.path) ? 'page' : undefined}
                        onClick={onNavegar}
                    >
                        <i className={`fas ${child.icon}`} aria-hidden="true"></i>
                        <span>{child.label}</span>
                    </Link>
                ))}
            </div>
        </div>,
        document.body
    );
}
