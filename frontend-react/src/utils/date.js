export const formatLocalDateISO = (date) => {
    const value = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(value.getTime())) return '';
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const todayISO = () => formatLocalDateISO(new Date());

export const normalizeISODate = (value, fallback = todayISO()) => {
    if (!value) return fallback;
    if (value instanceof Date) return formatLocalDateISO(value);

    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : fallback;
};

export const formatDateBR = (value, emptyValue = 'N/A') => {
    const date = normalizeISODate(value, '');
    if (!date) return emptyValue;

    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}`;
};

export const parseLocalDate = (value) => {
    const date = normalizeISODate(value, '');
    if (!date) return null;

    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day);
};

export const addDaysISO = (value, days) => {
    const date = parseLocalDate(value) || new Date();
    date.setDate(date.getDate() + days);
    return formatLocalDateISO(date);
};

export const daysBetweenDates = (start, end) => {
    const startDate = parseLocalDate(start);
    const endDate = parseLocalDate(end);
    if (!startDate || !endDate) return null;
    return Math.ceil((endDate - startDate) / 86400000);
};
/* ── Helpers de período ────────────────────────────────────────────────
   Extraídos para cá porque Inspeção de Injeção e de Montagem mantinham
   cópias idênticas locais. A Inspeção de Recebimento passa a consumir
   daqui em vez de criar uma terceira cópia. As duas páginas antigas
   seguem com as versões locais — migrá-las é seguro, mas fica para um
   passo próprio para não mexer nelas agora.
   ───────────────────────────────────────────────────────────────────── */

export const currentMonthISO = () => todayISO().slice(0, 7);

export const monthRangeISO = (value = currentMonthISO()) => {
    const [year, month] = String(value || currentMonthISO()).split('-').map(Number);
    const safeYear = year || Number(currentMonthISO().slice(0, 4));
    const safeMonth = month || Number(currentMonthISO().slice(5, 7));
    const lastDay = new Date(safeYear, safeMonth, 0).getDate();
    const prefix = `${safeYear}-${String(safeMonth).padStart(2, '0')}`;
    return {
        start: `${prefix}-01`,
        end: `${prefix}-${String(lastDay).padStart(2, '0')}`
    };
};

export const previousMonthISO = () => {
    const [year, month] = currentMonthISO().split('-').map(Number);
    const date = new Date(year, month - 2, 1);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
};

export const formatMonthLabel = (value) => {
    const [year, month] = String(value || '').split('-').map(Number);
    if (!year || !month) return 'Mês atual';

    const label = new Intl.DateTimeFormat('pt-BR', {
        month: 'long',
        year: 'numeric'
    }).format(new Date(year, month - 1, 1));

    return label.charAt(0).toUpperCase() + label.slice(1);
};

/* Aceita foto única (formato legado) ou array JSON, sempre devolvendo
   [{src, nome}] limitado a 3 — mesmo contrato usado em Injeção/Montagem. */
export const normalizarFotosPeca = (fotosSalvas, nomesSalvos) => {
    const lerLista = (valor) => {
        if (Array.isArray(valor)) return valor;
        if (!valor) return [];
        try {
            const parsed = JSON.parse(valor);
            return Array.isArray(parsed) ? parsed : [valor];
        } catch {
            return [valor];
        }
    };

    const fotos = lerLista(fotosSalvas);
    const nomes = lerLista(nomesSalvos);

    return fotos
        .filter((src) => typeof src === 'string' && src.trim())
        .slice(0, 3)
        .map((src, index) => ({
            src,
            nome: String(nomes[index] || `Foto ${index + 1}`)
        }));
};
