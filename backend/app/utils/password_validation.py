# utils/password_validation.py - Regra de senha forte (substitui o PIN de 4 dígitos)
import re
import secrets
import string

TAMANHO_MINIMO = 8
TAMANHO_MAXIMO = 128
CARACTERES_ESPECIAIS = '!@#$%^&*(),.?":{}|<>'

# Regex equivalente às checagens abaixo (mantida como referência/documentação;
# a validação real é feita critério a critério para poder apontar o que falta).
SENHA_REGEX = re.compile(
    r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[' + re.escape(CARACTERES_ESPECIAIS) + r'])'
    r'.{' + str(TAMANHO_MINIMO) + r',' + str(TAMANHO_MAXIMO) + r'}$'
)

_CRITERIOS = (
    ('tamanho', lambda s: len(s) >= TAMANHO_MINIMO and len(s) <= TAMANHO_MAXIMO,
     f'A senha deve ter entre {TAMANHO_MINIMO} e {TAMANHO_MAXIMO} caracteres'),
    ('minuscula', lambda s: any(c.islower() for c in s),
     'A senha deve conter ao menos 1 letra minúscula'),
    ('maiuscula', lambda s: any(c.isupper() for c in s),
     'A senha deve conter ao menos 1 letra maiúscula'),
    ('numero', lambda s: any(c.isdigit() for c in s),
     'A senha deve conter ao menos 1 número'),
    ('especial', lambda s: any(c in CARACTERES_ESPECIAIS for c in s),
     f'A senha deve conter ao menos 1 caractere especial ({CARACTERES_ESPECIAIS})'),
)


def validar_senha(senha):
    """Retorna a lista de mensagens dos critérios NÃO atendidos.
    Lista vazia = senha válida."""
    if not senha or not isinstance(senha, str):
        return [msg for _, _, msg in _CRITERIOS]
    return [msg for _, checa, msg in _CRITERIOS if not checa(senha)]


def senha_valida(senha):
    return len(validar_senha(senha)) == 0


def gerar_senha_temporaria():
    """Gera uma senha aleatória que já atende a todos os critérios.
    Usada apenas no bootstrap do admin padrão, para não criar um usuário
    com senha fora da política nem depender de outro admin para resetá-la."""
    especial = secrets.choice(CARACTERES_ESPECIAIS)
    minuscula = secrets.choice(string.ascii_lowercase)
    maiuscula = secrets.choice(string.ascii_uppercase)
    numero = secrets.choice(string.digits)

    restante_len = TAMANHO_MINIMO - 4
    alfabeto = string.ascii_letters + string.digits
    restante = [secrets.choice(alfabeto) for _ in range(restante_len)]

    caracteres = [especial, minuscula, maiuscula, numero] + restante
    for i in range(len(caracteres) - 1, 0, -1):
        j = secrets.randbelow(i + 1)
        caracteres[i], caracteres[j] = caracteres[j], caracteres[i]

    return ''.join(caracteres)
