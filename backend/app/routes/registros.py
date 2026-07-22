# routes/registros.py - Rotas de registros de inspeção
from datetime import datetime
from decimal import Decimal, InvalidOperation

from flask import Blueprint, request, current_app

from app.extensions import db, limiter
from app.models.registro import RegistroInspecao, ChecklistTeste
from app.schemas.registro import registro_schema, registros_schema
from app.utils.responses import create_response
from app.utils.auth_decorators import auth_required, check_permission

registros_bp = Blueprint('registros', __name__)

# Mapeamento método HTTP -> ação exigida no módulo 'registros'
_ACOES_LISTA = {'GET': 'visualizar', 'POST': 'criar'}
_ACOES_ITEM = {'GET': 'visualizar', 'PUT': 'editar', 'DELETE': 'excluir'}


def _negar_se_sem_permissao(mapa):
    acao = mapa.get(request.method)
    if acao and not check_permission('registros', acao):
        return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)
    return None


def _parse_date(value):
    if not value:
        return datetime.now().date()
    if hasattr(value, 'date') and not isinstance(value, str):
        return value
    return datetime.strptime(value, '%Y-%m-%d').date()


def _to_int(value, default=0):
    if value in (None, ''):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _to_decimal_or_none(value):
    if value in (None, ''):
        return None
    try:
        return Decimal(str(value).replace(',', '.'))
    except (InvalidOperation, ValueError):
        return None


def _to_bool_or_none(value):
    if value is True or value is False:
        return value
    if value in (None, ''):
        return None
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in ('true', '1', 'sim', 's', 'conforme'):
            return True
        if normalized in ('false', '0', 'nao', 'não', 'n', 'nc'):
            return False
    return None


def _checklist_item(checklist, chave):
    item = checklist.get(chave) if isinstance(checklist, dict) else None
    return item if isinstance(item, dict) else {}


def _sync_checklist(registro, dados):
    checklist = dados.get('checklist')
    if not isinstance(checklist, dict):
        return

    item = registro.checklist_testes.first()
    if not item:
        item = ChecklistTeste(registro_id=registro.id)
        db.session.add(item)

    item.codigo_barras = dados.get('codigo_barras') or registro.codigo_barras or ''

    corrente = _checklist_item(checklist, 'corrente')
    item.corrente_valor = _to_decimal_or_none(corrente.get('valor'))
    item.corrente_conforme = _to_bool_or_none(corrente.get('conforme'))
    item.corrente_obs = corrente.get('obs') or ''

    potencia = _checklist_item(checklist, 'potencia')
    item.potencia_valor = _to_decimal_or_none(potencia.get('valor'))
    item.potencia_conforme = _to_bool_or_none(potencia.get('conforme'))
    item.potencia_obs = potencia.get('obs') or ''

    for chave in ['hipot', 'etiquetas', 'plugue', 'grafismos', 'embalagens', 'pecas_injetadas', 'montagem', 'visual']:
        dados_item = _checklist_item(checklist, chave)
        setattr(item, f'{chave}_conforme', _to_bool_or_none(dados_item.get('conforme')))
        setattr(item, f'{chave}_obs', dados_item.get('obs') or '')

    item.updated_at = datetime.utcnow()


def _responsavel_correcao(dados):
    if 'responsavelCorrecao' in dados:
        return dados.get('responsavelCorrecao')
    return dados.get('responsavel_correcao')


