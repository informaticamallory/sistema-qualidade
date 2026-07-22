# routes/recebimento.py - Rotas de Inspeção e Relatório de Recebimento
from flask import Blueprint, request, current_app
from datetime import datetime

from app.extensions import db, limiter
from app.models.recebimento import FichaRecebimento, RelatorioRecebimento
from app.utils.responses import create_response
from app.utils.auth_decorators import auth_required, check_permission

ficha_recebimento_bp = Blueprint('ficha_recebimento', __name__)
relatorio_recebimento_bp = Blueprint('relatorio_recebimento', __name__)

_ACOES_LISTA = {'GET': 'visualizar', 'POST': 'criar'}
_ACOES_ITEM = {'GET': 'visualizar', 'PUT': 'editar', 'DELETE': 'excluir'}


def _negar_se_sem_permissao(mapa):
    """Reforço por ação no módulo 'registros' (Recebimento faz parte da área Registro)."""
    acao = mapa.get(request.method)
    if acao and not check_permission('registros', acao):
        return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)
    return None


def _parse_date(value):
    if value and isinstance(value, str):
        try:
            return datetime.strptime(value, '%Y-%m-%d').date()
        except ValueError:
            return None
    return None


# ==================== FICHA DE INSPEÇÃO DE RECEBIMENTO ====================
CAMPOS_FICHA = ['codigo', 'aplicacao', 'componente', 'setor', 'fornecedor',
                'revisao_desenho', 'lotes', 'dimensoes', 'resultados',
                'inspetor', 'status', 'observacao']


@ficha_recebimento_bp.route('', methods=['GET', 'POST', 'OPTIONS'])
@limiter.limit("100 per minute")
@auth_required()
def handle_fichas():
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_LISTA)
    if negado:
        return negado

    if request.method == 'GET':
        try:
            page = request.args.get('page', 1, type=int)
            per_page = min(request.args.get('limit', 50, type=int), 100)
            search = request.args.get('search', '')
            status = request.args.get('status', '')

            query = FichaRecebimento.query
            if search:
                p = f"%{search}%"
                query = query.filter(db.or_(
                    FichaRecebimento.codigo.like(p),
                    FichaRecebimento.componente.like(p),
                    FichaRecebimento.fornecedor.like(p)
                ))
            if status:
                query = query.filter(FichaRecebimento.status == status)

            query = query.order_by(FichaRecebimento.id.desc())
            paginated = query.paginate(page=page, per_page=per_page, error_out=False)

            return create_response(
                success=True,
                data=[f.to_dict() for f in paginated.items],
                message=f"Encontradas {paginated.total} fichas"
            )
        except Exception as e:
            current_app.logger.error(f"Erro ao buscar fichas de recebimento: {str(e)}")
            return create_response(success=False, message="Erro ao buscar fichas de recebimento", status_code=500)

    if request.method == 'POST':
        try:
            dados = request.get_json() or {}
            nova = FichaRecebimento(
                codigo=dados.get('codigo'),
                aplicacao=dados.get('aplicacao'),
                componente=dados.get('componente'),
                setor=dados.get('setor'),
                fornecedor=dados.get('fornecedor'),
                revisao_desenho=dados.get('revisao_desenho'),
                lotes=dados.get('lotes', []),
                dimensoes=dados.get('dimensoes', []),
                resultados=dados.get('resultados', []),
                data_inspecao=_parse_date(dados.get('data_inspecao')),
                inspetor=dados.get('inspetor', 'Sistema'),
                status=dados.get('status', 'pendente'),
                observacao=dados.get('observacao')
            )
            db.session.add(nova)
            db.session.commit()
            return create_response(success=True, message='Ficha criada com sucesso',
                                   data=nova.to_dict(), status_code=201)
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Erro ao criar ficha de recebimento: {str(e)}")
            return create_response(success=False, message=f'Erro ao criar ficha: {str(e)}', status_code=400)


@ficha_recebimento_bp.route('/<int:id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'])
@auth_required()
def handle_ficha_individual(id):
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_ITEM)
    if negado:
        return negado

    ficha = FichaRecebimento.query.get(id)
    if not ficha:
        return create_response(success=False, message=f"Ficha {id} não encontrada", status_code=404)

    if request.method == 'GET':
        return create_response(success=True, data=ficha.to_dict())

    if request.method == 'PUT':
        try:
            dados = request.get_json() or {}
            if 'data_inspecao' in dados:
                ficha.data_inspecao = _parse_date(dados.get('data_inspecao'))
            for campo in CAMPOS_FICHA:
                if campo in dados:
                    setattr(ficha, campo, dados[campo])
            ficha.updated_at = datetime.utcnow()
            db.session.commit()
            return create_response(success=True, message="Ficha atualizada com sucesso", data=ficha.to_dict())
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Erro ao atualizar ficha de recebimento: {str(e)}")
            return create_response(success=False, message=f"Erro: {str(e)}", status_code=500)

    if request.method == 'DELETE':
        try:
            db.session.delete(ficha)
            db.session.commit()
            return create_response(success=True, message="Ficha excluída com sucesso")
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Erro ao excluir ficha de recebimento: {str(e)}")
            return create_response(success=False, message=f"Erro ao excluir: {str(e)}", status_code=500)


