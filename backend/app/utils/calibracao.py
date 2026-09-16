# utils/calibracao.py - Regra única de vencimento de calibração
#
# Existe porque a tela de Calibração e o Dashboard respondiam coisas
# diferentes para a mesma pergunta: a primeira olhava o equipamento, o segundo
# contava linhas da tabela de calibrações. Equipamento cadastrado só com as
# datas, sem nenhuma calibração lançada, aparecia numa tela e sumia na outra.
#
# Quem quiser saber a situação de calibração de um equipamento usa daqui.
from datetime import date

# Dias de antecedência para considerar uma calibração "vencendo".
DIAS_ALERTA_VENCIMENTO = 20


def data_vencimento(equipamento):
    """Data em que a calibração do equipamento vence, ou None.

    A calibração mais recente manda. Na falta dela vale a
    `data_proxima_calibracao` do próprio cadastro: equipamento vindo de
    planilha costuma ter só as duas datas, sem linha em `calibracoes`, e
    ignorar esse caso deixava o equipamento fora de qualquer contagem.
    """
    ultima = equipamento.ultima_calibracao()
    if ultima and ultima.data_validade:
        return ultima.data_validade
    return equipamento.data_proxima_calibracao


def dias_restantes(equipamento, hoje=None):
    """Dias até o vencimento. None quando não há data nenhuma."""
    validade = data_vencimento(equipamento)
    if not validade:
        return None
    return (validade - (hoje or date.today())).days


def situacao_equipamento(equipamento, hoje=None):
    """'nunca', 'vencida', 'vencendo' ou 'ok'."""
    dias = dias_restantes(equipamento, hoje)
    if dias is None:
        return 'nunca'
    if dias < 0:
        return 'vencida'
    if dias <= DIAS_ALERTA_VENCIMENTO:
        return 'vencendo'
    return 'ok'


def contar_situacoes(equipamentos, hoje=None):
    """Contagem por situação, no formato que a tela de Calibração já consome.

    'calibrados' inclui os que estão vencendo: eles têm calibração válida, só
    perto do fim. É o que os cards daquela tela sempre mostraram.
    """
    hoje = hoje or date.today()
    stats = {
        'total_equipamentos': len(equipamentos),
        'calibrados': 0,
        'vencendo': 0,
        'vencidos': 0,
        'nunca_calibrados': 0
    }

    for equipamento in equipamentos:
        situacao = situacao_equipamento(equipamento, hoje)
        if situacao == 'nunca':
            stats['nunca_calibrados'] += 1
        elif situacao == 'vencida':
            stats['vencidos'] += 1
        elif situacao == 'vencendo':
            stats['vencendo'] += 1
            stats['calibrados'] += 1
        else:
            stats['calibrados'] += 1

    return stats
