import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_URL || '/api';

// Criar instância do axios
const api = axios.create({
    baseURL: apiBaseUrl,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
});

const pendingGetRequests = new Map();

const emptyCalibrationStats = {
    total_equipamentos: 0,
    calibrados: 0,
    vencendo: 0,
    vencidos: 0,
    nunca_calibrados: 0
};

function getStableParams(params = {}) {
    const searchParams = new URLSearchParams();

    Object.keys(params)
        .sort()
        .forEach((key) => {
            const value = params[key];
            if (value !== undefined && value !== null && value !== '') {
                searchParams.append(key, value);
            }
        });

    return searchParams.toString();
}

function getRequestKey(url, config = {}) {
    const params = getStableParams(config.params);
    return params ? `${url}?${params}` : url;
}

function dedupedGet(url, config = {}) {
    const key = getRequestKey(url, config);
    if (pendingGetRequests.has(key)) return pendingGetRequests.get(key);

    const request = api.get(url, config).finally(() => pendingGetRequests.delete(key));
    pendingGetRequests.set(key, request);
    return request;
}

function fallbackWhenMissing(request, data, message) {
    return request.catch((error) => {
        if (error.response?.status === 404) {
            return Promise.resolve({ data: { success: true, data, fallback: true, message } });
        }
        throw error;
    });
}

