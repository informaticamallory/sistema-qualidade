import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import ThemeToggle from '../../components/ThemeToggle/ThemeToggle';
import PasswordRequirements from '../../components/PasswordRequirements/PasswordRequirements';
import { senhaValida } from '../../utils/passwordValidation';
import { canAccess, defaultPathForUser } from '../../config/permissions';
import MarcaMallory from './MarcaMallory';
import { arteLogin } from './recursos';
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
    const [ajudaSenhaAberta, setAjudaSenhaAberta] = useState(false);

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

    /* Trava de envio duplo. O `disabled` do botão já cobre o clique repetido,
       mas não cobre o Enter disparado duas vezes antes do primeiro render
       com loading=true. */
    const enviando = useRef(false);

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
        if (enviando.current) return;

        if (!loginData.usuario.trim()) {
            showAlert('error', 'Digite o usuário');
            return;
        }

        const senha = loginData.senha;
        if (!senha) {
            showAlert('error', 'Digite sua senha');
            return;
        }

        enviando.current = true;
        setLoading(true);
        const result = await login(loginData.usuario, senha);
        setLoading(false);
        enviando.current = false;

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
        if (enviando.current) return;

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

        enviando.current = true;
        setLoading(true);
        const result = await completeLegacyPasswordReset(resetToken, senha);
        setLoading(false);
        enviando.current = false;

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

    const registerSenhaTexto = registerData.senha;
    const podeEntrar = loginData.usuario.trim() && loginData.senha.length > 0;
    const podeCriarConta = registerData.nome.trim() && registerData.usuario.trim() && senhaValida(registerSenhaTexto);

    /* O aviso ocupa o mesmo lugar nos três formulários, então vive aqui. */
    const aviso = alert.show && (
        <div className={`alert alert-${alert.type} login-aviso`} role="status">
            <i className={`fas fa-${alert.type === 'success' ? 'check-circle' : alert.type === 'error' ? 'times-circle' : 'info-circle'}`} aria-hidden="true"></i>
            {alert.message}
        </div>
    );

    return (
        <div className="login-tela">
            <ThemeToggle variant="floating" />

            {/* O palco tem a proporção exata da arte e cobre a tela inteira.
                É o que permite ancorar o cartão em porcentagem da IMAGEM, e
                não da janela: assim ele acompanha a arte em qualquer tamanho
                de tela, em vez de descolar dela. */}
            <div className="login-palco">
                <img
                    className="login-arte"
                    src={arteLogin}
                    alt=""
                    aria-hidden="true"
                    width="1671"
                    height="941"
                />

                <div className="login-cartao">
                    {resetToken ? (
                        <>
                            <header className="login-cartao-topo">
                                <h1>Definir nova senha</h1>
                                <p>Sua senha precisa ser atualizada antes de continuar</p>
                            </header>

                            {aviso}

                            <form onSubmit={handleLegacyPasswordReset}>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="reset-senha">Nova senha</label>
                                    <input
                                        id="reset-senha"
                                        type={showSenha ? 'text' : 'password'}
                                        className="form-control"
                                        value={resetData.senha}
                                        onChange={(e) => setResetData(prev => ({ ...prev, senha: e.target.value }))}
                                        placeholder="Digite a nova senha"
                                        autoComplete="new-password"
                                    />
                                    <PasswordRequirements senha={resetData.senha} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="reset-confirma">Confirmar nova senha</label>
                                    <input
                                        id="reset-confirma"
                                        type={showSenha ? 'text' : 'password'}
                                        className="form-control"
                                        value={resetData.confirmSenha}
                                        onChange={(e) => setResetData(prev => ({ ...prev, confirmSenha: e.target.value }))}
                                        placeholder="Confirme a nova senha"
                                        autoComplete="new-password"
                                    />
                                </div>
                                <button type="button" className="pin-toggle-btn" onClick={() => setShowSenha(!showSenha)}>
                                    <i className={`fas fa-eye${showSenha ? '-slash' : ''}`} aria-hidden="true"></i>
                                    <span>{showSenha ? 'Ocultar' : 'Mostrar'} senha</span>
                                </button>
                                <button type="submit" className="login-botao" disabled={loading}>
                                    {loading
                                        ? <><i className="fas fa-spinner fa-spin" aria-hidden="true"></i> Salvando...</>
                                        : <><i className="fas fa-check" aria-hidden="true"></i> Atualizar senha</>}
                                </button>
                            </form>
                        </>
                    ) : isLogin ? (
                        <>
                            <header className="login-cartao-topo">
                                <h1>Acesse o CQM</h1>
                                <p>Informe seus dados para continuar</p>
                            </header>

                            {aviso}

                            <form onSubmit={handleLogin} noValidate>
                                <div className="login-campo">
                                    <label className="login-campo-rotulo" htmlFor="login-usuario">Usuário</label>
                                    <i className="fas fa-user login-campo-icone" aria-hidden="true"></i>
                                    <input
                                        id="login-usuario"
                                        type="text"
                                        className="login-input"
                                        placeholder="Usuário"
                                        autoComplete="username"
                                        value={loginData.usuario}
                                        onChange={(e) => setLoginData(prev => ({ ...prev, usuario: e.target.value }))}
                                    />
                                </div>

                                <div className="login-campo">
                                    <label className="login-campo-rotulo" htmlFor="login-senha">Senha</label>
                                    <i className="fas fa-lock login-campo-icone" aria-hidden="true"></i>
                                    <input
                                        id="login-senha"
                                        type={showSenha ? 'text' : 'password'}
                                        className="login-input"
                                        placeholder="Senha"
                                        autoComplete="current-password"
                                        value={loginData.senha}
                                        onChange={(e) => setLoginData(prev => ({ ...prev, senha: e.target.value }))}
                                    />
                                    <button
                                        type="button"
                                        className="login-olho"
                                        onClick={() => setShowSenha(!showSenha)}
                                        aria-label={showSenha ? 'Ocultar senha' : 'Mostrar senha'}
                                        aria-pressed={showSenha}
                                    >
                                        <i className={`fas fa-eye${showSenha ? '' : '-slash'}`} aria-hidden="true"></i>
                                    </button>
                                </div>

                                <button type="submit" className="login-botao" disabled={loading || !podeEntrar}>
                                    {loading ? (
                                        <><i className="fas fa-spinner fa-spin" aria-hidden="true"></i> Entrando...</>
                                    ) : (
                                        <><i className="fas fa-right-to-bracket" aria-hidden="true"></i> Entrar no CQM</>
                                    )}
                                </button>
                            </form>

                            {/* Não existe redefinição por conta própria no CQM: o
                                backend só tem o reset forçado por um administrador
                                (must_reset_password). Em vez de um link que não
                                leva a lugar nenhum, o botão abre a instrução real. */}
                            <button
                                type="button"
                                className="login-esqueci"
                                onClick={() => setAjudaSenhaAberta((aberta) => !aberta)}
                                aria-expanded={ajudaSenhaAberta}
                                aria-controls="login-ajuda-senha"
                            >
                                <i className="fas fa-key" aria-hidden="true"></i>
                                <span>Esqueceu sua senha?</span>
                            </button>

                            <div id="login-ajuda-senha" className="login-ajuda" hidden={!ajudaSenhaAberta}>
                                <p>
                                    A redefinição é feita por um administrador do CQM, na tela
                                    de <strong>Usuários</strong>. Procure o responsável pela
                                    qualidade ou a área de informática.
                                </p>
                                <p>
                                    Na próxima entrada o sistema vai pedir que você crie uma
                                    senha nova, só sua.
                                </p>
                            </div>

                            <footer className="login-cartao-rodape">
                                <MarcaMallory tom="laranja" tamanho="p" titulo="Mallory" />
                            </footer>
                        </>
                    ) : (
                        <>
                            <header className="login-cartao-topo">
                                <h1>Criar conta</h1>
                                <p>Apenas administradores podem cadastrar usuários</p>
                            </header>

                            {aviso}

                            {showAdminVerify && !adminVerified && (
                                <div className="admin-verification">
                                    <div className="alert alert-info">
                                        <i className="fas fa-info-circle" aria-hidden="true"></i>
                                        Apenas administradores podem criar novas contas. Insira a senha do administrador.
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label" htmlFor="admin-senha">Senha do Administrador</label>
                                        <input
                                            id="admin-senha"
                                            type={showSenha ? 'text' : 'password'}
                                            className="form-control"
                                            value={adminSenha}
                                            onChange={(e) => setAdminSenha(e.target.value)}
                                            placeholder="Digite sua senha"
                                            autoComplete="current-password"
                                        />
                                    </div>

                                    <button type="button" className="login-botao" onClick={handleVerifyAdmin} disabled={loading}>
                                        {loading
                                            ? <><i className="fas fa-spinner fa-spin" aria-hidden="true"></i> Verificando...</>
                                            : <><i className="fas fa-check" aria-hidden="true"></i> Verificar</>}
                                    </button>

                                    <button
                                        type="button"
                                        className="btn btn-secondary login-botao-secundario"
                                        onClick={() => { setIsLogin(true); setShowAdminVerify(false); }}
                                    >
                                        <i className="fas fa-times" aria-hidden="true"></i> Cancelar
                                    </button>
                                </div>
                            )}

                            {adminVerified && (
                                <form onSubmit={handleRegister}>
                                    <div className="form-group">
                                        <span className="form-label" id="rotulo-perfil">Perfil do Usuário</span>
                                        <div className="role-grid" role="radiogroup" aria-labelledby="rotulo-perfil">
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
                                                    role="radio"
                                                    tabIndex={0}
                                                    aria-checked={selectedRole === role.value}
                                                    onClick={() => setSelectedRole(role.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            setSelectedRole(role.value);
                                                        }
                                                    }}
                                                >
                                                    <i className={`fas ${role.icon}`} aria-hidden="true"></i>
                                                    <span>{role.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label" htmlFor="registro-nome">Nome Completo</label>
                                        <input
                                            id="registro-nome"
                                            type="text"
                                            className="form-control"
                                            placeholder="Digite o nome completo"
                                            value={registerData.nome}
                                            onChange={(e) => setRegisterData(prev => ({ ...prev, nome: e.target.value }))}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label" htmlFor="registro-usuario">Usuário</label>
                                        <input
                                            id="registro-usuario"
                                            type="text"
                                            className="form-control"
                                            placeholder="Digite o usuário"
                                            value={registerData.usuario}
                                            onChange={(e) => setRegisterData(prev => ({ ...prev, usuario: e.target.value }))}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label" htmlFor="registro-senha">Senha</label>
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
                                        <label className="form-label" htmlFor="registro-confirma">Confirmar Senha</label>
                                        <SenhaField
                                            value={registerData.confirmSenha}
                                            onChange={(e) => setRegisterData(prev => ({ ...prev, confirmSenha: e.target.value }))}
                                            showSenha={showSenha}
                                            placeholder="Confirme a senha"
                                            autoComplete="new-password"
                                        />
                                    </div>

                                    <button type="submit" className="login-botao" disabled={loading || !podeCriarConta}>
                                        {loading
                                            ? <><i className="fas fa-spinner fa-spin" aria-hidden="true"></i> Criando...</>
                                            : <><i className="fas fa-user-plus" aria-hidden="true"></i> Criar Conta</>}
                                    </button>

                                    <button
                                        type="button"
                                        className="btn btn-secondary login-botao-secundario"
                                        onClick={() => { setIsLogin(true); setAdminVerified(false); }}
                                    >
                                        <i className="fas fa-arrow-left" aria-hidden="true"></i> Voltar para Login
                                    </button>
                                </form>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Login;
