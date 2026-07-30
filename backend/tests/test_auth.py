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


def test_login_bloqueado_para_pin_legado(client, usuario_pin_legado):
    """Mesmo com o PIN antigo correto, o login deve ser bloqueado e pedir
    para contatar um administrador, por causa de must_reset_password."""
    resp = client.post('/api/auth/login', json={'usuario': 'legado', 'senha': '1234'})
    body = resp.get_json()
    assert resp.status_code == 403
    assert body['success'] is False
    assert 'administrador' in body['message'].lower()


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
