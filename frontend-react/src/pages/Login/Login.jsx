import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import ThemeToggle from '../../components/ThemeToggle/ThemeToggle';
import { canAccess, defaultPathForUser } from '../../config/permissions';
import './Login.css';

function PinInput({ pins, setPins, refs, onPaste, onChange, onKeyDown, showPin, type = 'password' }) {
    return (
        <div className="pin-input-group">
            {[0, 1, 2, 3].map((i) => (
                <input
                    key={i}
                    ref={(el) => (refs.current[i] = el)}
                    type={showPin ? 'text' : type}
                    maxLength={1}
                    className="pin-digit"
                    value={pins[i]}
                    onChange={(e) => onChange(i, e.target.value, pins, setPins, refs)}
                    onKeyDown={(e) => onKeyDown(e, i, refs)}
                    onPaste={(e) => onPaste(e, setPins, refs)}
                    inputMode="numeric"
                />
            ))}
        </div>
    );
}

function Login() {
    const [isLogin, setIsLogin] = useState(true);
    const [showAdminVerify, setShowAdminVerify] = useState(false);
    const [adminVerified, setAdminVerified] = useState(false);
    const [showPin, setShowPin] = useState(false);
    const [loading, setLoading] = useState(false);
    const [alert, setAlert] = useState({ show: false, type: '', message: '' });
    const [selectedRole, setSelectedRole] = useState('supervisor');

    const [loginData, setLoginData] = useState({ usuario: '', pin: ['', '', '', ''] });
    const [registerData, setRegisterData] = useState({
        nome: '',
        usuario: '',
        pin: ['', '', '', ''],
        confirmPin: ['', '', '', '']
    });
    const [adminPin, setAdminPin] = useState(['', '', '', '']);

    const loginPinRefs = useRef([]);
    const adminPinRefs = useRef([]);
    const registerPinRefs = useRef([]);
    const confirmPinRefs = useRef([]);

    const navigate = useNavigate();
    const location = useLocation();
    const { login, register, verifyAdmin, user } = useAuth();

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

    const handlePinChange = (index, value, pins, setPins, refs) => {
        if (!/^\d*$/.test(value)) return;

        const newPins = [...pins];
        newPins[index] = value.slice(-1);

        // Atualizar o estado baseado no tipo de pins
        if (pins === loginData.pin) {
            setLoginData(prev => ({ ...prev, pin: newPins }));
        } else if (pins === registerData.pin) {
            setRegisterData(prev => ({ ...prev, pin: newPins }));
        } else if (pins === registerData.confirmPin) {
            setRegisterData(prev => ({ ...prev, confirmPin: newPins }));
        } else if (pins === adminPin) {
            setAdminPin(newPins);
        } else {
            setPins(newPins);
        }

        // Auto-focus no próximo campo
        if (value && index < 3) {
            setTimeout(() => {
                refs.current[index + 1]?.focus();
            }, 10);
        }
    };

    const handlePinKeyDown = (e, index, refs) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
            refs.current[index - 1]?.focus();
        }
    };

    const handlePinPaste = (e, setPins, refs) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').slice(0, 4);
        const newPins = pasted.split('').map(c => /\d/.test(c) ? c : '');
        while (newPins.length < 4) newPins.push('');
        setPins(newPins);
        if (pasted.length === 4) refs.current[3]?.focus();
    };

    const clearPins = (setPins, refs) => {
        setPins(['', '', '', '']);
        refs.current[0]?.focus();
    };

    const handleLogin = async (e) => {
        e.preventDefault();

        if (!loginData.usuario.trim()) {
            showAlert('error', 'Digite o usuário');
            return;
        }

        const pin = loginData.pin.join('');
        if (pin.length !== 4) {
            showAlert('error', 'Digite o PIN completo');
            return;
        }

        setLoading(true);
        const result = await login(loginData.usuario, pin);
        setLoading(false);

        if (result.success) {
            showAlert('success', 'Login realizado com sucesso!');
            setTimeout(() => {
                const destination = location.state?.from?.pathname;
                const fallback = defaultPathForUser(result.user);
                navigate(destination && canAccess(result.user, destination) ? destination : fallback);
            }, 1000);
        } else {
            showAlert('error', result.message || 'Usuário ou PIN inválido');
            clearPins(
                (newPins) => setLoginData(prev => ({ ...prev, pin: newPins })),
                loginPinRefs
            );
        }
    };

    const handleVerifyAdmin = async () => {
        const pin = adminPin.join('');
        if (pin.length !== 4) {
            showAlert('error', 'Digite o PIN completo do administrador');
            return;
        }

        setLoading(true);
        const result = await verifyAdmin(pin);
        setLoading(false);

        if (result.success) {
            setAdminVerified(true);
            setShowAdminVerify(false);
            showAlert('success', 'Verificação concluída. Preencha os dados do novo usuário');
        } else {
            showAlert('error', 'PIN de administrador inválido');
            clearPins(setAdminPin, adminPinRefs);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();

        if (!registerData.nome.trim() || !registerData.usuario.trim()) {
            showAlert('error', 'Preencha todos os campos');
            return;
        }

        const pin = registerData.pin.join('');
        const confirmPin = registerData.confirmPin.join('');

        if (pin.length !== 4) {
            showAlert('error', 'Digite o PIN completo');
            return;
        }

        if (pin !== confirmPin) {
            showAlert('error', 'Os PINs não coincidem');
            clearPins(
                (newPins) => setRegisterData(prev => ({ ...prev, confirmPin: newPins })),
                confirmPinRefs
            );
            return;
        }

        setLoading(true);
        const result = await register({
            nome: registerData.nome,
            usuario: registerData.usuario,
            pin,
            role: selectedRole
        });
        setLoading(false);

        if (result.success) {
            showAlert('success', 'Conta criada com sucesso!');
            setTimeout(() => {
                setIsLogin(true);
                setAdminVerified(false);
                setLoginData({ usuario: registerData.usuario, pin: ['', '', '', ''] });
                setRegisterData({ nome: '', usuario: '', pin: ['', '', '', ''], confirmPin: ['', '', '', ''] });
            }, 2000);
        } else {
            showAlert('error', result.message || 'Erro ao criar conta');
        }
    };

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

                {isLogin ? (
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
                                <label className="form-label">PIN de 4 Dígitos</label>
                                <div className="pin-container">
                                    <PinInput
                                        pins={loginData.pin}
                                        setPins={(newPins) => setLoginData(prev => ({ ...prev, pin: newPins }))}
                                        refs={loginPinRefs}
                                        onPaste={handlePinPaste}
                                        onChange={handlePinChange}
                                        onKeyDown={handlePinKeyDown}
                                        showPin={showPin}
                                    />
                                    <button
                                        type="button"
                                        className="pin-toggle-btn"
                                        onClick={() => setShowPin(!showPin)}
                                    >
                                        <i className={`fas fa-eye${showPin ? '-slash' : ''}`}></i>
                                        <span>{showPin ? 'Ocultar' : 'Mostrar'} PIN</span>
                                    </button>
                                </div>
                            </div>

                            <button type="submit" className="btn btn-primary" disabled={loading}>
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
                                    Apenas administradores podem criar novas contas. Insira o PIN do administrador.
                                </div>

                                <div className="form-group">
                                    <label className="form-label">PIN do Administrador</label>
                                    <PinInput
                                        pins={adminPin}
                                        setPins={setAdminPin}
                                        refs={adminPinRefs}
                                        onPaste={handlePinPaste}
                                        onChange={handlePinChange}
                                        onKeyDown={handlePinKeyDown}
                                        showPin={showPin}
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
                                    <label className="form-label">PIN de 4 Dígitos</label>
                                    <PinInput
                                        pins={registerData.pin}
                                        setPins={(newPins) => setRegisterData(prev => ({ ...prev, pin: newPins }))}
                                        refs={registerPinRefs}
                                        onPaste={handlePinPaste}
                                        onChange={handlePinChange}
                                        onKeyDown={handlePinKeyDown}
                                        showPin={showPin}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Confirmar PIN</label>
                                    <PinInput
                                        pins={registerData.confirmPin}
                                        setPins={(newPins) => setRegisterData(prev => ({ ...prev, confirmPin: newPins }))}
                                        refs={confirmPinRefs}
                                        onPaste={handlePinPaste}
                                        onChange={handlePinChange}
                                        onKeyDown={handlePinKeyDown}
                                        showPin={showPin}
                                    />
                                </div>

                                <button type="submit" className="btn btn-primary" disabled={loading}>
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

