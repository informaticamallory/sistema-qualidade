// IMPORTANT: frontend RBAC is UX only.
// All API endpoints must also validate permissions server-side
// before returning data or accepting writes.
// Frontend restrictions can always be bypassed via direct API calls.

export const ROUTE_PERMISSIONS = [
    { path: '/dashboard', modulo: 'dashboard' },
    { path: '/registros/injecao', modulo: 'injecao' },
    { path: '/registros/montagem', modulo: 'registros' },
    { path: '/registros/recebimento', modulo: 'registros' },
    { path: '/registros/relatorio-recebimento', modulo: 'registros' },
    { path: '/registro/produto-importado', modulo: 'registros' },
    { path: '/cartoes', modulo: 'cartoes' },
    { path: '/fichas-nc/fnc', modulo: 'nao_conformidades' },
    { path: '/fichas-nc/resumo-bloqueio', modulo: 'nao_conformidades' },
    { path: '/calibracao', modulo: 'calibracao' },
    { path: '/indicadores', modulo: 'dashboard' },
    { path: '/relatorios', modulo: 'relatorios' },
    { path: '/usuarios', modulo: 'usuarios' },
];

const ROLE_DEFAULT_ROUTES = {
    supervisor: ['/dashboard', '/registros/montagem', '/cartoes', '/fichas-nc/fnc', '/fichas-nc/resumo-bloqueio', '/calibracao'],
    inspetor: ['/registros/montagem', '/cartoes', '/fichas-nc/fnc', '/fichas-nc/resumo-bloqueio', '/calibracao', '/registros/injecao'],
    inspetor_injecao: ['/registros/injecao', '/fichas-nc/fnc', '/fichas-nc/resumo-bloqueio', '/cartoes', '/calibracao'],
    consultor: ['/fichas-nc/fnc', '/fichas-nc/resumo-bloqueio', '/dashboard', '/cartoes', '/relatorios'],
};

const DEFAULT_ROUTE_ORDER = [
    '/dashboard',
    '/registros/montagem',
    '/registros/injecao',
    '/cartoes',
    '/fichas-nc/fnc',
    '/fichas-nc/resumo-bloqueio',
    '/calibracao',
    '/indicadores',
    '/relatorios',
    '/usuarios',
];

export function getRoutePermission(path) {
    if (!path) return null;
    return ROUTE_PERMISSIONS.find((route) => (
        path === route.path || path.startsWith(`${route.path}/`)
    )) || null;
}

export function hasPermission(user, modulo, acao = 'visualizar') {
    if (!user || !modulo) return false;
    if (user.role === 'admin') return true;

    const permissoes = user.permissoes || {};
    return Array.isArray(permissoes[modulo]) && permissoes[modulo].includes(acao);
}

export function canAccess(user, path) {
    if (!user) return false;
    if (user.role === 'admin') return true;

    const permission = getRoutePermission(path);
    if (!permission) return false;

    return hasPermission(user, permission.modulo, permission.acao || 'visualizar');
}

export function defaultPathForUser(user) {
    if (!user) return '/login';
    if (user.role === 'admin') return '/dashboard';

    const roleDefaults = ROLE_DEFAULT_ROUTES[user.role] || [];
    const candidates = [...new Set([...roleDefaults, ...DEFAULT_ROUTE_ORDER])];
    return candidates.find((path) => canAccess(user, path)) || '/login';
}