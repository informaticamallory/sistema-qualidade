import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import ThemeToggle from '../../components/ThemeToggle/ThemeToggle';
import PasswordRequirements from '../../components/PasswordRequirements/PasswordRequirements';
import { senhaValida } from '../../utils/passwordValidation';
import { canAccess, defaultPathForUser } from '../../config/permissions';
import './Login.css';

function SenhaField({ value, onChange, showSenha, placeholder = 'Digite sua senha', autoComplete = 'current-password' }) {
    return (
        <input
            type={showSenha ? 'text' : 'password'}
            className="form-control"
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            autoComplete={autoComplete}
        />
    );
}

function Login() {
    const [isLogin, setIsLogin] = useState(true);
    const [showAdminVerify, setShowAdminVerify] = useState(false);
    const [adminVerified, setAdminVerified] = useState(false);
    const [showSenha, setShowSenha] = useState(false);
    const [loading, setLoading] = useState(false);
    const [alert, setAlert] = useState({ show: false, type: '', message: '' });
    const [selectedRole, setSelectedRole] = useState('supervisor');

    const [loginData, setLoginData] = useState({ usuario: '', senha: '' });
    const [registerData, setRegisterData] = useState({
        nome: '',
        usuario: '',
        senha: '',
        confirmSenha: ''
    });
    const [adminSenha, setAdminSenha] = useState('');
    const [resetToken, setResetToken] = useState(null);
    const [resetData, setResetData] = useState({ senha: '', confirmSenha: '' });

    const navigate = useNavigate();
    const location = useLocation();
    const { login, register, verifyAdmin, completeLegacyPasswordReset, user } = useAuth();

    // Redirecionar se já estiver logado
    useEffect(() => {
        if (user) {
            navigate(defaultPathForUser(user));
        }
    }, [user, navigate]);

    const showAlert = (type, message) => {
        setAlert({ show: true, type, message });
        setTimeout(() => setAlert({ show: false, type: '', message: '' }), 5000);
    };

    const handleLogin = async (e) => {
        e.preventDefault();

        if (!loginData.usuario.trim()) {
            showAlert('error', 'Digite o usuário');
            return;
        }

        const senha = loginData.senha;
        if (!senha) {
            showAlert('error', 'Digite sua senha');
            return;
        }

        setLoading(true);
        const result = await login(loginData.usuario, senha);
        setLoading(false);

        if (result.success) {
            showAlert('success', 'Login realizado com sucesso!');
            setTimeout(() => {
                const destination = location.state?.from?.pathname;
                const fallback = defaultPathForUser(result.user);
                navigate(destination && canAccess(result.user, destination) ? destination : fallback);
            }, 1000);
        } else if (result.requiresPasswordReset && result.passwordResetToken) {
            setResetToken(result.passwordResetToken);
            setResetData({ senha: '', confirmSenha: '' });
            showAlert('info', 'Defina uma nova senha para continuar.');
        } else {
            showAlert('error', result.message || 'Usuário ou senha inválido');
            setLoginData(prev => ({ ...prev, senha: '' }));
        }
    };

    const handleLegacyPasswordReset = async (e) => {
        e.preventDefault();
        const senha = resetData.senha;
        const confirmSenha = resetData.confirmSenha;

        if (!senhaValida(senha)) {
            showAlert('error', 'A senha deve ter ao menos 8 caracteres, incluindo maiúscula, minúscula, número e caractere especial.');
            return;
        }

        if (senha !== confirmSenha) {
            showAlert('error', 'As senhas não coincidem.');
            return;
        }

        setLoading(true);
        const result = await completeLegacyPasswordReset(resetToken, senha);
        setLoading(false);

        if (result.success) {
            showAlert('success', 'Senha atualizada com sucesso!');
            setResetToken(null);
            setTimeout(() => navigate(defaultPathForUser(result.user)), 700);
        } else {
            showAlert('error', result.message || 'Não foi possível atualizar a senha. Faça login novamente.');
        }
    };

    const handleVerifyAdmin = async () => {
        const senha = adminSenha;
        if (!senhaValida(senha)) {
            showAlert('error', 'Digite a senha completa do administrador');
            return;
        }

        setLoading(true);
        const result = await verifyAdmin(senha);
        setLoading(false);

        if (result.success) {
            setAdminVerified(true);
            setShowAdminVerify(false);
            showAlert('success', 'Verificação concluída. Preencha os dados do novo usuário');
        } else {
            showAlert('error', 'Senha de administrador inválida');
            setAdminSenha('');
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();

        if (!registerData.nome.trim() || !registerData.usuario.trim()) {
            showAlert('error', 'Preencha todos os campos');
            return;
        }

        const senha = registerData.senha;
        const confirmSenha = registerData.confirmSenha;

        if (!senhaValida(senha)) {
            showAlert('error', 'A senha não atende aos requisitos. Verifique a lista abaixo do campo.');
            return;
        }

        if (senha !== confirmSenha) {
            showAlert('error', 'As senhas não coincidem');
            setRegisterData(prev => ({ ...prev, confirmSenha: '' }));
            return;
        }

        setLoading(true);
        const result = await register({
            nome: registerData.nome,
            usuario: registerData.usuario,
            senha,
            role: selectedRole
        });
        setLoading(false);

        if (result.success) {
            showAlert('success', 'Conta criada com sucesso!');
            setTimeout(() => {
                setIsLogin(true);
                setAdminVerified(false);
                setLoginData({ usuario: registerData.usuario, senha: '' });
                setRegisterData({ nome: '', usuario: '', senha: '', confirmSenha: '' });
            }, 2000);
        } else {
            showAlert('error', result.message || 'Erro ao criar conta');
        }
    };

    const loginSenhaTexto = loginData.senha;
    const registerSenhaTexto = registerData.senha;
    const podeEntrar = loginData.usuario.trim() && loginSenhaTexto.length > 0;
    const podeCriarConta = registerData.nome.trim() && registerData.usuario.trim() && senhaValida(registerSenhaTexto);

    return (
        <div className="login-container">
            <ThemeToggle variant="floating" />
            <div className="login-header">
                <div className="logo-icon">
                    <img src="/M.svg" alt="" />
                </div>
                <h1>MALLORY</h1>
                <p>Sistema de Inspeção de Qualidade</p>
            </div>

            <div className="login-body">
                {alert.show && (
                    <div className={`alert alert-${alert.type}`}>
                        <i className={`fas fa-${alert.type === 'success' ? 'check-circle' : alert.type === 'error' ? 'times-circle' : 'info-circle'}`}></i>
                        {alert.message}
                    </div>
                )}

                {resetToken ? (
                    <div className="form-container">
                        <h2><i className="fas fa-key"></i> Definir nova senha</h2>
                        <form onSubmit={handleLegacyPasswordReset}>
                            <div className="form-group">
                                <label className="form-label">Nova senha</label>
                                <SenhaField
                                    value={resetData.senha}
                                    onChange={(e) => setResetData(prev => ({ ...prev, senha: e.target.value }))}
                                    showSenha={showSenha}
                                    placeholder="Digite a nova senha"
                                    autoComplete="new-password"
                                />
                                <PasswordRequirements senha={resetData.senha} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Confirmar nova senha</label>
                                <SenhaField
                                    value={resetData.confirmSenha}
                                    onChange={(e) => setResetData(prev => ({ ...prev, confirmSenha: e.target.value }))}
                                    showSenha={showSenha}
                                    placeholder="Confirme a nova senha"
                                    autoComplete="new-password"
                                />
                            </div>
                            <button type="button" className="pin-toggle-btn" onClick={() => setShowSenha(!showSenha)}>
                                <i className={`fas fa-eye${showSenha ? '-slash' : ''}`}></i>
                                <span>{showSenha ? 'Ocultar' : 'Mostrar'} senha</span>
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={loading}>
                                {loading ? <><i className="fas fa-spinner fa-spin"></i> Salvando...</> : <><i className="fas fa-check"></i> Atualizar senha</>}
                            </button>
                        </form>
                    </div>
                ) : isLogin ? (
                    // Login Form
                    <div className="form-container">
                        <h2><i className="fas fa-sign-in-alt"></i> Entrar</h2>

                        <form onSubmit={handleLogin}>
                            <div className="form-group">
                                <label className="form-label">Usuário</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Digite seu usuário"
                                    value={loginData.usuario}
                                    onChange={(e) => setLoginData(prev => ({ ...prev, usuario: e.target.value }))}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Senha</label>
                                <div className="pin-container">
                                    <SenhaField
                                        value={loginData.senha}
                                        onChange={(e) => setLoginData(prev => ({ ...prev, senha: e.target.value }))}
                                        showSenha={showSenha}
                                    />
                                    <button
                                        type="button"
                                        className="pin-toggle-btn"
                                        onClick={() => setShowSenha(!showSenha)}
                                    >
                                        <i className={`fas fa-eye${showSenha ? '-slash' : ''}`}></i>
                                        <span>{showSenha ? 'Ocultar' : 'Mostrar'} senha</span>
                                    </button>
                                </div>
                                <PasswordRequirements senha={loginSenhaTexto} />
                            </div>

                            <button type="submit" className="btn btn-primary" disabled={loading || !podeEntrar}>
                                {loading ? (
                                    <><i className="fas fa-spinner fa-spin"></i> Entrando...</>
                                ) : (
                                    <><i className="fas fa-sign-in-alt"></i> Entrar</>
                                )}
                            </button>
                        </form>
                    </div>
                ) : (
                    // Register Form
                    <div className="form-container">
                        <h2><i className="fas fa-user-plus"></i> Criar Conta</h2>

                        {showAdminVerify && !adminVerified && (
                            <div className="admin-verification">
                                <div className="alert alert-info">
                                    <i className="fas fa-info-circle"></i>
                                    Apenas administradores podem criar novas contas. Insira a senha do administrador.
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Senha do Administrador</label>
                                    <SenhaField
                                        value={adminSenha}
                                        onChange={(e) => setAdminSenha(e.target.value)}
                                        showSenha={showSenha}
                                    />
                                </div>

                                <button className="btn btn-primary" onClick={handleVerifyAdmin} disabled={loading}>
                                    {loading ? <><i className="fas fa-spinner fa-spin"></i> Verificando...</> : <><i className="fas fa-check"></i> Verificar</>}
                                </button>

                                <button
                                    className="btn btn-secondary"
                                    style={{ marginTop: '1rem' }}
                                    onClick={() => { setIsLogin(true); setShowAdminVerify(false); }}
                                >
                                    <i className="fas fa-times"></i> Cancelar
                                </button>
                            </div>
                        )}

                        {adminVerified && (
                            <form onSubmit={handleRegister}>
                                <div className="form-group">
                                    <label className="form-label">Perfil do Usuário</label>
                                    <div className="role-grid">
                                        {[
                                            { value: 'admin', label: 'Administrador', icon: 'fa-user-shield' },
                                            { value: 'supervisor', label: 'Supervisor', icon: 'fa-user-tie' },
                                            { value: 'inspetor', label: 'Inspetor', icon: 'fa-clipboard-check' },
                                            { value: 'inspetor_injecao', label: 'Inspetor de Injeção', icon: 'fa-cubes' },
                                            { value: 'consultor', label: 'Consultor', icon: 'fa-user-check' },
                                        ].map(role => (
                                            <div
                                                key={role.value}
                                                className={`role-option ${role.value} ${selectedRole === role.value ? 'selected' : ''}`}
                                                onClick={() => setSelectedRole(role.value)}
                                            >
                                                <i className={`fas ${role.icon}`}></i>
                                                <span>{role.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Nome Completo</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="Digite o nome completo"
                                        value={registerData.nome}
                                        onChange={(e) => setRegisterData(prev => ({ ...prev, nome: e.target.value }))}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Usuário</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="Digite o usuário"
                                        value={registerData.usuario}
                                        onChange={(e) => setRegisterData(prev => ({ ...prev, usuario: e.target.value }))}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Senha</label>
                                    <SenhaField
                                        value={registerData.senha}
                                        onChange={(e) => setRegisterData(prev => ({ ...prev, senha: e.target.value }))}
                                        showSenha={showSenha}
                                        placeholder="Crie uma senha forte"
                                        autoComplete="new-password"
                                    />
                                    <PasswordRequirements senha={registerSenhaTexto} />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Confirmar Senha</label>
                                    <SenhaField
                                        value={registerData.confirmSenha}
                                        onChange={(e) => setRegisterData(prev => ({ ...prev, confirmSenha: e.target.value }))}
                                        showSenha={showSenha}
                                        placeholder="Confirme a senha"
                                        autoComplete="new-password"
                                    />
                                </div>

                                <button type="submit" className="btn btn-primary" disabled={loading || !podeCriarConta}>
                                    {loading ? <><i className="fas fa-spinner fa-spin"></i> Criando...</> : <><i className="fas fa-user-plus"></i> Criar Conta</>}
                                </button>

                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ marginTop: '1rem' }}
                                    onClick={() => { setIsLogin(true); setAdminVerified(false); }}
                                >
                                    <i className="fas fa-arrow-left"></i> Voltar para Login
                                </button>
                            </form>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default Login;
