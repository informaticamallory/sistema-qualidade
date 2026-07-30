import { avaliarSenha } from '../../utils/passwordValidation';
import './PasswordRequirements.css';

function PasswordRequirements({ senha }) {
    const criterios = avaliarSenha(senha);

    return (
        <ul className="password-requirements" aria-live="polite">
            {criterios.map((c) => (
                <li key={c.chave} className={c.atendido ? 'req-ok' : 'req-pending'}>
                    <i className={`fas ${c.atendido ? 'fa-check-circle' : 'fa-circle'}`}></i>
                    <span>{c.label}</span>
                </li>
            ))}
        </ul>
    );
}

export default PasswordRequirements;
