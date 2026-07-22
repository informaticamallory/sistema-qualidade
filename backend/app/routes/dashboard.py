# routes/dashboard.py - Rotas de dashboard e estatísticas
from flask import Blueprint, current_app, request
from datetime import datetime, timedelta

from app.extensions import db
from app.models.registro import RegistroInspecao
from app.models.injecao import RegistroInjecao
from app.models.recebimento import FichaRecebimento, RelatorioRecebimento
from app.models.cartao import CartaoQualidade
from app.models.calibracao import Equipamento, Calibracao
from app.models.q49 import Q49Registro
from app.utils.responses import create_response
from app.utils.auth_decorators import permission_required

dashboard_bp = Blueprint('dashboard', __name__)

REPROVADO_STATUS = ('reprovado', 'reprovada', 'nao conforme', 'não conforme', 'nao_conforme', 'nc')
TURNOS_LEGADOS = {
    '2': 'C'
}


def _normalizar_status(status):
    return (status or 'pendente').lower()

def _normalizar_turno(turno):
    valor = str(turno or '').strip().upper()
    return TURNOS_LEGADOS.get(valor, valor)

def _label_turno(turno):
    turno_normalizado = _normalizar_turno(turno)
    return f'Turno {turno_normalizado}' if turno_normalizado else None


def _normalizar_data(data):
    return data.isoformat() if data else None


def _data_sort(item):
    data = item.get('data_inspecao')
    return data or '0000-00-00'


def _montagem_to_dashboard(reg):
    return {
        'key': f"montagem-{reg.id}",
        'id': reg.id,
        'tipo': 'Montagem',
        'cod_sap': reg.cod_sap,
        'modelo': reg.modelo or reg.descricao_sap,
        'linha': reg.linha_montagem or reg.linha,
        'data_inspecao': _normalizar_data(reg.data_inspecao),
        'status': _normalizar_status(reg.status),
        'inspetor': reg.inspetor,
        'detail_url': '/registros/montagem'
    }


def _injecao_to_dashboard(reg):
    return {
        'key': f"injecao-{reg.id}",
        'id': reg.id,
        'tipo': 'Injeção',
        'cod_sap': reg.cod,
        'modelo': reg.peca,
        'linha': reg.maquina,
        'data_inspecao': _normalizar_data(reg.data),
        'status': _normalizar_status(reg.status),
        'inspetor': reg.inspetor,
        'detail_url': '/registros/injecao'
    }


def _ficha_recebimento_to_dashboard(reg):
    return {
        'key': f"recebimento-{reg.id}",
        'id': reg.id,
        'tipo': 'Recebimento',
        'cod_sap': reg.codigo,
        'modelo': reg.componente or reg.aplicacao,
        'linha': reg.setor,
        'data_inspecao': _normalizar_data(reg.data_inspecao),
        'status': _normalizar_status(reg.status),
        'inspetor': reg.inspetor,
        'detail_url': '/registros/recebimento'
    }


def _relatorio_recebimento_to_dashboard(reg):
    return {
        'key': f"entrada-mp-{reg.id}",
        'id': reg.id,
        'tipo': 'Entrada MP',
        'cod_sap': reg.cod_sap,
        'modelo': reg.descricao_sap,
        'linha': reg.fornecedor,
        'data_inspecao': _normalizar_data(reg.data_inspecao),
        'status': _normalizar_status(reg.status_material),
        'inspetor': reg.inspetor,
        'detail_url': '/registros/relatorio-recebimento'
    }

def _q49_status(reg):
    return _normalizar_status(reg.status_dashboard())


def _q49_to_dashboard(reg):
    return {
        'key': f"q49-{reg.id}",
        'id': reg.id,
        'tipo': 'Produto Importado (Q49)',
        'cod_sap': reg.codigo_sap,
        'modelo': reg.modelo or reg.descricao_sap,
        'linha': reg.linha or reg.fornecedor,
        'data_inspecao': _normalizar_data(reg.data_china),
        'status': _q49_status(reg),
        'inspetor': reg.inspetor or reg.inspetor_china,
        'detail_url': '/registro/produto-importado'
    }


def _cartao_to_dashboard(reg):
    return {
        'key': f"cartao-{reg.id}",
        'id': reg.id,
        'tipo': 'Cartão de Qualidade',
        'cod_sap': reg.codigo_produto,
        'modelo': reg.nome_produto,
        'linha': reg.setor,
        'data_inspecao': _normalizar_data(reg.created_at),
        'status': _normalizar_status(reg.status),
        'inspetor': reg.responsavel,
        'detail_url': '/cartoes'
    }


def _calibracao_status(reg):
    hoje = datetime.now().date()
    if reg.data_validade and reg.data_validade < hoje:
        return 'vencida'
    if reg.data_validade and (reg.data_validade - hoje).days <= 20:
        return 'vencendo'
    return _normalizar_status(reg.resultado or 'aprovado')


def _calibracao_to_dashboard(reg):
    equipamento = reg.equipamento_rel
    return {
        'key': f"calibracao-{reg.id}",
        'id': reg.id,
        'tipo': 'Calibração',
        'cod_sap': equipamento.codigo if equipamento else None,
        'modelo': equipamento.nome if equipamento else reg.numero_certificado,
        'linha': equipamento.setor if equipamento else reg.laboratorio,
        'data_inspecao': _normalizar_data(reg.data_calibracao),
        'status': _calibracao_status(reg),
        'inspetor': reg.responsavel,
        'detail_url': '/calibracao'
    }


