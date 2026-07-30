export const TAMANHO_MINIMO = 8;
export const CARACTERES_ESPECIAIS = '!@#$%^&*(),.?":{}|<>';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const especialRegex = new RegExp(`[${escapeRegExp(CARACTERES_ESPECIAIS)}]`);

export const CRITERIOS_SENHA = [
    { chave: 'tamanho', label: `Mínimo de ${TAMANHO_MINIMO} caracteres`, checa: (s) => s.length >= TAMANHO_MINIMO },
    { chave: 'maiuscula', label: 'Uma letra maiúscula (A-Z)', checa: (s) => /[A-Z]/.test(s) },
    { chave: 'minuscula', label: 'Uma letra minúscula (a-z)', checa: (s) => /[a-z]/.test(s) },
    { chave: 'numero', label: 'Um número (0-9)', checa: (s) => /[0-9]/.test(s) },
    { chave: 'especial', label: `Um caractere especial (${CARACTERES_ESPECIAIS})`, checa: (s) => especialRegex.test(s) },
];

export function avaliarSenha(senha = '') {
    return CRITERIOS_SENHA.map((c) => ({ ...c, atendido: c.checa(senha) }));
}

export function senhaValida(senha = '') {
    return CRITERIOS_SENHA.every((c) => c.checa(senha));
}
