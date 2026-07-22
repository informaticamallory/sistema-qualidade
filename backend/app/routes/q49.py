# routes/q49.py - Rotas de Produto Importado (Q49)
from datetime import datetime
from flask import Blueprint, request, current_app

from app.extensions import db, limiter
from app.models.q49 import Q49Registro
from app.utils.responses import create_response
from app.utils.auth_decorators import auth_required, check_permission

q49_bp = Blueprint('q49', __name__)

_ACOES_LISTA = {'GET': 'visualizar', 'POST': 'criar'}
_ACOES_ITEM = {'GET': 'visualizar', 'PUT': 'editar', 'DELETE': 'excluir'}


def _negar_se_sem_permissao(mapa):
    acao = mapa.get(request.method)
    if acao and not check_permission('registros', acao):
        return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)
    return None


def _parse_date(value):
    if not value:
        return None
    if hasattr(value, 'isoformat') and not isinstance(value, str):
        return value
    return datetime.strptime(value, '%Y-%m-%d').date()


def _to_int(value):
    if value in (None, ''):
        return 0
    return int(value)


def _apply_payload(registro, dados):
    china = dados.get('china') or {}
    decisao = dados.get('decisaoBrasil') or dados.get('decisao_brasil') or {}
    brasil = dados.get('brasil') or {}

    registro.data_china = _parse_date(china.get('datachina')) or datetime.now().date()
    registro.ano_china = china.get('ano')
    registro.mes_china = china.get('mes')
    registro.po = china.get('po')
    registro.emani = china.get('emani')
    registro.semana = china.get('semana')
    registro.tipo_item = china.get('tipoItem')
    registro.n_insp = china.get('nInsp')
    registro.nacionalizacao = china.get('nacionalizacao')
    registro.codigo_sap = china.get('codigoSAP')
    registro.descricao_sap = china.get('descricaoSAP')
    registro.linha = china.get('linha')
    registro.modelo = china.get('modelo')
    registro.fornecedor = china.get('fornecedor')
    registro.qtd_total = _to_int(china.get('qtdTotal'))
    registro.qtd_inspecionada = _to_int(china.get('qtdInspecionada'))
    registro.rastreabilidade = china.get('rastreabilidade')
    registro.inspetor_china = china.get('inspetorChina')
    registro.resultado = china.get('resultado') or 'pendente'
    registro.rejeicoes = china.get('rejeicoes')
    registro.resumo_problemas = china.get('resumoProblemas')

    registro.decisao_mallory = decisao.get('decisaoMallory')
    registro.acao = decisao.get('acao')
    registro.prazo = _parse_date(decisao.get('prazo'))
    registro.decisao_status = decisao.get('status') or 'pendente'
    registro.tipo_reprovacao = decisao.get('tipoReprovacao')
    registro.data_aceite_q49 = _parse_date(decisao.get('dataAceiteQ49'))
    registro.resp_reprovacao = decisao.get('respReprovacao')
    registro.observacoes_decisao = decisao.get('observacoes')

    registro.data_entrada = _parse_date(brasil.get('dataEntrada'))
    registro.ano_brasil = brasil.get('ano')
    registro.mes_brasil = brasil.get('mes')
    registro.data_inspecao_brasil = _parse_date(brasil.get('dataInspecao'))
    registro.qtd_inspecionada_brasil = _to_int(brasil.get('qtdInspecionada'))
    registro.qtd_nc_inspecionada = _to_int(brasil.get('qtdNCInspecionada'))
    registro.qtd_liberados = _to_int(brasil.get('qtdLiberados'))
    registro.qtd_bloqueados = _to_int(brasil.get('qtdBloqueados'))
    registro.inspetor = brasil.get('inspetor')
    registro.decisao_brasil = brasil.get('decisaoBrasil') or 'pendente'
    registro.reporte_docushare = brasil.get('reporteDocushare')
    registro.disposicao_decisao = brasil.get('disposicaoDecisao')
    registro.defeitos = brasil.get('defeitos')
    registro.n_rna = brasil.get('nRNA')

    return registro


@q49_bp.route('', methods=['GET', 'POST', 'OPTIONS'])
@limiter.limit('100 per minute')
@auth_required()
def handle_q49():
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_LISTA)
    if negado:
        return negado

    if request.method == 'GET':
        try:
            search = (request.args.get('search') or '').strip()
            status = (request.args.get('status') or '').strip()
            page = request.args.get('page', 1, type=int)
            per_page = min(request.args.get('limit', 100, type=int), 200)

            query = Q49Registro.query

            if search:
                pattern = f"%{search.upper()}%"
                query = query.filter(db.or_(
                    db.func.upper(Q49Registro.codigo_sap).like(pattern),
                    db.func.upper(Q49Registro.descricao_sap).like(pattern),
                    db.func.upper(Q49Registro.fornecedor).like(pattern),
                    db.func.upper(Q49Registro.n_insp).like(pattern),
                    db.func.upper(Q49Registro.inspetor).like(pattern)
                ))

            if status:
                status_norm = status.lower()
                query = query.filter(db.or_(
                    db.func.lower(Q49Registro.resultado) == status_norm,
                    db.func.lower(Q49Registro.decisao_status) == status_norm,
                    db.func.lower(Q49Registro.decisao_brasil) == status_norm
                ))

            query = query.order_by(Q49Registro.data_china.desc(), Q49Registro.id.desc())

            if request.args.get('page'):
                paginated = query.paginate(page=page, per_page=per_page, error_out=False)
                registros = paginated.items
                total = paginated.total
            else:
                registros = query.all()
                total = len(registros)

            return create_response(
                success=True,
                data=[registro.to_dict() for registro in registros],
                message=f'Encontrados {total} registros Q49'
            )

        except Exception as e:
            current_app.logger.error(f'Erro ao buscar registros Q49: {str(e)}')
            return create_response(success=False, message='Erro ao buscar registros Q49', status_code=500)

    try:
        dados = request.get_json() or {}
        registro = _apply_payload(Q49Registro(), dados)
        db.session.add(registro)
        db.session.commit()
        return create_response(
            success=True,
            data=registro.to_dict(),
            message='Registro Q49 criado com sucesso',
            status_code=201
        )
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f'Erro ao criar registro Q49: {str(e)}')
        return create_response(success=False, message=f'Erro ao criar registro Q49: {str(e)}', status_code=400)


@q49_bp.route('/<int:id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'])
@limiter.limit('100 per minute')
@auth_required()
def handle_q49_item(id):
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_ITEM)
    if negado:
        return negado

    registro = Q49Registro.query.get(id)
    if not registro:
        return create_response(success=False, message='Registro Q49 não encontrado', status_code=404)

    if request.method == 'GET':
        return create_response(success=True, data=registro.to_dict())

    if request.method == 'PUT':
        try:
            dados = request.get_json() or {}
            _apply_payload(registro, dados)
            registro.updated_at = datetime.utcnow()
            db.session.commit()
            return create_response(success=True, data=registro.to_dict(), message='Registro Q49 atualizado com sucesso')
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f'Erro ao atualizar registro Q49: {str(e)}')
            return create_response(success=False, message=f'Erro ao atualizar registro Q49: {str(e)}', status_code=400)

    try:
        db.session.delete(registro)
        db.session.commit()
        return create_response(success=True, message='Registro Q49 excluído com sucesso')
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f'Erro ao excluir registro Q49: {str(e)}')
        return create_response(success=False, message='Erro ao excluir registro Q49', status_code=500)