def _contar_status(status_counts, status):
    status = _normalizar_status(status)
    status_counts[status] = status_counts.get(status, 0) + 1



def _is_reprovado(column):
    return db.func.lower(db.func.coalesce(column, '')).in_(REPROVADO_STATUS)


def _merge_counts(rows, limit=10):
    merged = {}
    for label, total in rows:
        label = label or 'N/A'
        merged[label] = merged.get(label, 0) + int(total or 0)

    return [
        {'label': label, 'value': value}
        for label, value in sorted(merged.items(), key=lambda item: item[1], reverse=True)[:limit]
    ]


def _dataset(dataset_id, title, rows, default_chart='bar', supported_charts=None, icon='fa-chart-bar', description=None):
    supported = supported_charts or ['bar', 'horizontalBar', 'line', 'pie', 'doughnut']
    return {
        'id': dataset_id,
        'title': title,
        'description': description or title,
        'labels': [row.get('label') for row in rows],
        'values': [int(row.get('value') or 0) for row in rows],
        'rows': rows,
        'defaultChart': default_chart,
        'supportedCharts': supported,
        'icon': icon
    }


def _metric(metric_id, title, value, icon, tone='primary', suffix=''):
    return {
        'id': metric_id,
        'title': title,
        'value': value,
        'suffix': suffix,
        'icon': icon,
        'tone': tone
    }


def _codigo_nome(codigo, nome):
    codigo = codigo or 'Sem código'
    nome = nome or 'Sem descrição'
    return f'{codigo} - {nome}'
