import { useState, useEffect, useCallback } from 'react';
import { Chart as ChartJS } from 'chart.js';
import { ThemeContext } from './theme-context';

const STORAGE_KEY = 'theme';

function getInitialTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
        return stored;
    }
    // Fallback: preferência do sistema operacional
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

/* Sincroniza as cores padrão do Chart.js (legendas, eixos, grades)
   com os tokens do tema ativo. Os gráficos são remontados via
   key={theme} nas páginas que os utilizam. */
function syncChartTheme() {
    const styles = getComputedStyle(document.documentElement);
    ChartJS.defaults.color = styles.getPropertyValue('--text-muted').trim();
    ChartJS.defaults.borderColor = styles.getPropertyValue('--border').trim();
    ChartJS.defaults.font.family = "'Inter', -apple-system, 'Segoe UI', sans-serif";
}

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(getInitialTheme);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);
        syncChartTheme();
    }, [theme]);

    // Acompanhar mudança de preferência do SO (apenas se o usuário não escolheu manualmente)
    useEffect(() => {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (e) => {
            if (!localStorage.getItem(STORAGE_KEY)) {
                setTheme(e.matches ? 'dark' : 'light');
            }
        };
        media.addEventListener('change', handler);
        return () => media.removeEventListener('change', handler);
    }, []);

    const toggleTheme = useCallback(() => {
        setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark' }}>
            {children}
        </ThemeContext.Provider>
    );
}
