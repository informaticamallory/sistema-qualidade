import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth-context';

export default function ProtectedRoute({ children, requiredRoles = [], requiredPermission = null }) {
    const { user, loading, isAuthenticated, can } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Carregando...</p>
            </div>
        );
    }

    if (!isAuthenticated()) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Verificar permissão por módulo/ação (ex.: { modulo: 'usuarios', acao: 'visualizar' })
    if (requiredPermission) {
        const { modulo, acao = 'visualizar' } = requiredPermission;
        if (!can(modulo, acao)) {
            return <Navigate to="/dashboard" replace />;
        }
    }

    // Verificar roles permitidas
    if (requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
        // Redirecionar para página apropriada baseada no role
        if (user.role === 'consultor') {
            return <Navigate to="/fichas" replace />;
        }
        if (user.role === 'inspetor') {
            return <Navigate to="/registros/montagem" replace />;
        }
        return <Navigate to="/dashboard" replace />;
    }

    return children;
}
