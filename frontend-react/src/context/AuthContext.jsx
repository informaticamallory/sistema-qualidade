import { useEffect, useState } from 'react';
import { authAPI } from '../services/api';
import { AuthContext } from './auth-context';

function getStoredUser() {
    const storedUser = sessionStorage.getItem('currentUser');
    if (!storedUser) return null;
    try {
        return JSON.parse(storedUser);
    } catch (e) {
        console.error('Erro ao carregar usuário:', e);
        sessionStorage.clear();
        return null;
    }
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(getStoredUser);
    const [loading, setLoading] = useState(() => !!sessionStorage.getItem('token'));

    useEffect(() => {
        let active = true;

        const syncUser = async () => {
            const token = sessionStorage.getItem('token');
            if (!token) {
                sessionStorage.removeItem('currentUser');
                setUser(null);
                setLoading(false);
                return;
            }

            try {
                const response = await authAPI.me();
                if (active && response.data.success) {
                    const userData = response.data.data;
                    setUser(userData);
                    sessionStorage.setItem('currentUser', JSON.stringify(userData));
                }
            } catch {
                if (active) {
                    setUser(null);
                    sessionStorage.clear();
                }
            } finally {
                if (active) setLoading(false);
            }
        };

        syncUser();
        return () => { active = false; };
    }, []);

    const login = async (usuario, senha) => {
        try {
            const response = await authAPI.login(usuario, senha);

            if (response.data.success) {
                const userData = response.data.data.usuario;
                setUser(userData);
                sessionStorage.setItem('currentUser', JSON.stringify(userData));
                sessionStorage.setItem('token', response.data.data.token);
                setLoading(false);
                return { success: true, user: userData };
            }

            return { success: false, message: response.data.message };
        } catch (error) {
            console.error('Erro no login:', error);
            return {
                success: false,
                message: error.response?.data?.message || 'Erro ao conectar com o servidor'
            };
        }
    };

    const register = async (data) => {
        try {
            const response = await authAPI.register(data);
            return response.data;
        } catch (error) {
            console.error('Erro no registro:', error);
            return {
                success: false,
                message: error.response?.data?.message || 'Erro ao criar usuário'
            };
        }
    };

    const verifyAdmin = async (senha) => {
        try {
            const response = await authAPI.verifyAdmin(senha);
            return response.data;
        } catch (error) {
            console.error('Erro na verificação:', error);
            return { success: false, message: 'Senha de administrador inválida' };
        }
    };

    const logout = () => {
        setUser(null);
        setLoading(false);
        sessionStorage.clear();
        window.location.href = '/login';
    };

    const isAuthenticated = () => !!user;
    const isAdmin = () => user?.role === 'admin';
    const isSupervisor = () => user?.role === 'supervisor' || user?.role === 'admin';

    // Controle de acesso por permissão (módulo + ação)
    const can = (modulo, acao = 'visualizar') => {
        if (!user) return false;
        if (user.role === 'admin') return true;
        const perms = user.permissoes || {};
        return Array.isArray(perms[modulo]) && perms[modulo].includes(acao);
    };

    // Tem acesso de visualização ao módulo (para rotas/menu)
    const hasModulo = (modulo) => can(modulo, 'visualizar');

    const getRoleLabel = () => {
        const roles = {
            admin: 'Administrador',
            supervisor: 'Supervisor',
            inspetor: 'Inspetor de Qualidade',
            inspetor_injecao: 'INSPETOR DE INJEÇÃO',
            consultor: 'Consultor',
        };
        return roles[user?.role] || 'Usuário';
    };

    const value = {
        user,
        loading,
        login,
        register,
        verifyAdmin,
        logout,
        isAuthenticated,
        isAdmin,
        isSupervisor,
        can,
        hasModulo,
        getRoleLabel,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}



