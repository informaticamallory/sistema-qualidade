"""Catálogo de defeitos: quem cria, quem administra e o vínculo N:N.

Regras em jogo:
  - ler a lista ativa e criar: qualquer usuário autenticado;
  - renomear, inativar e excluir: só quem tem o módulo 'defeitos';
  - inativo sai da lista de escolha sem apagar o histórico.
"""
from datetime import date

import pytest

from app.extensions import db
from app.models.defeito import Defeito
from app.models.recebimento import RelatorioRecebimento
from app.models.usuario import Usuario
from tests.conftest import SENHA_VALIDA


@pytest.fixture()
def inspetor(app):
    """Usuário comum: o papel 'inspetor' não recebe o módulo 'defeitos'."""
    user = Usuario(nome='Inspetor Teste', usuario='inspetor_teste',
                   role='inspetor', must_reset_password=False)
    user.set_senha(SENHA_VALIDA)
    db.session.add(user)
    db.session.commit()
    return user


def _token(client, usuario='admin_ok'):
    resp = client.post('/api/auth/login', json={'usuario': usuario, 'senha': SENHA_VALIDA})
    return resp.get_json()['data']['token']


def _headers(client, usuario='admin_ok'):
    return {'Authorization': f'Bearer {_token(client, usuario)}'}


def _defeito(nome, ativo=True, criado_por=None):
    item = Defeito(defeito=nome, ativo=ativo, criado_por=criado_por)
    db.session.add(item)
    db.session.commit()
    return item


# ── Criação pelo usuário comum (item 2) ─────────────────────────────────────

def test_usuario_comum_cria_defeito_e_ja_fica_ativo(client, inspetor):
    resp = client.post('/api/defeitos', json={'defeito': 'dimensional nc'},
                       headers=_headers(client, 'inspetor_teste'))
    assert resp.status_code == 201

    criado = resp.get_json()['data']
    assert criado['defeito'] == 'DIMENSIONAL NC'   # normalizado em maiúsculas
    assert criado['ativo'] is True
    assert criado['criado_por'] == 'Inspetor Teste'


def test_usuario_comum_ve_a_lista_ativa(client, inspetor, app):
    _defeito('DIMENSIONAL')
    _defeito('REBARBA', ativo=False)

    resp = client.get('/api/defeitos', headers=_headers(client, 'inspetor_teste'))
    nomes = [d['defeito'] for d in resp.get_json()['data']]

    assert nomes == ['DIMENSIONAL']


def test_defeito_repetido_nao_duplica(client, admin_ok, app):
    _defeito('DIMENSIONAL')
    resp = client.post('/api/defeitos', json={'defeito': ' dimensional '},
                       headers=_headers(client))
    assert resp.status_code == 400
    assert Defeito.query.count() == 1


def test_inativo_nao_e_reativado_por_quem_digita_o_nome(client, inspetor, app):
    """Inativar é decisão do administrador e não se desfaz sozinha."""
    _defeito('REBARBA', ativo=False)

    resp = client.post('/api/defeitos', json={'defeito': 'REBARBA'},
                       headers=_headers(client, 'inspetor_teste'))
    assert resp.status_code == 409
    assert Defeito.query.filter_by(defeito='REBARBA').one().ativo is False


# ── Gestão pelo administrador (item 3) ──────────────────────────────────────

def test_usuario_comum_nao_administra(client, inspetor, app):
    alvo = _defeito('DIMENSIONAL')
    headers = _headers(client, 'inspetor_teste')

    assert client.put(f'/api/defeitos/{alvo.id}',
                      json={'defeito': 'OUTRO'}, headers=headers).status_code == 403
    assert client.put(f'/api/defeitos/{alvo.id}',
                      json={'ativo': False}, headers=headers).status_code == 403
    assert client.delete(f'/api/defeitos/{alvo.id}', headers=headers).status_code == 403
    # E nem enxerga os inativos.
    assert client.get('/api/defeitos', query_string={'incluir_inativos': 1},
                      headers=headers).status_code == 403


def test_admin_renomeia_para_unificar_duplicidade(client, admin_ok, app):
    alvo = _defeito('DIMENSIONAL NC')

    resp = client.put(f'/api/defeitos/{alvo.id}',
                      json={'defeito': 'dimensional não conforme'},
                      headers=_headers(client))
    assert resp.status_code == 200
    assert resp.get_json()['data']['defeito'] == 'DIMENSIONAL NÃO CONFORME'


def test_renomear_para_nome_existente_e_recusado(client, admin_ok, app):
    _defeito('DIMENSIONAL')
    outro = _defeito('REBARBA')

    resp = client.put(f'/api/defeitos/{outro.id}', json={'defeito': 'DIMENSIONAL'},
                      headers=_headers(client))
    assert resp.status_code == 400


