import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import { canAccess } from '../../config/permissions';
import ThemeToggle from '../ThemeToggle/ThemeToggle';
import './Sidebar.css';

/* Aceita ser controlado por fora sem deixar de funcionar sozinho.

   Quando `collapsed` e `onToggleCollapsed` são passados (caso do Layout, que
   põe o botão de recolher na barra superior), o estado vem do pai. Quando não
   são, o componente segue com o estado próprio e o localStorage, exatamente
   como antes — é o que mantém as páginas que ainda não usam o Layout
   funcionando sem nenhuma alteração. */
export default function Sidebar({ collapsed: collapsedProp, onToggleCollapsed }) {
    const controlado = collapsedProp !== undefined;

    const [collapsedInterno, setCollapsedInterno] = useState(
        () => localStorage.getItem('sidebarCollapsed') === 'true'
    );

    const collapsed = controlado ? collapsedProp : collapsedInterno;
    const setCollapsed = controlado ? () => {} : setCollapsedInterno;
    const [mobileOpen, setMobileOpen] = useState(false);
    const location = useLocation();
    const { user, logout, getRoleLabel, can } = useAuth();

    const navItems = [
        { path: '/dashboard', icon: 'fa-tachometer-alt', label: 'Dashboard', modulo: 'dashboard' },
        {
            key: 'registro',
            icon: 'fa-clipboard-list',
            label: 'Registro',
            children: [
                { path: '/registros/montagem', icon: 'fa-list-check', label: 'Inspeção de Montagem', modulo: 'registros' },
                { path: '/registros/injecao', icon: 'fa-cubes', label: 'Inspeção de Injeção', modulo: 'injecao' },
                { path: '/registro/produto-importado', icon: 'fa-ship', label: 'Produto Importado (Q49)', modulo: 'registros' },
                { path: '/registros/recebimento', icon: 'fa-clipboard-check', label: 'Inspeção de Recebimento', modulo: 'registros' },
                { path: '/registros/relatorio-recebimento', icon: 'fa-truck-ramp-box', label: 'Relatório de Recebimento', modulo: 'registros' }
            ]
        },
        /* Item próprio, fora de Registro: cadastrar o desenho é trabalho de
           engenharia, não lançamento de inspeção. */
        { path: '/cadastro-material', icon: 'fa-drafting-compass', label: 'Cadastro de Material', modulo: 'materiais' },
        { path: '/cartoes', icon: 'fa-credit-card', label: 'Cartões', modulo: 'cartoes' },
        {
            key: 'fichas-nc',
            label: 'Fichas NC',
            icon: 'fa-file-circle-exclamation',
            children: [
                {
                    path: '/fichas-nc/fnc',
                    label: 'Fichas de Não Conformidade',
                    icon: 'fa-file-contract'
                },
                {
                    path: '/fichas-nc/resumo-bloqueio',
                    label: 'Resumo Diário de Bloqueio',
                    icon: 'fa-table-list'
                }
            ]
        },
        { path: '/calibracao', icon: 'fa-tools', label: 'Calibração', modulo: 'calibracao' },
        { path: '/indicadores', icon: 'fa-chart-line', label: 'Indicadores', modulo: 'dashboard' },
        { path: '/relatorios', icon: 'fa-file-invoice', label: 'Relatórios', modulo: 'relatorios' },
        { path: '/usuarios', icon: 'fa-users-gear', label: 'Usuários', modulo: 'usuarios' }
    ];

    const role = user?.role ?? 'inspetor';
    const canSeeItem = (item) => (
        item.modulo ? can(item.modulo, 'visualizar') : canAccess(user, item.path)
    );
    const visibleNavItems = navItems.flatMap((item) => {
        if (item.children) {
            const children = item.children.filter((child) => canSeeItem(child));
            if (children.length === 0) return [];
            return role === 'inspetor_injecao' && item.key === 'registro' ? children : [{ ...item, children }];
        }

        return canSeeItem(item) ? [item] : [];
    });

    const [openGroups, setOpenGroups] = useState({});

    const toggleSidebar = () => {
        /* Controlado: quem decide é o pai, que também persiste. */
        if (controlado) { onToggleCollapsed?.(); return; }
        const newState = !collapsed;
        setCollapsed(newState);
        localStorage.setItem('sidebarCollapsed', newState.toString());
    };

    const toggleMobile = () => setMobileOpen((open) => !open);
    const closeMobile = () => setMobileOpen(false);

    useEffect(() => {
        document.body.classList.toggle('sidebar-mobile-lock', mobileOpen);

        const handleEscape = (event) => {
            if (event.key === 'Escape') closeMobile();
        };

        if (mobileOpen) {
            window.addEventListener('keydown', handleEscape);
        }

        return () => {
            document.body.classList.remove('sidebar-mobile-lock');
            window.removeEventListener('keydown', handleEscape);
        };
    }, [mobileOpen]);

    const isActive = (path) => location.pathname === path;

    const handleLogout = () => {
        if (window.confirm('Tem certeza que deseja sair do sistema?')) {
            logout();
        }
    };

    const userInitial = user?.nome?.charAt(0).toUpperCase() || 'U';

    return (
        <>
            {/* Mobile Toggle Button */}
            <button
                className="mobile-toggle"
                onClick={toggleMobile}
                title="Abrir menu"
                aria-label="Abrir menu"
                aria-expanded={mobileOpen}
            >
                <i className="fas fa-bars"></i>
            </button>

            {/* Overlay for mobile */}
            <div
                className={`sidebar-overlay ${mobileOpen ? 'active' : ''}`}
                onClick={closeMobile}
            ></div>

            {/* Sidebar */}
            <nav
                className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
                data-collapsed={collapsed}
                aria-label="Navegação principal"
            >
                <div className="sidebar-header">
                    <div className="logo-icon">
                        <img src="/M.svg" alt="" />
                    </div>
                    <div className="logo-text">
                        <h2>MALLORY</h2>
                        <p>Qualidade Industrial</p>
                    </div>
                    {/* Controlado, quem oferece tema e recolher é a barra superior:
                        repetir os dois aqui deixaria dois controles idênticos na
                        tela ao mesmo tempo. Sem controle externo nada muda. */}
                    {!controlado && (
                        <div className="sidebar-header-actions">
                            <ThemeToggle variant="sidebar" />
                            <button
                                type="button"
                                className="sidebar-header-toggle"
                                onClick={toggleSidebar}
                                title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
                                aria-label={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
                            >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <rect x="3" y="3" width="18" height="18" rx="3"></rect>
                                    <path className="sidebar-toggle-divider" d="M9 3v18"></path>
                                    {collapsed ? <path d="m13 9 3 3-3 3"></path> : <path d="m15 9-3 3 3 3"></path>}
                                </svg>
                            </button>
                        </div>
                    )}
                </div>

                <div className="sidebar-menu">
                    <p className="menu-section-label">Menu principal</p>
                    {visibleNavItems.map((item) => {
                        if (item.children) {
                            const groupActive = item.children.some((child) => isActive(child.path));
                            const expanded = openGroups[item.key] ?? groupActive;
                            return (
                                <div key={item.key} className="menu-group">
                                    <button
                                        type="button"
                                        className={`menu-item menu-group-toggle ${groupActive ? 'active' : ''}`}
                                        onClick={() => setOpenGroups((prev) => ({ ...prev, [item.key]: !expanded }))}
                                        title={collapsed ? item.label : undefined}
                                        aria-expanded={expanded}
                                    >
                                        <i className={`fas ${item.icon}`}></i>
                                        <span>{item.label}</span>
                                        <i className={`fas fa-chevron-${expanded ? 'down' : 'right'} menu-group-caret`}></i>
                                    </button>
                                    {expanded && (
                                        <div className="submenu">
                                            {item.children.map((child) => (
                                                <Link
                                                    key={child.path}
                                                    to={child.path}
                                                    className={`menu-item submenu-item ${isActive(child.path) ? 'active' : ''}`}
                                                    onClick={closeMobile}
                                                    title={collapsed ? child.label : undefined}
                                                    aria-current={isActive(child.path) ? 'page' : undefined}
                                                >
                                                    <i className={`fas ${child.icon}`}></i>
                                                    <span>{child.label}</span>
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`menu-item ${isActive(item.path) ? 'active' : ''}`}
                                onClick={closeMobile}
                                title={collapsed ? item.label : undefined}
                                aria-current={isActive(item.path) ? 'page' : undefined}
                            >
                                <i className={`fas ${item.icon}`}></i>
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </div>

                <div className="sidebar-user">
                    <div className="user-avatar">{userInitial}</div>
                    <div className="user-details">
                        <p className="user-name">{user?.nome || 'Usuário'}</p>
                        <p className="user-role">{getRoleLabel()}</p>
                    </div>
                    <button
                        type="button"
                        className="logout-btn-collapsed"
                        onClick={handleLogout}
                        title="Sair do sistema"
                        aria-label="Sair do sistema"
                    >
                        <i className="fas fa-sign-out-alt" aria-hidden="true"></i>
                    </button>
                </div>
            </nav>

        </>
    );
}