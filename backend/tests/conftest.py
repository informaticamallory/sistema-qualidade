import pytest

from app import create_app
from app.extensions import db
from app.models.usuario import Usuario

SENHA_VALIDA = 'Abc12345!'


@pytest.fixture()
def app():
    app = create_app('testing')
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def admin_ok(app):
    """Admin já migrado para a nova política de senha (must_reset_password=False)."""
    user = Usuario(nome='Admin', usuario='admin_ok', role='admin', must_reset_password=False)
    user.set_senha(SENHA_VALIDA)
    db.session.add(user)
    db.session.commit()
    return user


@pytest.fixture()
def usuario_pin_legado(app):
    """Simula um usuário que ainda está no PIN antigo de 4 dígitos."""
    user = Usuario(nome='Legado', usuario='legado', role='inspetor', must_reset_password=True)
    user.set_senha('1234')
    db.session.add(user)
    db.session.commit()
    return user
