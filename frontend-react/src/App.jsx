import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';

// Pages
import Login from './pages/Login/Login';
import Dashboard from './pages/Dashboard/Dashboard';
import InspecaoMontagem from './pages/Registro/InspecaoMontagem/InspecaoMontagem';
import InspecaoInjecao from './pages/Registro/InspecaoInjecao/InspecaoInjecao';
import InspecaoRecebimento from './pages/Registro/InspecaoRecebimento/InspecaoRecebimento';
import RelatorioRecebimento from './pages/Registro/RelatorioRecebimento/RelatorioRecebimento';
import Cartoes from './pages/Cartoes/Cartoes';
import Fichas from './pages/Fichas/Fichas';
import ResumoBloqueio from './pages/ResumoBloqueio/ResumoBloqueio';
import Relatorios from './pages/Relatorios/Relatorios';
import Indicadores from './pages/Indicadores/Indicadores';
import Calibracao from './pages/Calibracao/Calibracao';
import Usuarios from './pages/Usuarios/Usuarios';
import Q49 from './pages/Q49/Q49';

// Styles
import '@fortawesome/fontawesome-free/css/all.min.css';
import './App.css';

function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <Router>
        <Routes>
          {/* Rota pública */}
          <Route path="/login" element={<Login />} />

          {/* Rotas protegidas */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          {/* Registro: Inspeção de Montagem e Inspeção de Injeção */}
          <Route
            path="/registros/montagem"
            element={
              <ProtectedRoute>
                <InspecaoMontagem />
              </ProtectedRoute>
            }
          />

          <Route
            path="/registros/injecao"
            element={
              <ProtectedRoute>
                <InspecaoInjecao />
              </ProtectedRoute>
            }
          />

          <Route
            path="/registros/recebimento"
            element={
              <ProtectedRoute>
                <InspecaoRecebimento />
              </ProtectedRoute>
            }
          />

          <Route
            path="/registros/relatorio-recebimento"
            element={
              <ProtectedRoute>
                <RelatorioRecebimento />
              </ProtectedRoute>
            }
          />

          {/* Compatibilidade: rota antiga redireciona para Inspeção de Montagem */}
          <Route path="/registros" element={<Navigate to="/registros/montagem" replace />} />

          <Route
            path="/cartoes"
            element={
              <ProtectedRoute>
                <Cartoes />
              </ProtectedRoute>
            }
          />

          <Route
            path="/fichas-nc/fnc"
            element={
              <ProtectedRoute>
                <Fichas />
              </ProtectedRoute>
            }
          />

          <Route
            path="/fichas-nc/resumo-bloqueio"
            element={
              <ProtectedRoute>
                <ResumoBloqueio />
              </ProtectedRoute>
            }
          />

          <Route path="/fichas-nc" element={<Navigate to="/fichas-nc/fnc" replace />} />
          <Route path="/fichas" element={<Navigate to="/fichas-nc/fnc" replace />} />

          <Route
            path="/registro/produto-importado"
            element={
              <ProtectedRoute>
                <Q49 />
              </ProtectedRoute>
            }
          />

          <Route
            path="/relatorios"
            element={
              <ProtectedRoute>
                <Relatorios />
              </ProtectedRoute>
            }
          />

          <Route
            path="/indicadores"
            element={
              <ProtectedRoute>
                <Indicadores />
              </ProtectedRoute>
            }
          />

          <Route
            path="/calibracao"
            element={
              <ProtectedRoute>
                <Calibracao />
              </ProtectedRoute>
            }
          />

          <Route
            path="/usuarios"
            element={
              <ProtectedRoute>
                <Usuarios />
              </ProtectedRoute>
            }
          />

          {/* Redirecionar para login por padrão */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
    </ThemeProvider>
  );
}

export default App;



