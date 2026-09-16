"""A tela de Calibração e o Dashboard têm de dar o mesmo número.

O caso que falhava em produção: um equipamento cuja próxima calibração vence
em 10 dias aparecia como "Vencendo" na tela de Calibração e como 0 no card do
Dashboard.
"""
from datetime import date, timedelta

import pytest

from app.extensions import db
from app.models.calibracao import Equipamento, Calibracao
from app.routes.dashboard import _calibracao_status
from app.utils.calibracao import DIAS_ALERTA_VENCIMENTO, contar_situacoes, situacao_equipamento

HOJE = date.today()


@pytest.fixture()
def parque(app):
    """Três equipamentos, cada um com uma forma diferente de guardar as datas."""
    # 1. Só as datas no cadastro, sem nenhuma linha em `calibracoes`.
    #    É como vem quem foi importado de planilha.
    sem_linha = Equipamento(
        codigo='EQ-SEM-LINHA', nome='Paquímetro digital', ativo=True,
        data_ultima_calibracao=HOJE - timedelta(days=355),
        data_proxima_calibracao=HOJE + timedelta(days=10))

    # 2. Com calibração lançada há quase um ano, válida por mais 15 dias.
    com_linha = Equipamento(codigo='EQ-COM-LINHA', nome='Torquímetro', ativo=True)

    # 3. Em dia: vence daqui a muito tempo.
    em_dia = Equipamento(codigo='EQ-OK', nome='Micrômetro', ativo=True,
                         data_proxima_calibracao=HOJE + timedelta(days=200))

    db.session.add_all([sem_linha, com_linha, em_dia])
    db.session.commit()

    db.session.add(Calibracao(
        equipamento_id=com_linha.id,
        data_calibracao=HOJE - timedelta(days=350),
        data_validade=HOJE + timedelta(days=15),
        resultado='aprovado'))
    db.session.commit()

    return {'sem_linha': sem_linha, 'com_linha': com_linha, 'em_dia': em_dia}


def test_equipamento_sem_linha_de_calibracao_conta_como_vencendo(parque):
    """Era o furo principal: sem linha em `calibracoes`, ninguém o via."""
    assert situacao_equipamento(parque['sem_linha'], HOJE) == 'vencendo'


def test_contagem_do_parque(parque):
    stats = contar_situacoes(Equipamento.query.filter_by(ativo=True).all(), HOJE)
    assert stats['vencendo'] == 2
    assert stats['vencidos'] == 0
    assert stats['nunca_calibrados'] == 0
    assert stats['total_equipamentos'] == 3


def test_a_janela_e_a_mesma_nos_dois_lugares(parque):
    """O Dashboard classificava a linha com um 20 literal, solto no arquivo."""
    calibracao = Calibracao.query.one()
    assert _calibracao_status(calibracao) == 'vencendo'
    assert DIAS_ALERTA_VENCIMENTO == 20

    # Um dia além da janela sai da contagem, dos dois lados.
    calibracao.data_validade = HOJE + timedelta(days=DIAS_ALERTA_VENCIMENTO + 1)
    db.session.commit()
    assert _calibracao_status(calibracao) != 'vencendo'
    assert situacao_equipamento(parque['com_linha'], HOJE) == 'ok'


def test_filtro_de_periodo_nao_esconde_o_vencimento(parque):
    """A calibração foi feita há 350 dias; o Dashboard costuma olhar o mês.

    Contando linhas de `calibracoes` recortadas pelo período, o resultado era
    zero. Contando equipamentos, o período não interfere."""
    calibracoes_do_mes = Calibracao.query.filter(
        Calibracao.data_calibracao >= HOJE.replace(day=1)).all()
    assert calibracoes_do_mes == []

    stats = contar_situacoes(Equipamento.query.filter_by(ativo=True).all(), HOJE)
    assert stats['vencendo'] == 2


def test_o_calculo_antigo_daria_zero(parque):
    """Prova que o cenário do fixture é mesmo o bug relatado.

    Reproduz a conta que o Dashboard fazia — linhas de `calibracoes` do
    período, classificadas uma a uma — e confirma que ela responde 0 onde a
    tela de Calibração responde 2."""
    do_periodo = Calibracao.query.filter(
        Calibracao.data_calibracao >= HOJE.replace(day=1)).all()
    antigo = sum(1 for c in do_periodo if _calibracao_status(c) == 'vencendo')

    atual = contar_situacoes(Equipamento.query.filter_by(ativo=True).all(), HOJE)['vencendo']

    assert antigo == 0
    assert atual == 2


def test_equipamento_inativo_fica_de_fora(parque):
    parque['sem_linha'].ativo = False
    db.session.commit()

    stats = contar_situacoes(Equipamento.query.filter_by(ativo=True).all(), HOJE)
    assert stats['vencendo'] == 1
    assert stats['total_equipamentos'] == 2
