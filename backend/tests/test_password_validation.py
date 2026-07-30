from app.utils.password_validation import validar_senha, senha_valida, gerar_senha_temporaria


def test_senha_valida():
    assert validar_senha('Abc12345!') == []
    assert senha_valida('Abc12345!') is True


def test_senha_sem_maiuscula():
    erros = validar_senha('abc12345!')
    assert any('maiúscula' in e for e in erros)


def test_senha_sem_minuscula():
    erros = validar_senha('ABC12345!')
    assert any('minúscula' in e for e in erros)


def test_senha_sem_numero():
    erros = validar_senha('Abcdefgh!')
    assert any('número' in e for e in erros)


def test_senha_sem_caractere_especial():
    erros = validar_senha('Abc123456')
    assert any('especial' in e for e in erros)


def test_senha_tamanho_incorreto():
    erros_curta = validar_senha('Ab1!')
    assert any('8' in e for e in erros_curta)

    erros_vazia = validar_senha('')
    assert len(erros_vazia) > 0


def test_gerar_senha_temporaria_ja_atende_a_politica():
    senha = gerar_senha_temporaria()
    assert senha_valida(senha)