@dashboard_bp.route('/stats', methods=['GET'])
@permission_required('dashboard', 'visualizar')
def get_dashboard_stats():
    """Estatísticas para dashboard"""
    try:
        hoje = datetime.now().date()
        primeiro_dia_mes = hoje.replace(day=1)
        data_limite = hoje - timedelta(days=30)

        total_registros = (
            RegistroInspecao.query.count()
            + RegistroInjecao.query.count()
            + FichaRecebimento.query.count()
            + RelatorioRecebimento.query.count()
            + Q49Registro.query.count()
            + CartaoQualidade.query.count()
            + Calibracao.query.count()
        )

        registros_mes = (
            RegistroInspecao.query.filter(RegistroInspecao.data_inspecao >= primeiro_dia_mes).count()
            + RegistroInjecao.query.filter(RegistroInjecao.data >= primeiro_dia_mes).count()
            + FichaRecebimento.query.filter(FichaRecebimento.data_inspecao >= primeiro_dia_mes).count()
            + RelatorioRecebimento.query.filter(RelatorioRecebimento.data_inspecao >= primeiro_dia_mes).count()
            + Q49Registro.query.filter(Q49Registro.data_china >= primeiro_dia_mes).count()
            + CartaoQualidade.query.filter(CartaoQualidade.created_at >= datetime.combine(primeiro_dia_mes, datetime.min.time())).count()
            + Calibracao.query.filter(Calibracao.data_calibracao >= primeiro_dia_mes).count()
        )

        status_counts = {}
        for status, count in db.session.query(RegistroInspecao.status, db.func.count(RegistroInspecao.id)).group_by(RegistroInspecao.status).all():
            status_counts[_normalizar_status(status)] = status_counts.get(_normalizar_status(status), 0) + count
        for status, count in db.session.query(RegistroInjecao.status, db.func.count(RegistroInjecao.id)).group_by(RegistroInjecao.status).all():
            status_counts[_normalizar_status(status)] = status_counts.get(_normalizar_status(status), 0) + count
        for status, count in db.session.query(FichaRecebimento.status, db.func.count(FichaRecebimento.id)).group_by(FichaRecebimento.status).all():
            status_counts[_normalizar_status(status)] = status_counts.get(_normalizar_status(status), 0) + count
        for status, count in db.session.query(RelatorioRecebimento.status_material, db.func.count(RelatorioRecebimento.id)).group_by(RelatorioRecebimento.status_material).all():
            status_counts[_normalizar_status(status)] = status_counts.get(_normalizar_status(status), 0) + count
        for registro in Q49Registro.query.all():
            _contar_status(status_counts, registro.status_dashboard())
        for status, count in db.session.query(CartaoQualidade.status, db.func.count(CartaoQualidade.id)).group_by(CartaoQualidade.status).all():
            status_counts[_normalizar_status(status)] = status_counts.get(_normalizar_status(status), 0) + count
        for calibracao in Calibracao.query.all():
            _contar_status(status_counts, _calibracao_status(calibracao))

        status_distribution = [
            {'status': status, 'count': count}
            for status, count in status_counts.items()
        ]

        inspetor_counts = {}
        for inspetor, count in db.session.query(RegistroInspecao.inspetor, db.func.count(RegistroInspecao.id)).group_by(RegistroInspecao.inspetor).all():
            nome = inspetor or 'N/A'
            inspetor_counts[nome] = inspetor_counts.get(nome, 0) + count
        for inspetor, count in db.session.query(RegistroInjecao.inspetor, db.func.count(RegistroInjecao.id)).group_by(RegistroInjecao.inspetor).all():
            nome = inspetor or 'N/A'
            inspetor_counts[nome] = inspetor_counts.get(nome, 0) + count
        for inspetor, count in db.session.query(FichaRecebimento.inspetor, db.func.count(FichaRecebimento.id)).group_by(FichaRecebimento.inspetor).all():
            nome = inspetor or 'N/A'
            inspetor_counts[nome] = inspetor_counts.get(nome, 0) + count
        for inspetor, count in db.session.query(RelatorioRecebimento.inspetor, db.func.count(RelatorioRecebimento.id)).group_by(RelatorioRecebimento.inspetor).all():
            nome = inspetor or 'N/A'
            inspetor_counts[nome] = inspetor_counts.get(nome, 0) + count
        for inspetor, count in db.session.query(Q49Registro.inspetor, db.func.count(Q49Registro.id)).group_by(Q49Registro.inspetor).all():
            nome = inspetor or 'N/A'
            inspetor_counts[nome] = inspetor_counts.get(nome, 0) + count
        for inspetor, count in db.session.query(Q49Registro.inspetor_china, db.func.count(Q49Registro.id)).group_by(Q49Registro.inspetor_china).all():
            nome = inspetor or 'N/A'
            inspetor_counts[nome] = inspetor_counts.get(nome, 0) + count
        for responsavel, count in db.session.query(CartaoQualidade.responsavel, db.func.count(CartaoQualidade.id)).group_by(CartaoQualidade.responsavel).all():
            nome = responsavel or 'N/A'
            inspetor_counts[nome] = inspetor_counts.get(nome, 0) + count
        for responsavel, count in db.session.query(Calibracao.responsavel, db.func.count(Calibracao.id)).group_by(Calibracao.responsavel).all():
            nome = responsavel or 'N/A'
            inspetor_counts[nome] = inspetor_counts.get(nome, 0) + count

        inspetores_data = [
            {'inspetor': inspetor, 'total_inspecoes': total}
            for inspetor, total in sorted(inspetor_counts.items(), key=lambda item: item[1], reverse=True)[:5]
        ]

        registros_por_dia_map = {}
        date_queries = [
            db.session.query(RegistroInspecao.data_inspecao, db.func.count(RegistroInspecao.id)).filter(RegistroInspecao.data_inspecao >= data_limite).group_by(RegistroInspecao.data_inspecao).all(),
            db.session.query(RegistroInjecao.data, db.func.count(RegistroInjecao.id)).filter(RegistroInjecao.data >= data_limite).group_by(RegistroInjecao.data).all(),
            db.session.query(FichaRecebimento.data_inspecao, db.func.count(FichaRecebimento.id)).filter(FichaRecebimento.data_inspecao >= data_limite).group_by(FichaRecebimento.data_inspecao).all(),
            db.session.query(RelatorioRecebimento.data_inspecao, db.func.count(RelatorioRecebimento.id)).filter(RelatorioRecebimento.data_inspecao >= data_limite).group_by(RelatorioRecebimento.data_inspecao).all(),
            db.session.query(Q49Registro.data_china, db.func.count(Q49Registro.id)).filter(Q49Registro.data_china >= data_limite).group_by(Q49Registro.data_china).all(),
            db.session.query(Calibracao.data_calibracao, db.func.count(Calibracao.id)).filter(Calibracao.data_calibracao >= data_limite).group_by(Calibracao.data_calibracao).all()
        ]
        for query_result in date_queries:
            for data, total in query_result:
                if not data:
                    continue
                chave = data.isoformat()
                registros_por_dia_map[chave] = registros_por_dia_map.get(chave, 0) + total

        for cartao in CartaoQualidade.query.filter(CartaoQualidade.created_at >= datetime.combine(data_limite, datetime.min.time())).all():
            if not cartao.created_at:
                continue
            chave = cartao.created_at.date().isoformat()
            registros_por_dia_map[chave] = registros_por_dia_map.get(chave, 0) + 1

        registros_diarios = [
            {'data': data, 'total': total}
            for data, total in sorted(registros_por_dia_map.items())
        ]
        
        stats_data = {
            'total_registros': total_registros,
            'registros_mes': registros_mes,
            'status_distribution': status_distribution,
            'top_inspetores': inspetores_data,
            'registros_por_dia': registros_diarios
        }
        
        return create_response(
            success=True,
            data=stats_data
        )
        
    except Exception as e:
        current_app.logger.error(f"Erro ao buscar estatísticas: {str(e)}")
        return create_response(
            success=False,
            message="Erro ao buscar estatísticas",
            status_code=500
        )



