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