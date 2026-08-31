import { useState, useCallback } from 'react';
import Sidebar from '../Sidebar/Sidebar';
import ThemeToggle from '../ThemeToggle/ThemeToggle';
import './AppLayout.css';

/* Estrutura de página com barra superior fixa.

   O sistema nunca teve um componente de layout: cada página repete
   `app-container > Sidebar + main-content` por conta própria. Este componente
   é o primeiro, e existe para trazer o que faltava — a topbar com o botão de
   recolher, o caminho de navegação e os controles globais, no lugar de tê-los
   dentro da sidebar.

   Adotado por página, não globalmente: quem não usar continua funcionando
   igual, porque o Sidebar aceita ser controlado ou não (ver Sidebar.jsx).

   props:
     breadcrumb  [{ label, to? }]  caminho exibido na topbar
     actions      nós à direita da topbar, antes do tema
     density      'compact' | 'comfortable' | 'spacious' — respiro da página
     mainClassName classe extra no <main>, para o CSS específico da página */
export default function AppLayout({
    breadcrumb = [],
    actions = null,
    density = null,
    mainClassName = '',
    children
}) {
    /* O estado sobe para cá porque o botão que o alterna agora vive na topbar,
       fora da sidebar. A persistência continua na mesma chave de sempre, para
       a preferência ser respeitada também nas páginas que ainda não usam este
       layout. */
    const [collapsed, setCollapsed] = useState(
        () => localStorage.getItem('sidebarCollapsed') === 'true'
    );

    const alternarSidebar = useCallback(() => {
        setCollapsed((atual) => {
            const novo = !atual;
            localStorage.setItem('sidebarCollapsed', String(novo));
            return novo;
        });
    }, []);

    return (
        <div className="app-container" data-density={density || undefined}>
            <Sidebar collapsed={collapsed} onToggleCollapsed={alternarSidebar} />

            <main className={`main-content app-shell-main ${mainClassName}`.trim()}>
                <header className="app-topbar">
                    <div className="app-topbar-left">
                        <button
                            type="button"
                            className="app-topbar-toggle"
                            onClick={alternarSidebar}
                            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
                            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
                            aria-expanded={!collapsed}
                        >
                            <i className="fas fa-table-columns" aria-hidden="true"></i>
                        </button>

                        {breadcrumb.length > 0 && (
                            <nav className="app-breadcrumb" aria-label="Caminho de navegação">
                                {breadcrumb.map((item, i) => (
                                    <span key={item.label} className="app-breadcrumb-item">
                                        {i > 0 && <span className="app-breadcrumb-sep" aria-hidden="true">/</span>}
                                        {/* O último item é a página atual: texto, não link */}
                                        <span className={i === breadcrumb.length - 1 ? 'is-current' : ''}
                                            aria-current={i === breadcrumb.length - 1 ? 'page' : undefined}>
                                            {item.label}
                                        </span>
                                    </span>
                                ))}
                            </nav>
                        )}
                    </div>

                    <div className="app-topbar-right">
                        {actions}
                        <ThemeToggle />
                    </div>
                </header>

                <div className="app-shell-content">{children}</div>
            </main>
        </div>
    );
}