def test_admin_inativa_e_reativa(client, admin_ok, app):
    alvo = _defeito('REBARBA')
    headers = _headers(client)

    client.put(f'/api/defeitos/{alvo.id}', json={'ativo': False}, headers=headers)
    assert client.get('/api/defeitos', headers=headers).get_json()['data'] == []

    todos = client.get('/api/defeitos', query_string={'incluir_inativos': 1},
                       headers=headers).get_json()['data']
    assert [d['ativo'] for d in todos] == [False]

    client.put(f'/api/defeitos/{alvo.id}', json={'ativo': True}, headers=headers)
    assert len(client.get('/api/defeitos', headers=headers).get_json()['data']) == 1


# ── Vínculo N:N com o relatório (itens 4 e 5) ───────────────────────────────

def _relatorio_com(client, defeito_ids):
    return client.post('/api/relatorio-recebimento', json={
        'data_entrada': date.today().isoformat(),
        'cod_sap': 'B00100',
        'fornecedor': 'FORNECEDOR ALFA',
        'defeito_ids': defeito_ids
    }, headers=_headers(client))


def test_relatorio_guarda_varios_defeitos(client, admin_ok, app):
    a = _defeito('DIMENSIONAL')
    b = _defeito('REBARBA')

    resp = _relatorio_com(client, [a.id, b.id])
    assert resp.status_code == 201

    nomes = [d['defeito'] for d in resp.get_json()['data']['defeitos']]
    assert nomes == ['DIMENSIONAL', 'REBARBA']


def test_atualizacao_sem_defeito_ids_nao_apaga_o_que_ja_estava(client, admin_ok, app):
    a = _defeito('DIMENSIONAL')
    registro = _relatorio_com(client, [a.id]).get_json()['data']

    resp = client.put(f"/api/relatorio-recebimento/{registro['id']}",
                      json={'fornecedor': 'FORNECEDOR BETA'}, headers=_headers(client))
    assert [d['defeito'] for d in resp.get_json()['data']['defeitos']] == ['DIMENSIONAL']


def test_lista_vazia_desliga_todos(client, admin_ok, app):
    a = _defeito('DIMENSIONAL')
    registro = _relatorio_com(client, [a.id]).get_json()['data']

    resp = client.put(f"/api/relatorio-recebimento/{registro['id']}",
                      json={'defeito_ids': []}, headers=_headers(client))
    assert resp.get_json()['data']['defeitos'] == []


def test_inativar_nao_apaga_o_historico(client, admin_ok, app):
    """A razão de existir a inativação: o registro antigo continua íntegro."""
    a = _defeito('REBARBA')
    registro = _relatorio_com(client, [a.id]).get_json()['data']

    client.put(f'/api/defeitos/{a.id}', json={'ativo': False}, headers=_headers(client))

    lido = client.get(f"/api/relatorio-recebimento/{registro['id']}",
                      headers=_headers(client)).get_json()['data']
    assert [d['defeito'] for d in lido['defeitos']] == ['REBARBA']


def test_editar_registro_antigo_preserva_defeito_inativado(client, admin_ok, app):
    """Inativo não entra em registro novo, mas não some de onde já estava."""
    a = _defeito('DIMENSIONAL')
    b = _defeito('REBARBA')
    registro = _relatorio_com(client, [a.id, b.id]).get_json()['data']

    client.put(f'/api/defeitos/{b.id}', json={'ativo': False}, headers=_headers(client))

    resp = client.put(f"/api/relatorio-recebimento/{registro['id']}",
                      json={'defeito_ids': [a.id, b.id]}, headers=_headers(client))
    assert [d['defeito'] for d in resp.get_json()['data']['defeitos']] == ['DIMENSIONAL', 'REBARBA']

    # Já num registro novo, o inativo é descartado.
    novo = _relatorio_com(client, [a.id, b.id]).get_json()['data']
    assert [d['defeito'] for d in novo['defeitos']] == ['DIMENSIONAL']


def test_excluir_defeito_em_uso_e_recusado(client, admin_ok, app):
    a = _defeito('DIMENSIONAL')
    _relatorio_com(client, [a.id])

    resp = client.delete(f'/api/defeitos/{a.id}', headers=_headers(client))
    assert resp.status_code == 409
    assert Defeito.query.get(a.id) is not None

    # Sem uso, a exclusão passa.
    livre = _defeito('REBARBA')
    assert client.delete(f'/api/defeitos/{livre.id}',
                         headers=_headers(client)).status_code == 200


def test_gestao_informa_quantos_registros_usam_cada_defeito(client, admin_ok, app):
    a = _defeito('DIMENSIONAL')
    _defeito('REBARBA')
    _relatorio_com(client, [a.id])
    _relatorio_com(client, [a.id])

    dados = client.get('/api/defeitos', query_string={'incluir_inativos': 1},
                       headers=_headers(client)).get_json()['data']
    usos = {d['defeito']: d['em_uso'] for d in dados}
    assert usos == {'DIMENSIONAL': 2, 'REBARBA': 0}
