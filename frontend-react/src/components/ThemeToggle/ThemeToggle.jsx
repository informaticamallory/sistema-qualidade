import { useTheme } from '../../context/theme-context';
import './ThemeToggle.css';

/**
 * Toggle de tema claro/escuro.
 * variant="sidebar"  -> botão compacto no cabeçalho da sidebar
 * variant="topbar"   -> botão discreto na barra superior do AppLayout
 * variant="floating" -> botão circular flutuante, para a tela de login
 */
export default function ThemeToggle({ variant = 'sidebar' }) {
    const { isDark, toggleTheme } = useTheme();

    const label = isDark ? 'Modo claro' : 'Modo escuro';
    const icon = isDark ? 'fa-sun' : 'fa-moon';

    if (variant === 'floating') {
        return (
            <button
                type="button"
                className="theme-toggle-floating"
                onClick={toggleTheme}
                title={label}
                aria-label={label}
            >
                <i className={`fas ${icon}`}></i>
            </button>
        );
    }

    /* A variante da sidebar tem fundo e borda em laranja, pensados para o
       cabeçalho escuro dela. Na barra superior clara aquilo virava um bloco
       laranja disputando atenção com o botão de ação da página, e não parecia
       um controle de tema. */
    if (variant === 'topbar') {
        return (
            <button
                type="button"
                className="theme-toggle-topbar"
                onClick={toggleTheme}
                title={label}
                aria-label={label}
                aria-pressed={isDark}
            >
                <i className={`fas ${icon}`} aria-hidden="true"></i>
            </button>
        );
    }

    return (
        <button
            type="button"
            className="theme-toggle-sidebar"
            onClick={toggleTheme}
            title={label}
            aria-label={label}
        >
            <i className={`fas ${icon}`}></i>
        </button>
    );
}
