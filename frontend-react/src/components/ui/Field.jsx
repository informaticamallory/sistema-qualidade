import { useId } from 'react';
import './ui.css';

/* Campos de formulário do Mallory UI Kit: Input e Select.

   Ambos compartilham o mesmo invólucro (label em caixa alta acima, mensagem
   de erro abaixo) e reaproveitam .form-control do ui-kit. Estados cobertos:
   padrão, erro (borda e texto em --danger), desabilitado e somente-leitura
   (fundo --bg-2).

   O id é gerado com useId quando não informado, para o label continuar
   associado ao controle mesmo com vários campos iguais na mesma tela — sem
   isso, clicar no rótulo não foca o campo certo. */

function Envolucro({ id, label, required, error, hint, className = '', children }) {
    const classes = ['ui-field', error ? 'ui-field-error' : '', className]
        .filter(Boolean).join(' ');

    return (
        <div className={classes}>
            {label && (
                <label className="ui-field-label" htmlFor={id}>
                    {label}
                    {required && <span className="ui-field-required" aria-hidden="true">*</span>}
                </label>
            )}
            {children}
            {error && (
                /* role=alert para o leitor de tela anunciar o erro ao surgir */
                <span className="ui-field-message" role="alert">
                    <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
                    {error}
                </span>
            )}
            {!error && hint && <span className="ui-field-message" style={{ color: 'var(--fg-subtle)' }}>{hint}</span>}
        </div>
    );
}

export function Input({
    id, label, required = false, error = '', hint = '',
    className = '', wrapperClassName = '', mono = false, ...rest
}) {
    const gerado = useId();
    const campoId = id || gerado;
    return (
        <Envolucro id={campoId} label={label} required={required} error={error}
            hint={hint} className={wrapperClassName}>
            <input
                id={campoId}
                /* tnum: números com largura fixa, para valores e códigos não
                   dançarem enquanto se digita */
                className={['form-control', mono ? 'tnum' : '', className].filter(Boolean).join(' ')}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error ? `${campoId}-msg` : undefined}
                style={mono ? { fontFamily: 'var(--font-mono)' } : undefined}
                {...rest}
            />
        </Envolucro>
    );
}

export function Select({
    id, label, required = false, error = '', hint = '',
    options = [], placeholder = '', className = '', wrapperClassName = '', children, ...rest
}) {
    const gerado = useId();
    const campoId = id || gerado;
    return (
        <Envolucro id={campoId} label={label} required={required} error={error}
            hint={hint} className={wrapperClassName}>
            <select
                id={campoId}
                className={['form-control', className].filter(Boolean).join(' ')}
                aria-invalid={error ? 'true' : undefined}
                {...rest}
            >
                {placeholder && <option value="">{placeholder}</option>}
                {options.map((opcao) => (
                    <option key={opcao.value ?? opcao} value={opcao.value ?? opcao}>
                        {opcao.label ?? opcao}
                    </option>
                ))}
                {children}
            </select>
        </Envolucro>
    );
}

export default Input;
