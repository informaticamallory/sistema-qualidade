import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import { canAccess, defaultPathForUser } from '../../config/permissions';

export default function ProtectedRoute({ children }) {
    const { user, loading, isAuthenticated } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Carregando...</p>
            </div>
        );
    }

    if (!user || !isAuthenticated()) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (!canAccess(user, location.pathname)) {
        return <Navigate to={defaultPathForUser(user)} replace />;
    }

    return children;
}