@dashboard_bp.route('/builder-data', methods=['GET'])
@permission_required('dashboard', 'visualizar')
def get_dashboard_builder_data():
    """Dados prontos para o construtor de dashboards, com filtro global e comparação."""
    try:
        hoje = datetime.now().date()

        def parse_date(name):
            raw = request.args.get(name)
            if not raw:
                return None
            return datetime.strptime(raw, '%Y-%m-%d').date()

        start_date = parse_date('start_date')
        end_date = parse_date('end_date')
        if start_date and end_date and start_date > end_date:
            start_date, end_date = end_date, start_date

        compare_enabled = (request.args.get('compare') or '').lower() in ('1', 'true', 'sim', 'yes')
        compare_start = parse_date('compare_start_date') if compare_enabled else None
        compare_end = parse_date('compare_end_date') if compare_enabled else None
        if compare_start and compare_end and compare_start > compare_end:
            compare_start, compare_end = compare_end, compare_start
        has_compare = bool(compare_enabled and compare_start and compare_end)

        def filter_date(query, column, start, end):
            if start:
                query = query.filter(column >= start)
            if end:
                query = query.filter(column <= end)
            return query

        def filter_datetime(query, column, start, end):
            if start:
                query = query.filter(column >= datetime.combine(start, datetime.min.time()))
            if end:
                query = query.filter(column <= datetime.combine(end, datetime.max.time()))
            return query

        def load_period(start, end):
            return {
                'montagem': filter_date(RegistroInspecao.query, RegistroInspecao.data_inspecao, start, end).all(),
                'injecao': filter_date(RegistroInjecao.query, RegistroInjecao.data, start, end).all(),
                'fichas': filter_date(FichaRecebimento.query, FichaRecebimento.data_inspecao, start, end).all(),
                'recebimento': filter_date(RelatorioRecebimento.query, RelatorioRecebimento.data_inspecao, start, end).all(),
                'q49': filter_date(Q49Registro.query, Q49Registro.data_china, start, end).all(),
                'cartoes': filter_datetime(CartaoQualidade.query, CartaoQualidade.created_at, start, end).all(),
                'calibracoes': filter_date(Calibracao.query, Calibracao.data_calibracao, start, end).all(),
                'equipamentos': Equipamento.query.filter_by(ativo=True).all()
            }

        current = load_period(start_date, end_date)
        comparison = load_period(compare_start, compare_end) if has_compare else None

        def is_reprovado(status):
            return _normalizar_status(status) in REPROVADO_STATUS

        def inc_count(map_ref, label, amount=1):
            label = label or 'N/A'
            map_ref[label] = map_ref.get(label, 0) + int(amount or 0)

        def rows_from_map(map_ref, limit=10):
            return [
                {'label': label, 'value': value}
                for label, value in sorted(map_ref.items(), key=lambda item: item[1], reverse=True)[:limit]
            ]

        def date_key(data):
            if not data:
                return None
            if isinstance(data, datetime):
                return data.date().isoformat()
            return data.isoformat()

        def summarize(period):
            status_counts = {}
            for reg in period['montagem']:
                inc_count(status_counts, _normalizar_status(reg.status))
            for reg in period['injecao']:
                inc_count(status_counts, _normalizar_status(reg.status))
            for reg in period['fichas']:
                inc_count(status_counts, _normalizar_status(reg.status))
            for reg in period['recebimento']:
                inc_count(status_counts, _normalizar_status(reg.status_material))
            for reg in period['q49']:
                inc_count(status_counts, _q49_status(reg))
            for cartao in period['cartoes']:
                inc_count(status_counts, _normalizar_status(cartao.status))
            for calibracao in period['calibracoes']:
                inc_count(status_counts, _calibracao_status(calibracao))

            total_montagem = len(period['montagem'])
            total_injecao = len(period['injecao'])
            total_fichas = len(period['fichas'])
            total_recebimento = len(period['recebimento'])
            total_q49 = len(period['q49'])
            total_cartoes = len(period['cartoes'])
            total_calibracoes = len(period['calibracoes'])
            total_equipamentos = len(period['equipamentos'])
            total_registros = total_montagem + total_injecao + total_fichas + total_recebimento + total_q49 + total_cartoes + total_calibracoes
            aprovados = status_counts.get('aprovado', 0) + status_counts.get('liberado', 0)
            reprovados = sum(status_counts.get(status, 0) for status in REPROVADO_STATUS) + status_counts.get('bloqueado', 0) + status_counts.get('vencida', 0)
            pendentes = status_counts.get('pendente', 0) + status_counts.get('vencendo', 0)
            cartoes_nc = sum(int(cartao.qtd_nao_conforme or 0) for cartao in period['cartoes'])
            calibracoes_vencidas = sum(1 for calibracao in period['calibracoes'] if _calibracao_status(calibracao) == 'vencida')
            calibracoes_vencendo = sum(1 for calibracao in period['calibracoes'] if _calibracao_status(calibracao) == 'vencendo')

            return {
                'total_montagem': total_montagem,
                'total_injecao': total_injecao,
                'total_fichas': total_fichas,
                'total_recebimento': total_recebimento,
                'total_q49': total_q49,
                'total_cartoes': total_cartoes,
                'total_calibracoes': total_calibracoes,
                'total_equipamentos': total_equipamentos,
                'total_registros': total_registros,
                'aprovados': aprovados,
                'pendentes': pendentes,
                'reprovados': reprovados,
                'cartoes_nc': cartoes_nc,
                'calibracoes_vencidas': calibracoes_vencidas,
                'calibracoes_vencendo': calibracoes_vencendo,
                'taxa_aprovacao': round((aprovados / total_registros) * 100, 1) if total_registros else 0,
                'taxa_reprovacao': round((reprovados / total_registros) * 100, 1) if total_registros else 0,
                'status_counts': status_counts
            }

        summary = summarize(current)
        compare_summary = summarize(comparison) if has_compare else None

        status_rows = [
            {'label': 'Aprovado', 'value': summary['aprovados']},
            {'label': 'Pendente', 'value': summary['pendentes']},
            {'label': 'Reprovado', 'value': summary['reprovados']}
        ]
        for status, total in sorted(summary['status_counts'].items()):
            if status not in ('aprovado', 'pendente') and status not in REPROVADO_STATUS:
                status_rows.append({'label': status.title(), 'value': total})

        registros_por_dia = {}
        for reg in current['montagem']:
            key = date_key(reg.data_inspecao)
            if key:
                inc_count(registros_por_dia, key)
        for reg in current['injecao']:
            key = date_key(reg.data)
            if key:
                inc_count(registros_por_dia, key)
        for reg in current['fichas']:
            key = date_key(reg.data_inspecao)
            if key:
                inc_count(registros_por_dia, key)
        for reg in current['recebimento']:
            key = date_key(reg.data_inspecao)
            if key:
                inc_count(registros_por_dia, key)
        for reg in current['q49']:
            key = date_key(reg.data_china)
            if key:
                inc_count(registros_por_dia, key)
        for cartao in current['cartoes']:
            key = date_key(cartao.created_at)
            if key:
                inc_count(registros_por_dia, key)
        for calibracao in current['calibracoes']:
            key = date_key(calibracao.data_calibracao)
            if key:
                inc_count(registros_por_dia, key)

        linhas = {}
        for reg in current['montagem']:
            inc_count(linhas, reg.linha_montagem or reg.linha or 'Sem linha')

        maquinas = {}
        for reg in current['injecao']:
            inc_count(maquinas, reg.maquina or 'Sem máquina')

        produtos_reprovados = {}
        pecas_reprovadas = {}
        defeitos_montagem = {}
        defeitos_injecao = {}
        fornecedores_reprovados = {}
        turnos = {}
        inspetores = {}

        for reg in current['montagem']:
            if is_reprovado(reg.status):
                inc_count(produtos_reprovados, _codigo_nome(reg.cod_sap, reg.modelo or reg.descricao_sap))
            if reg.defeito:
                inc_count(defeitos_montagem, reg.defeito)
            if reg.turno:
                inc_count(turnos, _label_turno(reg.turno))
            inc_count(inspetores, reg.inspetor or 'N/A')

        for reg in current['injecao']:
            if is_reprovado(reg.status):
                label = _codigo_nome(reg.cod, reg.peca)
                inc_count(produtos_reprovados, label)
                inc_count(pecas_reprovadas, label)
            if reg.defeito:
                inc_count(defeitos_injecao, reg.defeito)
            if reg.turno_injecao:
                inc_count(turnos, _label_turno(reg.turno_injecao))
            inc_count(inspetores, reg.inspetor or 'N/A')

        for reg in current['fichas']:
            if is_reprovado(reg.status):
                inc_count(produtos_reprovados, _codigo_nome(reg.codigo, reg.componente or reg.aplicacao))
                inc_count(fornecedores_reprovados, reg.fornecedor or 'N/A')
            inc_count(inspetores, reg.inspetor or 'N/A')

        for reg in current['recebimento']:
            if is_reprovado(reg.status_material):
                inc_count(produtos_reprovados, _codigo_nome(reg.cod_sap, reg.descricao_sap))
                inc_count(fornecedores_reprovados, reg.fornecedor or 'N/A')
            inc_count(inspetores, reg.inspetor or 'N/A')

        q49_resultados = {}
        q49_fornecedores = {}
        q49_linhas = {}
        for reg in current['q49']:
            inc_count(q49_resultados, _q49_status(reg).title())
            inc_count(q49_fornecedores, reg.fornecedor or 'N/A')
            inc_count(q49_linhas, reg.linha or 'Sem linha')
            if is_reprovado(reg.status_dashboard()):
                inc_count(produtos_reprovados, _codigo_nome(reg.codigo_sap, reg.modelo or reg.descricao_sap))
                inc_count(fornecedores_reprovados, reg.fornecedor or 'N/A')
            inc_count(inspetores, reg.inspetor or reg.inspetor_china or 'N/A')

        cartoes_status = {}
        cartoes_origem = {}
        cartoes_nc = {}
        for cartao in current['cartoes']:
            inc_count(cartoes_status, (cartao.status or 'N/A').title())
            inc_count(cartoes_origem, cartao.origem or 'N/A')
            if cartao.turno:
                inc_count(turnos, _label_turno(cartao.turno))
            if int(cartao.qtd_nao_conforme or 0) > 0:
                inc_count(cartoes_nc, _codigo_nome(cartao.codigo_produto, cartao.nome_produto), cartao.qtd_nao_conforme)
            inc_count(inspetores, cartao.responsavel or 'N/A')

        calibracoes_status = {}
        calibracoes_alertas = {}
        equipamentos_setor = {}
        for calibracao in current['calibracoes']:
            status = _calibracao_status(calibracao)
            inc_count(calibracoes_status, status.title())
            if status in ('vencida', 'vencendo'):
                inc_count(calibracoes_alertas, status.title())
            inc_count(inspetores, calibracao.responsavel or 'N/A')

        for equipamento in current['equipamentos']:
            inc_count(equipamentos_setor, equipamento.setor or 'Sem setor')

        def metric(metric_id, title, value, icon, tone='primary', suffix='', compare_value=None):
            data = _metric(metric_id, title, value, icon, tone, suffix)
            if compare_value is not None:
                delta = round(float(value or 0) - float(compare_value or 0), 1)
                data['compare_value'] = round(float(compare_value or 0), 1)
                data['delta'] = delta
                data['delta_percent'] = None if float(compare_value or 0) == 0 else round((delta / float(compare_value)) * 100, 1)
            return data

        def comp(key):
            return compare_summary.get(key) if compare_summary else None

        metrics = [
            metric('total-inspecoes', 'Total no Período', summary['total_registros'], 'fa-clipboard-check', 'primary', '', comp('total_registros')),
            metric('inspecoes-mes', 'Registros no Período', summary['total_registros'], 'fa-calendar-days', 'warning', '', comp('total_registros')),
            metric('taxa-aprovacao', 'Taxa de Aprovação', summary['taxa_aprovacao'], 'fa-circle-check', 'success', '%', comp('taxa_aprovacao')),
            metric('taxa-reprovacao', 'Taxa de Reprovação/Alerta', summary['taxa_reprovacao'], 'fa-circle-xmark', 'danger', '%', comp('taxa_reprovacao')),
            metric('total-reprovados', 'Itens Reprovados/Alertas', summary['reprovados'], 'fa-triangle-exclamation', 'danger', '', comp('reprovados')),
            metric('q49-produto-importado', 'Produto Importado (Q49)', summary['total_q49'], 'fa-ship', 'info', '', comp('total_q49')),
            metric('cartoes-qualidade', 'Cartões de Qualidade', summary['total_cartoes'], 'fa-id-card-clip', 'info', '', comp('total_cartoes')),
            metric('cartoes-nc', 'Qtd. Não Conforme em Cartões', summary['cartoes_nc'], 'fa-ban', 'danger', '', comp('cartoes_nc')),
            metric('calibracoes', 'Calibrações', summary['total_calibracoes'], 'fa-tools', 'primary', '', comp('total_calibracoes')),
            metric('equipamentos', 'Equipamentos Ativos', summary['total_equipamentos'], 'fa-tools', 'primary', ''),
            metric('calibracoes-vencidas', 'Calibrações Vencidas', summary['calibracoes_vencidas'], 'fa-calendar-xmark', 'danger', '', comp('calibracoes_vencidas')),
            metric('calibracoes-vencendo', 'Calibrações Vencendo', summary['calibracoes_vencendo'], 'fa-clock', 'warning', '', comp('calibracoes_vencendo'))
        ]

        compare_rows = []
        if compare_summary:
            compare_rows = [
                {'label': 'Inspeções atual', 'value': summary['total_registros']},
                {'label': 'Inspeções comparação', 'value': compare_summary['total_registros']},
                {'label': 'Reprovados atual', 'value': summary['reprovados']},
                {'label': 'Reprovados comparação', 'value': compare_summary['reprovados']},
                {'label': 'Q49 atual', 'value': summary['total_q49']},
                {'label': 'Q49 comparação', 'value': compare_summary['total_q49']},
                {'label': 'Cartões atual', 'value': summary['total_cartoes']},
                {'label': 'Cartões comparação', 'value': compare_summary['total_cartoes']},
                {'label': 'Calibrações atual', 'value': summary['total_calibracoes']},
                {'label': 'Calibrações comparação', 'value': compare_summary['total_calibracoes']}
            ]

        datasets = [
            _dataset('status-geral', 'Status Geral das Inspeções', status_rows, 'doughnut', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-chart-pie'),
            _dataset('inspecoes-por-tipo', 'Registros por Módulo', [
                {'label': 'Montagem', 'value': summary['total_montagem']},
                {'label': 'Injeção', 'value': summary['total_injecao']},
                {'label': 'Ficha Recebimento', 'value': summary['total_fichas']},
                {'label': 'Entrada MP', 'value': summary['total_recebimento']},
                {'label': 'Produto Importado (Q49)', 'value': summary['total_q49']},
                {'label': 'Cartões', 'value': summary['total_cartoes']},
                {'label': 'Calibrações', 'value': summary['total_calibracoes']}
            ], 'bar', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-layer-group'),
            _dataset('inspecoes-por-dia', 'Inspeções por Dia', [
                {'label': data, 'value': total}
                for data, total in sorted(registros_por_dia.items())
            ], 'line', ['line', 'bar'], 'fa-chart-line'),
            _dataset('montagem-por-linha', 'Montagem por Linha', rows_from_map(linhas, 12), 'bar', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-industry'),
            _dataset('injecao-por-maquina', 'Injeção por Máquina', rows_from_map(maquinas, 12), 'bar', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-gears'),
            _dataset('produtos-mais-reprovados', 'Produtos Mais Reprovados', rows_from_map(produtos_reprovados, 10), 'horizontalBar', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-box-open'),
            _dataset('pecas-injecao-reprovadas', 'Peças de Injeção Mais Reprovadas', rows_from_map(pecas_reprovadas, 10), 'horizontalBar', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-puzzle-piece'),
            _dataset('defeitos-montagem', 'Defeitos de Montagem', rows_from_map(defeitos_montagem, 10), 'horizontalBar', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-tools'),
            _dataset('defeitos-injecao', 'Defeitos de Injeção', rows_from_map(defeitos_injecao, 10), 'horizontalBar', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-wrench'),
            _dataset('fornecedores-reprovados', 'Fornecedores com Mais Reprovação', rows_from_map(fornecedores_reprovados, 10), 'horizontalBar', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-truck-field'),
            _dataset('q49-por-resultado', 'Q49 por Resultado/Decisão', rows_from_map(q49_resultados, 10), 'doughnut', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-ship'),
            _dataset('q49-por-fornecedor', 'Q49 por Fornecedor', rows_from_map(q49_fornecedores, 10), 'horizontalBar', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-truck'),
            _dataset('q49-por-linha', 'Q49 por Linha', rows_from_map(q49_linhas, 10), 'bar', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-list'),
            _dataset('cartoes-por-status', 'Cartões por Status', rows_from_map(cartoes_status, 10), 'doughnut', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-id-card'),
            _dataset('cartoes-por-origem', 'Cartões por Origem', rows_from_map(cartoes_origem, 10), 'bar', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-location-dot'),
            _dataset('cartoes-nao-conformes', 'Produtos com Não Conformidade em Cartões', rows_from_map(cartoes_nc, 10), 'horizontalBar', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-rectangle-xmark'),
            _dataset('calibracoes-por-status', 'Calibrações por Status', rows_from_map(calibracoes_status, 10), 'doughnut', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-tools'),
            _dataset('calibracoes-alertas', 'Alertas de Calibração', rows_from_map(calibracoes_alertas, 10), 'bar', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-calendar-xmark'),
            _dataset('equipamentos-por-setor', 'Equipamentos por Setor', rows_from_map(equipamentos_setor, 12), 'bar', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-tools'),
            _dataset('inspecoes-por-turno', 'Registros por Turno', rows_from_map(turnos, 10), 'bar', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-clock'),
            _dataset('inspecoes-por-inspetor', 'Inspeções por Inspetor', rows_from_map(inspetores, 10), 'horizontalBar', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-user-check')
        ]

        if compare_rows:
            datasets.insert(2, _dataset('comparativo-periodos', 'Comparativo entre Períodos', compare_rows, 'bar', ['bar', 'horizontalBar', 'pie', 'doughnut'], 'fa-scale-balanced'))

        return create_response(
            success=True,
            data={
                'metrics': metrics,
                'datasets': datasets,
                'period': {
                    'start_date': start_date.isoformat() if start_date else None,
                    'end_date': end_date.isoformat() if end_date else None,
                    'compare_start_date': compare_start.isoformat() if compare_start else None,
                    'compare_end_date': compare_end.isoformat() if compare_end else None,
                    'compare_enabled': has_compare
                },
                'chartTypes': [
                    {'id': 'bar', 'label': 'Coluna', 'icon': 'fa-chart-column'},
                    {'id': 'horizontalBar', 'label': 'Barra', 'icon': 'fa-chart-bar'},
                    {'id': 'line', 'label': 'Linha', 'icon': 'fa-chart-line'},
                    {'id': 'pie', 'label': 'Pizza', 'icon': 'fa-chart-pie'},
                    {'id': 'doughnut', 'label': 'Rosca', 'icon': 'fa-circle-notch'}
                ],
                'sizes': [
                    {'id': 'sm', 'label': 'Pequeno'},
                    {'id': 'md', 'label': 'Médio'},
                    {'id': 'lg', 'label': 'Grande'},
                    {'id': 'xl', 'label': 'Largo'}
                ],
                'updated_at': datetime.utcnow().isoformat()
            }
        )

    except Exception as e:
        current_app.logger.error(f"Erro ao montar dados do construtor de dashboard: {str(e)}")
        return create_response(
            success=False,
            message="Erro ao montar dados do construtor de dashboard",
            status_code=500
        )


@dashboard_bp.route('/ultimas-inspecoes', methods=['GET'])
@permission_required('dashboard', 'visualizar')
def get_ultimas_inspecoes():
    """Últimas inspeções de todos os módulos de registro."""
    try:
        limit = min(request.args.get('limit', 10, type=int), 50)

        def parse_date(name):
            raw = request.args.get(name)
            if not raw:
                return None
            return datetime.strptime(raw, '%Y-%m-%d').date()

        start_date = parse_date('start_date')
        end_date = parse_date('end_date')
        if start_date and end_date and start_date > end_date:
            start_date, end_date = end_date, start_date

        def filter_date(query, column):
            if start_date:
                query = query.filter(column >= start_date)
            if end_date:
                query = query.filter(column <= end_date)
            return query

        def filter_datetime(query, column):
            if start_date:
                query = query.filter(column >= datetime.combine(start_date, datetime.min.time()))
            if end_date:
                query = query.filter(column <= datetime.combine(end_date, datetime.max.time()))
            return query

        montagem_query = filter_date(RegistroInspecao.query, RegistroInspecao.data_inspecao)
        injecao_query = filter_date(RegistroInjecao.query, RegistroInjecao.data)
        fichas_query = filter_date(FichaRecebimento.query, FichaRecebimento.data_inspecao)
        recebimento_query = filter_date(RelatorioRecebimento.query, RelatorioRecebimento.data_inspecao)
        q49_query = filter_date(Q49Registro.query, Q49Registro.data_china)
        cartoes_query = filter_datetime(CartaoQualidade.query, CartaoQualidade.created_at)
        calibracoes_query = filter_date(Calibracao.query, Calibracao.data_calibracao)

        registros = []
        registros.extend([
            _montagem_to_dashboard(reg)
            for reg in montagem_query.order_by(
                RegistroInspecao.data_inspecao.desc(),
                RegistroInspecao.id.desc()
            ).limit(limit).all()
        ])
        registros.extend([
            _injecao_to_dashboard(reg)
            for reg in injecao_query.order_by(
                RegistroInjecao.data.desc(),
                RegistroInjecao.id.desc()
            ).limit(limit).all()
        ])
        registros.extend([
            _ficha_recebimento_to_dashboard(reg)
            for reg in fichas_query.order_by(
                FichaRecebimento.data_inspecao.desc(),
                FichaRecebimento.id.desc()
            ).limit(limit).all()
        ])
        registros.extend([
            _relatorio_recebimento_to_dashboard(reg)
            for reg in recebimento_query.order_by(
                RelatorioRecebimento.data_inspecao.desc(),
                RelatorioRecebimento.id.desc()
            ).limit(limit).all()
        ])
        registros.extend([
            _q49_to_dashboard(reg)
            for reg in q49_query.order_by(
                Q49Registro.data_china.desc(),
                Q49Registro.id.desc()
            ).limit(limit).all()
        ])
        registros.extend([
            _cartao_to_dashboard(reg)
            for reg in cartoes_query.order_by(
                CartaoQualidade.created_at.desc(),
                CartaoQualidade.id.desc()
            ).limit(limit).all()
        ])
        registros.extend([
            _calibracao_to_dashboard(reg)
            for reg in calibracoes_query.order_by(
                Calibracao.data_calibracao.desc(),
                Calibracao.id.desc()
            ).limit(limit).all()
        ])

        registros = sorted(registros, key=_data_sort, reverse=True)[:limit]

        return create_response(
            success=True,
            data=registros,
            message=f"Encontradas {len(registros)} inspeções recentes"
        )

    except Exception as e:
        current_app.logger.error(f"Erro ao buscar últimas inspeções: {str(e)}")
        return create_response(
            success=False,
            message="Erro ao buscar últimas inspeções",
            status_code=500
        )


@dashboard_bp.route('/inspecoes-por-linha', methods=['GET'])
@permission_required('dashboard', 'visualizar')
def get_inspecoes_por_linha():
    """Inspeções agrupadas por linha de montagem"""
    try:
        linhas_stats = db.session.query(
            RegistroInspecao.linha_montagem,
            db.func.count(RegistroInspecao.id).label('total'),
            db.func.sum(db.case((RegistroInspecao.status == 'aprovado', 1), else_=0)).label('aprovados'),
            db.func.sum(db.case((RegistroInspecao.status == 'reprovado', 1), else_=0)).label('reprovados')
        ).filter(RegistroInspecao.linha_montagem.isnot(None))\
         .group_by(RegistroInspecao.linha_montagem)\
         .order_by(db.func.count(RegistroInspecao.id).desc())\
         .all()
        
        linhas_data = [{
            'linha': linha.linha_montagem,
            'total': linha.total,
            'aprovados': linha.aprovados,
            'reprovados': linha.reprovados,
            'taxa_aprovacao': round((linha.aprovados / linha.total) * 100, 1) if linha.total > 0 else 0
        } for linha in linhas_stats]
        
        return create_response(
            success=True, 
            data=linhas_data,
            message=f"Dados recuperados com sucesso para {len(linhas_data)} linhas"
        )
        
    except Exception as e:
        current_app.logger.error(f"Erro ao buscar inspeções por linha: {str(e)}")
        return create_response(
            success=False, 
            message="Erro ao buscar dados de inspeções por linha",
            status_code=500
        )


@dashboard_bp.route('/inspecoes-injecao-por-maquina', methods=['GET'])
@permission_required('dashboard', 'visualizar')
def get_inspecoes_injecao_por_maquina():
    """Inspeções de injeção agrupadas por máquina."""
    try:
        maquinas_stats = db.session.query(
            RegistroInjecao.maquina,
            db.func.count(RegistroInjecao.id).label('total'),
            db.func.sum(db.case((RegistroInjecao.status == 'aprovado', 1), else_=0)).label('aprovados'),
            db.func.sum(db.case((RegistroInjecao.status == 'reprovado', 1), else_=0)).label('reprovados')
        ).filter(RegistroInjecao.maquina.isnot(None))\
         .group_by(RegistroInjecao.maquina)\
         .order_by(db.func.count(RegistroInjecao.id).desc())\
         .all()

        maquinas_data = [{
            'maquina': item.maquina,
            'total': item.total,
            'aprovados': item.aprovados,
            'reprovados': item.reprovados,
            'taxa_aprovacao': round((item.aprovados / item.total) * 100, 1) if item.total > 0 else 0
        } for item in maquinas_stats]

        return create_response(
            success=True,
            data=maquinas_data,
            message=f"Dados recuperados com sucesso para {len(maquinas_data)} máquinas"
        )

    except Exception as e:
        current_app.logger.error(f"Erro ao buscar inspeções de injeção por máquina: {str(e)}")
        return create_response(
            success=False,
            message="Erro ao buscar dados de inspeções de injeção por máquina",
            status_code=500
        )