@registros_bp.route('', methods=['GET', 'POST', 'OPTIONS'])
@limiter.limit('100 per minute')
@auth_required()
def handle_registros():
    """Listar e criar registros"""
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

            query = RegistroInspecao.query

            if search:
                search_pattern = f'%{search}%'
                query = query.filter(
                    db.or_(
                        RegistroInspecao.cod_sap.like(search_pattern),
                        RegistroInspecao.modelo.like(search_pattern),
                        RegistroInspecao.inspetor.like(search_pattern)
                    )
                )

            if status:
                query = query.filter(RegistroInspecao.status == status)

            query = query.order_by(RegistroInspecao.data_inspecao.desc(), RegistroInspecao.id.desc())
            paginated = query.paginate(page=page, per_page=per_page, error_out=False)

            registros_data = registros_schema.dump(paginated.items)

            return create_response(
                success=True,
                data=registros_data,
                message=f'Encontrados {paginated.total} registros'
            )

        except Exception as e:
            current_app.logger.error(f'Erro ao buscar registros: {str(e)}')
            return create_response(
                success=False,
                message='Erro ao buscar registros',
                status_code=500
            )

    # POST - Criar novo registro
    if request.method == 'POST':
        try:
            dados = request.get_json() or {}

            novo_registro = RegistroInspecao(
                data_inspecao=_parse_date(dados.get('data_inspecao')),
                semana=dados.get('semana'),
                cod_sap=dados.get('cod_sap'),
                linha=dados.get('linha'),
                familia=dados.get('familia'),
                modelo=dados.get('modelo'),
                descricao_sap=dados.get('descricao_sap'),
                codigo_barras=dados.get('codigo_barras'),
                qtd_total=_to_int(dados.get('qtd_total', 0)),
                qtd_inspecionada=_to_int(dados.get('qtd_inspecionada', 0)),
                qtd_nc=_to_int(dados.get('qtd_nc', 0)),
                qtd_pallet=_to_int(dados.get('qtd_pallet', 0)),
                rastreabilidade=dados.get('rastreabilidade'),
                po=dados.get('po'),
                turno=dados.get('turno'),
                linha_montagem=dados.get('linha_montagem'),
                inspetor=dados.get('inspetor', 'Sistema'),
                status=dados.get('status', 'pendente'),
                observacao=dados.get('observacao'),
                documento=dados.get('documento'),
                defeito=dados.get('defeito'),
                prioridade=dados.get('prioridade'),
                origem_problema=dados.get('origem_problema'),
                posto=dados.get('posto'),
                operador=dados.get('operador'),
                causa=dados.get('causa'),
                correcao=dados.get('correcao'),
                responsavel_correcao=_responsavel_correcao(dados)
            )

            db.session.add(novo_registro)
            db.session.flush()
            _sync_checklist(novo_registro, dados)
            db.session.commit()

            return create_response(
                success=True,
                message='Registro criado com sucesso',
                data=registro_schema.dump(novo_registro),
                status_code=201
            )

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f'Erro ao criar registro: {str(e)}')
            return create_response(
                success=False,
                message=f'Erro ao criar registro: {str(e)}',
                status_code=400
            )


@registros_bp.route('/<int:id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'])
@auth_required()
def handle_registro_individual(id):
    """GET, PUT ou DELETE em registro específico"""

    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_ITEM)
    if negado:
        return negado

    # GET - Buscar registro
    if request.method == 'GET':
        try:
            registro = RegistroInspecao.query.get(id)

            if not registro:
                return create_response(
                    success=False,
                    message=f'Registro {id} não encontrado',
                    status_code=404
                )

            return create_response(
                success=True,
                data=registro_schema.dump(registro)
            )

        except Exception as e:
            current_app.logger.error(f'Erro ao buscar registro {id}: {str(e)}')
            return create_response(
                success=False,
                message=f'Erro: {str(e)}',
                status_code=500
            )

    # PUT - Atualizar registro
    elif request.method == 'PUT':
        try:
            registro = RegistroInspecao.query.get(id)

            if not registro:
                return create_response(
                    success=False,
                    message=f'Registro {id} não encontrado',
                    status_code=404
                )

            dados = request.get_json() or {}

            # Atualizar data
            if 'data_inspecao' in dados and dados['data_inspecao']:
                if isinstance(dados['data_inspecao'], str):
                    registro.data_inspecao = datetime.strptime(dados['data_inspecao'], '%Y-%m-%d').date()

            # Atualizar outros campos
            campos = [
                'semana', 'cod_sap', 'linha', 'familia', 'modelo', 'descricao_sap',
                'codigo_barras', 'qtd_total', 'qtd_inspecionada', 'qtd_nc', 'qtd_pallet',
                'rastreabilidade', 'po', 'turno', 'linha_montagem', 'inspetor',
                'status', 'observacao', 'documento', 'defeito', 'prioridade',
                'origem_problema', 'posto', 'operador', 'causa', 'correcao'
            ]

            for campo in campos:
                if campo in dados:
                    setattr(registro, campo, dados[campo])

            if 'responsavelCorrecao' in dados or 'responsavel_correcao' in dados:
                registro.responsavel_correcao = _responsavel_correcao(dados)

            registro.updated_at = datetime.utcnow()
            _sync_checklist(registro, dados)
            db.session.commit()

            return create_response(
                success=True,
                message='Registro atualizado com sucesso',
                data=registro_schema.dump(registro)
            )

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f'Erro ao atualizar registro: {str(e)}')
            return create_response(
                success=False,
                message=f'Erro: {str(e)}',
                status_code=500
            )

    # DELETE - Excluir registro
    elif request.method == 'DELETE':
        try:
            registro = RegistroInspecao.query.get(id)

            if not registro:
                return create_response(
                    success=False,
                    message=f'Registro {id} não encontrado',
                    status_code=404
                )

            db.session.delete(registro)
            db.session.commit()

            return create_response(
                success=True,
                message='Registro excluído com sucesso'
            )

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f'Erro ao excluir registro: {str(e)}')
            return create_response(
                success=False,
                message=f'Erro ao excluir: {str(e)}',
                status_code=500
            )