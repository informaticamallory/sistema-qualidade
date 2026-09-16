"""Disposição do lote: campo novo, e a leitura dos quatro campos antigos.

REL, SEI, DEV e LP eram quatro campos de texto livre, um por destino possível.
Viraram o select "Disposição". As colunas antigas ficaram no banco e a
conversão acontece na leitura.
"""
from datetime import date

import pytest

from app.extensions import db
from app.models.recebimento import DISPOSICOES, RelatorioRecebimento
from tests.conftest import SENHA_VALIDA


def _relatorio(**campos):
    padrao = {
        'data_entrada': date.today(),
        'data_inspecao': date.today(),
        'cod_sap': 'B00100',
        'fornecedor': 'FORNECEDOR ALFA',
        'inspetor': 'TESTE'
    }
    padrao.update(campos)
    registro = RelatorioRecebimento(**padrao)
    db.session.add(registro)
    db.session.commit()
    return registro


def _token(client):
    resp = client.post('/api/auth/login', json={'usuario': 'admin_ok', 'senha': SENHA_VALIDA})
    return resp.get_json()['data']['token']


@pytest.mark.parametrize('campo, esperado', [
    ('rel', 'Retrabalho'),
    ('sei', 'Seleção'),
    ('dev', 'Devolução'),
    ('lp', 'Lote Piloto')
])
def test_cada_campo_antigo_vira_sua_disposicao(app, campo, esperado):
    assert _relatorio(**{campo: 'X'}).disposicao_efetiva() == esperado


def test_registro_novo_manda_sobre_os_antigos(app):
    """Quem tem `disposicao` gravada não passa pela dedução."""
    registro = _relatorio(rel='X', disposicao='Devolução')
    assert registro.disposicao_efetiva() == 'Devolução'


def test_empate_resolve_pela_ordem(app):
    """Texto livre não impedia preencher mais de um. Vence o primeiro da lista."""
    assert _relatorio(sei='X', dev='X', lp='X').disposicao_efetiva() == 'Seleção'


def test_campo_so_com_espacos_nao_conta(app):
    assert _relatorio(rel='   ', dev='X').disposicao_efetiva() == 'Devolução'


def test_sem_nada_preenchido_fica_vazio(app):
    assert _relatorio().disposicao_efetiva() == ''


def test_os_quatro_valores_sao_os_da_tela(app):
    assert DISPOSICOES == ('Retrabalho', 'Seleção', 'Devolução', 'Lote Piloto')


def test_colunas_antigas_continuam_no_banco(app):
    """A conversão é de leitura: o conteúdo original não pode sumir."""
    registro = _relatorio(rel='RETRAB. 12 PCS')
    db.session.expire(registro)

    salvo = RelatorioRecebimento.query.get(registro.id)
    assert salvo.rel == 'RETRAB. 12 PCS'
    assert salvo.disposicao is None
    assert salvo.disposicao_efetiva() == 'Retrabalho'


# ── Pela API ────────────────────────────────────────────────────────────────

def test_api_grava_e_devolve_a_disposicao(client, admin_ok):
    headers = {'Authorization': f'Bearer {_token(client)}'}

    criado = client.post('/api/relatorio-recebimento', json={
        'data_entrada': date.today().isoformat(),
        'cod_sap': 'B00100',
        'fornecedor': 'FORNECEDOR ALFA',
        'qtd_nc': 3,
        'disposicao': 'Lote Piloto'
    }, headers=headers)
    assert criado.status_code == 201
    registro = criado.get_json()['data']
    assert registro['disposicao'] == 'Lote Piloto'

    alterado = client.put(f"/api/relatorio-recebimento/{registro['id']}",
                          json={'disposicao': 'Seleção'}, headers=headers)
    assert alterado.status_code == 200
    assert alterado.get_json()['data']['disposicao'] == 'Seleção'


def test_lista_sem_page_devolve_tudo(client, admin_ok, app):
    """Os cards contam no cliente sobre a lista recebida.

    A resposta vinha cortada em 50 por padrão, então "Total de entradas"
    empacaria nos 50 assim que a tabela passasse disso."""
    for i in range(55):
        _relatorio(cod_sap=f'B{i:05d}')

    headers = {'Authorization': f'Bearer {_token(client)}'}

    resp = client.get('/api/relatorio-recebimento', headers=headers)
    assert len(resp.get_json()['data']) == 55

    # Quem pedir página continua recebendo página.
    paginado = client.get('/api/relatorio-recebimento',
                          query_string={'page': 1, 'limit': 20}, headers=headers)
    assert len(paginado.get_json()['data']) == 20


def test_api_deduz_a_disposicao_de_registro_antigo(client, admin_ok, app):
    """Registro gravado antes da mudança: só `rel`, sem `disposicao`."""
    antigo = _relatorio(dev='X')

    resp = client.get(f'/api/relatorio-recebimento/{antigo.id}',
                      headers={'Authorization': f'Bearer {_token(client)}'})
    assert resp.status_code == 200

    dados = resp.get_json()['data']
    assert dados['disposicao'] == 'Devolução'
    # O campo antigo continua exposto para quem quiser conferir o original.
    assert dados['dev'] == 'X'