// Interceptor para adicionar token
api.interceptors.request.use(
    (config) => {
        const token = sessionStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Interceptor para tratamento de erros
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response?.status;
        const url = error.config?.url || '';
        const isLoginAttempt = url.includes('/auth/login') || url.includes('/auth/verify-admin');

        if (!isLoginAttempt && (status === 401 || status === 422)) {
            sessionStorage.clear();
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// ==================== AUTH ====================
export const authAPI = {
    login: (usuario, senha) => api.post('/auth/login', { usuario, senha }),
    completeLegacyPasswordReset: (token, senha) => api.post('/auth/redefinir-senha-legado', { senha }, {
        headers: { Authorization: `Bearer ${token}` }
    }),
    register: (data) => api.post('/auth/register', data),
    verifyAdmin: (senha) => api.post('/auth/verify-admin', { senha }),
    me: () => dedupedGet('/auth/me'),
    getUsuarios: () => dedupedGet('/auth/usuarios'),
    deleteUsuario: (id) => api.delete(`/auth/usuarios/${id}`),
};

// ==================== USUÁRIOS (gerenciamento + permissões) ====================
export const usuariosAPI = {
    getAll: (params = {}) => dedupedGet('/usuarios', { params }),
    getById: (id) => dedupedGet(`/usuarios/${id}`),
    create: (data) => api.post('/usuarios', data),
    update: (id, data) => api.put(`/usuarios/${id}`, data),
    toggleAtivo: (id) => api.patch(`/usuarios/${id}/ativo`),
    delete: (id) => api.delete(`/usuarios/${id}`),
    getCatalogo: () => dedupedGet('/usuarios/catalogo'),
};

// ==================== REGISTROS ====================
export const registrosAPI = {
    getAll: (params = {}) => dedupedGet('/registros', { params }),
    getById: (id) => dedupedGet(`/registros/${id}`),
    create: (data) => api.post('/registros', data),
    update: (id, data) => api.put(`/registros/${id}`, data),
    delete: (id) => api.delete(`/registros/${id}`),
};


// ==================== FICHAS NC ====================
export const fichasAPI = {
    getAll: (params = {}) => dedupedGet('/nao-conformidades', { params }),
    getById: (id) => dedupedGet(`/nao-conformidades/${id}`),
    create: (data) => api.post('/nao-conformidades', data),
    update: (id, data) => api.put(`/nao-conformidades/${id}`, data),
    delete: (id) => api.delete(`/nao-conformidades/${id}`),
};

// ==================== RESUMO DIÁRIO DE BLOQUEIO ====================
export const resumoBloqueioAPI = {
    getByDate: (date) => dedupedGet(`/resumo-bloqueio/${date}`),
    saveByDate: (date, rows) => api.put(`/resumo-bloqueio/${date}`, { rows }),
};

// ==================== INSPEÇÃO DE INJEÇÃO ====================
export const injecaoAPI = {
    getAll: (params = {}) => dedupedGet('/inspecao-injecao', { params }),
    getById: (id) => dedupedGet(`/inspecao-injecao/${id}`),
    searchMachines: (search = '') => dedupedGet('/inspecao-injecao/maquinas', { params: { search } }),
    searchDefects: (search = '') => dedupedGet('/inspecao-injecao/defeitos', { params: { search } }),
    create: (data) => api.post('/inspecao-injecao', data),
    update: (id, data) => api.put(`/inspecao-injecao/${id}`, data),
    delete: (id) => api.delete(`/inspecao-injecao/${id}`),
};

// ==================== INSPEÇÃO DE RECEBIMENTO (FICHA) ====================
export const recebimentoAPI = {
    getAll: (params = {}) => dedupedGet('/inspecao-recebimento', { params }),
    getById: (id) => dedupedGet(`/inspecao-recebimento/${id}`),
    create: (data) => api.post('/inspecao-recebimento', data),
    update: (id, data) => api.put(`/inspecao-recebimento/${id}`, data),
    delete: (id) => api.delete(`/inspecao-recebimento/${id}`),
};

// ==================== RELATÓRIO DE RECEBIMENTO ====================
export const relatorioRecebimentoAPI = {
    getAll: (params = {}) => dedupedGet('/relatorio-recebimento', { params }),
    getById: (id) => dedupedGet(`/relatorio-recebimento/${id}`),
    create: (data) => api.post('/relatorio-recebimento', data),
    update: (id, data) => api.put(`/relatorio-recebimento/${id}`, data),
    delete: (id) => api.delete(`/relatorio-recebimento/${id}`),
};

// ==================== CARTÕES ====================
export const cartoesAPI = {
    getAll: (params = {}) => dedupedGet('/cartoes', { params }),
    getById: (id) => dedupedGet(`/cartoes/${id}`),
    create: (data) => api.post('/cartoes', data),
    update: (id, data) => api.put(`/cartoes/${id}`, data),
    delete: (id) => api.delete(`/cartoes/${id}`),
    getStats: () => api.get('/cartoes/stats'),
};

// ==================== PRODUTOS ====================
export const produtosAPI = {
    getAll: () => dedupedGet('/produtos'),
    getByCode: (codigo) => dedupedGet(`/produtos/${encodeURIComponent((codigo || '').trim())}`),
    getByBarcode: (barcode) => dedupedGet(`/produtos/barcode/${encodeURIComponent((barcode || '').trim())}`),
    search: (termo) => api.get('/produtos/search', { params: { q: termo } }),
};

// ==================== DEFEITOS ====================
export const defeitosAPI = {
    getAll: () => api.get('/defeitos'),
    create: (defeito) => api.post('/defeitos', { defeito }),
    delete: (id) => api.delete(`/defeitos/${id}`),
};

// ==================== DASHBOARD ====================
export const q49API = {
    getAll: (params = {}) => dedupedGet('/q49', { params }),
    getById: (id) => dedupedGet(`/q49/${id}`),
    create: (data) => api.post('/q49', data),
    update: (id, data) => api.put(`/q49/${id}`, data),
    delete: (id) => api.delete(`/q49/${id}`),
};
export const dashboardAPI = {
    getStats: () => dedupedGet('/dashboard/stats'),
    getBuilderData: (params = {}) => dedupedGet('/dashboard/builder-data', { params }),
    getInspecoesPorLinha: () => dedupedGet('/dashboard/inspecoes-por-linha'),
    getInspecoesInjecaoPorMaquina: () => dedupedGet('/dashboard/inspecoes-injecao-por-maquina'),
    getUltimasInspecoes: (params = {}) => dedupedGet('/dashboard/ultimas-inspecoes', { params }),
};

// ==================== HEALTH ====================
export const healthAPI = {
    check: () => dedupedGet('/health'),
};

// ==================== TIPOS DE EQUIPAMENTO ====================
export const tiposEquipamentoAPI = {
    getAll: () => fallbackWhenMissing(
        dedupedGet('/tipos-equipamento'),
        [],
        'Tipos de equipamento ainda não estão disponíveis nesta API.'
    ),
    create: (data) => api.post('/tipos-equipamento', data),
    delete: (id) => api.delete(`/tipos-equipamento/${id}`),
};

// ==================== EQUIPAMENTOS ====================
export const equipamentosAPI = {
    getAll: (params = {}) => fallbackWhenMissing(
        dedupedGet('/equipamentos', { params }),
        [],
        'Equipamentos ainda não estão disponíveis nesta API.'
    ),
    getById: (id) => dedupedGet(`/equipamentos/${id}`),
    create: (data) => api.post('/equipamentos', data),
    update: (id, data) => api.put(`/equipamentos/${id}`, data),
    delete: (id) => api.delete(`/equipamentos/${id}`),
};

// ==================== CALIBRAÇÕES ====================
export const calibracoesAPI = {
    getAll: (params = {}) => fallbackWhenMissing(
        dedupedGet('/calibracoes', { params }),
        [],
        'Calibrações ainda não estão disponíveis nesta API.'
    ),
    create: (data) => api.post('/calibracoes', data),
    createWithFile: (formData) => api.post('/calibracoes', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    getCertificate: (id) => api.get(`/calibracoes/${id}/certificado`, {
        responseType: 'blob'
    }),
    getAlertas: () => fallbackWhenMissing(
        dedupedGet('/calibracoes/alertas'),
        [],
        'Alertas de calibração ainda não estão disponíveis nesta API.'
    ),
    getStats: () => fallbackWhenMissing(
        dedupedGet('/calibracoes/stats'),
        emptyCalibrationStats,
        'Estatísticas de calibração ainda não estão disponíveis nesta API.'
    ),
};

export default api;



