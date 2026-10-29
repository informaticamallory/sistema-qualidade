"""Quem pode trocar o inspetor de uma inspeção de injeção já gravada.

O caso real: o operador do turno B lançou a inspeção usando a conta do
turno A, e o registro ficou no nome errado. Corrigir é do administrador.

Regras em jogo:
  - o administrador troca o inspetor pela própria rota de edição;
  - os demais perfis editam o registro, mas não o inspetor;
  - reenviar o mesmo inspetor não é uma troca, e não pode ser barrado —
    é o que o formulário faz a cada salvamento comum.
"""
from datetime import date

import pytest

from app.extensions import db
from app.models.injecao import RegistroInjecao
from app.models.usuario import Usuario
from tests.conftest import SENHA_VALIDA


@pytest.fixture()
def inspetor(app):
    user = Usuario(nome='Marcos Silva', usuario='marcos_b',
                   role='inspetor', must_reset_password=False)
    user.set_senha(SENHA_VALIDA)
    db.session.add(user)
    db.session.commit()
    return user


def _headers(client, usuario='admin_ok'):
    resp = client.post('/api/auth/login', json={'usuario': usuario, 'senha': SENHA_VALIDA})
    token = resp.get_json()['data']['token']
    return {'Authorization': f'Bearer {token}'}


def _registro(inspetor_nome='Ana Souza'):
    """Registro completo: a validação da avaliação recai sobre o que já está
    gravado, então um PUT só com 'inspetor' passa pelas obrigatoriedades."""
    item = RegistroInjecao(
        data=date(2026, 10, 27), semana='W44', turno_injecao='A',
        maquina='INJ-07', molde='MLD-21', cod='B00100010', peca='TAMPA',
        amostra_insp=10, amostra_nc=0, qtde_lote=4800,
        visual='C', cor_padrao='C', encaixe='C',
        contra_peca='C', rebarbas='C', funcional='C',
        status='aprovado', inspetor=inspetor_nome
    )
    db.session.add(item)
    db.session.commit()
    return item


def test_admin_troca_o_inspetor_do_registro(client, admin_ok):
    registro = _registro()

    resp = client.put(f'/api/inspecao-injecao/{registro.id}',
                      json={'inspetor': 'Marcos Silva'},
                      headers=_headers(client))

    assert resp.status_code == 200, resp.get_json()
    assert db.session.get(RegistroInjecao, registro.id).inspetor == 'Marcos Silva'


def test_inspetor_nao_troca_o_inspetor_do_registro(client, admin_ok, inspetor):
    registro = _registro()

    resp = client.put(f'/api/inspecao-injecao/{registro.id}',
                      json={'inspetor': 'Marcos Silva'},
                      headers=_headers(client, 'marcos_b'))

    assert resp.status_code == 403
    assert db.session.get(RegistroInjecao, registro.id).inspetor == 'Ana Souza'


def test_editar_sem_mexer_no_inspetor_continua_liberado(client, admin_ok, inspetor):
    """O formulário reenvia o inspetor em todo salvamento. Mesmo valor não é
    troca, e barrar aqui impediria o inspetor de corrigir a própria inspeção."""
    registro = _registro()

    resp = client.put(f'/api/inspecao-injecao/{registro.id}',
                      json={'inspetor': 'Ana Souza', 'observacao': 'LOTE CONFERIDO'},
                      headers=_headers(client, 'marcos_b'))

    assert resp.status_code == 200, resp.get_json()
    salvo = db.session.get(RegistroInjecao, registro.id)
    assert salvo.inspetor == 'Ana Souza'
    assert salvo.observacao == 'LOTE CONFERIDO'
