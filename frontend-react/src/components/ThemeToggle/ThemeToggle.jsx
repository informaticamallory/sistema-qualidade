import { useTheme } from '../../context/theme-context';
import './ThemeToggle.css';

/**
 * Toggle de tema claro/escuro.
 * variant="sidebar"  -> botão largo com rótulo, para a sidebar
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

    return (
        <button
            type="button"
            className="theme-toggle-sidebar"
            onClick={toggleTheme}
            title={label}
            aria-label={label}
        >
            <i className={`fas ${icon}`}></i>
            <span>{label}</span>
        </button>
    );
}
