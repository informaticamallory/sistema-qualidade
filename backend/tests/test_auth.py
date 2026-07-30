from tests.conftest import SENHA_VALIDA


def test_login_com_senha_valida(client, admin_ok):
    resp = client.post('/api/auth/login', json={'usuario': 'admin_ok', 'senha': SENHA_VALIDA})
    body = resp.get_json()
    assert resp.status_code == 200
    assert body['success'] is True
    assert 'token' in body['data']


def test_login_com_senha_incorreta(client, admin_ok):
    resp = client.post('/api/auth/login', json={'usuario': 'admin_ok', 'senha': 'SenhaErrada1!'})
    body = resp.get_json()
    assert resp.status_code == 401
    assert body['success'] is False


def test_login_legado_exige_redefinicao_de_senha(client, usuario_pin_legado):
    resp = client.post('/api/auth/login', json={'usuario': 'legado', 'senha': '1234'})
    body = resp.get_json()
    assert resp.status_code == 403
    assert body['success'] is False
    assert body['data']['password_reset_required'] is True
    assert body['data']['password_reset_token']


def test_usuario_legado_redefine_senha_e_consegue_entrar(client, usuario_pin_legado):
    login = client.post('/api/auth/login', json={'usuario': 'legado', 'senha': '1234'}).get_json()
    reset_token = login['data']['password_reset_token']

    reset = client.post(
        '/api/auth/redefinir-senha-legado',
        json={'senha': SENHA_VALIDA},
        headers={'Authorization': f'Bearer {reset_token}'}
    )
    assert reset.status_code == 200
    assert reset.get_json()['success'] is True

    assert client.post('/api/auth/login', json={'usuario': 'legado', 'senha': '1234'}).status_code == 401
    assert client.post('/api/auth/login', json={'usuario': 'legado', 'senha': SENHA_VALIDA}).status_code == 200


def test_register_rejeita_senha_sem_maiuscula(client, admin_ok):
    token = client.post('/api/auth/login', json={'usuario': 'admin_ok', 'senha': SENHA_VALIDA}).get_json()['data']['token']
    resp = client.post(
        '/api/auth/register',
        json={'nome': 'Novo', 'usuario': 'novo1', 'senha': 'abc12345!', 'role': 'inspetor'},
        headers={'Authorization': f'Bearer {token}'}
    )
    body = resp.get_json()
    assert resp.status_code == 400
    assert any('maiúscula' in e for e in body['errors'])


def test_register_aceita_senha_valida(client, admin_ok):
    token = client.post('/api/auth/login', json={'usuario': 'admin_ok', 'senha': SENHA_VALIDA}).get_json()['data']['token']
    resp = client.post(
        '/api/auth/register',
        json={'nome': 'Novo', 'usuario': 'novo2', 'senha': 'Xy9!zzzz', 'role': 'inspetor'},
        headers={'Authorization': f'Bearer {token}'}
    )
    body = resp.get_json()
    assert resp.status_code == 201
    assert body['success'] is True

    login_resp = client.post('/api/auth/login', json={'usuario': 'novo2', 'senha': 'Xy9!zzzz'})
    assert login_resp.status_code == 200