# ==================== RELATÓRIO DE ENTRADA DE MATÉRIA-PRIMA ====================
CAMPOS_REL = ['cod_sap', 'descricao_sap', 'fornecedor', 'qtd_total', 'qtd_inspecionada',
              'qtd_nc', 'status_material', 'rastreabilidade', 'documento', 'defeito',
              'inspetor', 'nota_fiscal', 'mpn', 'rel', 'sei', 'dev', 'lp',
              'liberado_sap', 'observacao']


@relatorio_recebimento_bp.route('', methods=['GET', 'POST', 'OPTIONS'])
@limiter.limit("100 per minute")
@auth_required()
def handle_relatorios():
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_LISTA)
    if negado:
        return negado

    if request.method == 'GET':
        try:
            page = request.args.get('page', 1, type=int)
            per_page = min(request.args.get('limit', 50, type=int), 100)
            search = request.args.get('search', '')
            status = request.args.get('status', '')

            query = RelatorioRecebimento.query
            if search:
                p = f"%{search}%"
                query = query.filter(db.or_(
                    RelatorioRecebimento.cod_sap.like(p),
                    RelatorioRecebimento.fornecedor.like(p),
                    RelatorioRecebimento.descricao_sap.like(p)
                ))
            if status:
                query = query.filter(RelatorioRecebimento.status_material == status)

            query = query.order_by(RelatorioRecebimento.data_inspecao.desc(), RelatorioRecebimento.id.desc())
            paginated = query.paginate(page=page, per_page=per_page, error_out=False)

            return create_response(
                success=True,
                data=[r.to_dict() for r in paginated.items],
                message=f"Encontrados {paginated.total} relatórios"
            )
        except Exception as e:
            current_app.logger.error(f"Erro ao buscar relatórios de recebimento: {str(e)}")
            return create_response(success=False, message="Erro ao buscar relatórios de recebimento", status_code=500)

    if request.method == 'POST':
        try:
            dados = request.get_json() or {}
            novo = RelatorioRecebimento(
                data_entrada=_parse_date(dados.get('data_entrada')),
                data_inspecao=_parse_date(dados.get('data_inspecao')),
                cod_sap=dados.get('cod_sap'),
                descricao_sap=dados.get('descricao_sap'),
                fornecedor=dados.get('fornecedor'),
                qtd_total=int(dados.get('qtd_total', 0) or 0),
                qtd_inspecionada=int(dados.get('qtd_inspecionada', 0) or 0),
                qtd_nc=int(dados.get('qtd_nc', 0) or 0),
                status_material=dados.get('status_material', 'pendente'),
                rastreabilidade=dados.get('rastreabilidade'),
                documento=dados.get('documento'),
                defeito=dados.get('defeito'),
                inspetor=dados.get('inspetor', 'Sistema'),
                nota_fiscal=dados.get('nota_fiscal'),
                mpn=dados.get('mpn'),
                rel=dados.get('rel'),
                sei=dados.get('sei'),
                dev=dados.get('dev'),
                lp=dados.get('lp'),
                liberado_sap=dados.get('liberado_sap'),
                observacao=dados.get('observacao')
            )
            db.session.add(novo)
            db.session.commit()
            return create_response(success=True, message='Relatório criado com sucesso',
                                   data=novo.to_dict(), status_code=201)
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Erro ao criar relatório de recebimento: {str(e)}")
            return create_response(success=False, message=f'Erro ao criar relatório: {str(e)}', status_code=400)


@relatorio_recebimento_bp.route('/<int:id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'])
@auth_required()
def handle_relatorio_individual(id):
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_ITEM)
    if negado:
        return negado

    rel = RelatorioRecebimento.query.get(id)
    if not rel:
        return create_response(success=False, message=f"Relatório {id} não encontrado", status_code=404)

    if request.method == 'GET':
        return create_response(success=True, data=rel.to_dict())

    if request.method == 'PUT':
        try:
            dados = request.get_json() or {}
            if 'data_entrada' in dados:
                rel.data_entrada = _parse_date(dados.get('data_entrada'))
            if 'data_inspecao' in dados:
                rel.data_inspecao = _parse_date(dados.get('data_inspecao'))
            for campo in CAMPOS_REL:
                if campo in dados:
                    setattr(rel, campo, dados[campo])
            rel.updated_at = datetime.utcnow()
            db.session.commit()
            return create_response(success=True, message="Relatório atualizado com sucesso", data=rel.to_dict())
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Erro ao atualizar relatório de recebimento: {str(e)}")
            return create_response(success=False, message=f"Erro: {str(e)}", status_code=500)

    if request.method == 'DELETE':
        try:
            db.session.delete(rel)
            db.session.commit()
            return create_response(success=True, message="Relatório excluído com sucesso")
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Erro ao excluir relatório de recebimento: {str(e)}")
            return create_response(success=False, message=f"Erro ao excluir: {str(e)}", status_code=500)
