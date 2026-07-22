# routes/nao_conformidades.py - Rotas dedicadas para Fichas NC
from datetime import datetime
from decimal import Decimal, InvalidOperation

from flask import Blueprint, request, current_app

from app.extensions import db, limiter
from app.models.ficha_nc import FichaNC
from app.models.registro import RegistroInspecao
from app.utils.responses import create_response
from app.utils.auth_decorators import auth_required, check_permission

nao_conformidades_bp = Blueprint('nao_conformidades', __name__)
MANUAL_ID_OFFSET = 1000000000


def _tem_permissao_visualizar():
    return check_permission('nao_conformidades', 'visualizar')


def _tem_permissao_salvar():
    return (
        check_permission('nao_conformidades', 'criar')
        or check_permission('nao_conformidades', 'editar')
    )


def _tem_permissao_excluir():
    return check_permission('nao_conformidades', 'excluir')


def _negar_se_sem_visualizacao():
    if not _tem_permissao_visualizar():
        return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)
    return None


def _parse_date(value):
    if not value:
        return None
    if hasattr(value, 'date') and not isinstance(value, str):
        return value
    try:
        return datetime.strptime(str(value), '%Y-%m-%d').date()
    except ValueError:
        return None


def _to_int(value, default=0):
    if value in (None, ''):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _to_decimal(value, default=0):
    if value in (None, ''):
        return default
    try:
        return Decimal(str(value).replace(',', '.'))
    except (InvalidOperation, ValueError):
        return default


def _base_ficha(registro):
    return FichaNC(
        fonte_registro_id=registro.id,
        numero_fnc=f'FNC-{registro.id}',
        codigo=registro.cod_sap or '',
        produto=registro.modelo or registro.descricao_sap or '',
        data=registro.data_inspecao or datetime.utcnow().date(),
        quantidade=registro.qtd_total or 0,
        qtd_nao_conforme=registro.qtd_nc or 0,
        qtd_inspecionadas=registro.qtd_inspecionada or 0,
        descricao_nc=registro.defeito or registro.observacao or '',
        observacoes=registro.observacao or '',
        status='Aberta'
    )


def _buscar_ficha_do_registro(registro):
    numero = f'FNC-{registro.id}'
    return (
        FichaNC.query
        .filter(FichaNC.deleted_at.is_(None))
        .filter(db.or_(FichaNC.fonte_registro_id == registro.id, FichaNC.numero_fnc == numero))
        .order_by(FichaNC.fonte_registro_id.desc(), FichaNC.id.desc())
        .first()
    )


def _dados_ficha(registro=None, ficha=None):
    if ficha:
        dados = ficha.to_dict(registro=registro)
        if not registro and not ficha.fonte_registro_id:
            dados['id'] = MANUAL_ID_OFFSET + ficha.id
        return dados
    if registro:
        return _base_ficha(registro).to_dict(registro=registro)
    return None


def _aplicar_payload(ficha, dados, registro=None):
    if registro:
        ficha.fonte_registro_id = registro.id
        if not ficha.numero_fnc:
            ficha.numero_fnc = f'FNC-{registro.id}'
        if not ficha.codigo:
            ficha.codigo = registro.cod_sap or ''
        if not ficha.produto:
            ficha.produto = registro.modelo or registro.descricao_sap or ''
        if not ficha.data:
            ficha.data = registro.data_inspecao or datetime.utcnow().date()
        if ficha.quantidade is None:
            ficha.quantidade = registro.qtd_total or 0
        if ficha.qtd_nao_conforme is None:
            ficha.qtd_nao_conforme = registro.qtd_nc or 0
        if ficha.qtd_inspecionadas is None:
            ficha.qtd_inspecionadas = registro.qtd_inspecionada or 0

    if 'numero_fnc' in dados and dados.get('numero_fnc'):
        ficha.numero_fnc = dados.get('numero_fnc')

    if 'data_fnc' in dados:
        ficha.data = _parse_date(dados.get('data_fnc')) or ficha.data

    text_fields = {
        'de_departamento': 'de_departamento',
        'para_departamento': 'para_departamento',
        'nf_po': 'nf_po',
        'num_serie': 'num_serie',
        'descricao_nc': 'descricao_nc',
        'disposicao': 'disposicao',
        'acao_imediata': 'acao_imediata',
        'correcao': 'correcao',
        'acao_corretiva': 'acao_corretiva',
        'responsavel_acao': 'responsavel_acao',
        'decisao_final': 'decisao_final',
        'status': 'status',
        'observacoes': 'observacoes',
        'inspecao_resultado': 'inspecao_resultado',
        'aprovacao_qc': 'aprovacao_qc',
        'aprovacao_responsavel': 'aprovacao_responsavel',
        'aprovacao_manager': 'aprovacao_manager',
        'responsavel': 'responsavel',
    }
    for origem, destino in text_fields.items():
        if origem in dados:
            setattr(ficha, destino, dados.get(origem) or '')

    codigo = dados.get('codigo') if 'codigo' in dados else dados.get('cod_sap')
    if codigo is not None:
        ficha.codigo = codigo or ''

    produto = dados.get('produto') if 'produto' in dados else dados.get('modelo')
    if produto is not None:
        ficha.produto = produto or ''

    if 'foto_nc' in dados:
        ficha.evidencia_foto = dados.get('foto_nc') or ''
    if 'foto_nc_nome' in dados:
        ficha.evidencia_foto_nome = dados.get('foto_nc_nome') or ''

    if 'quantidade' in dados:
        ficha.quantidade = _to_int(dados.get('quantidade'))
    if 'qtd_nao_conforme' in dados:
        ficha.qtd_nao_conforme = _to_int(dados.get('qtd_nao_conforme'))
    elif 'qtd_nc' in dados:
        ficha.qtd_nao_conforme = _to_int(dados.get('qtd_nc'))
    if 'qtd_inspecionadas' in dados:
        ficha.qtd_inspecionadas = _to_int(dados.get('qtd_inspecionadas'))
    elif 'qtd_inspecionada' in dados:
        ficha.qtd_inspecionadas = _to_int(dados.get('qtd_inspecionada'))
    if 'indice' in dados:
        ficha.indice = _to_decimal(dados.get('indice'))

    porques_keys = [f'porque_{idx}' for idx in range(1, 6)]
    if any(key in dados for key in porques_keys):
        atuais = ficha._porques_dict()
        for key in porques_keys:
            if key in dados:
                atuais[key] = dados.get(key) or ''
        ficha.porques = atuais

    if 'prazo_acao' in dados:
        ficha.prazo_acao = _parse_date(dados.get('prazo_acao'))
    if 'data_inspecao' in dados:
        ficha.data_inspecao = _parse_date(dados.get('data_inspecao'))

    numeric_fields = {
        'total_horas': 'custo_horas',
        'taxa_trabalho': 'custo_trabalho',
        'custo_material': 'custo_material',
        'custo_refugo': 'custo_refugo',
        'taxa_cambio': 'taxa_cambio',
    }
    for origem, destino in numeric_fields.items():
        if origem in dados:
            setattr(ficha, destino, _to_decimal(dados.get(origem)))

    if not ficha.numero_fnc:
        ficha.numero_fnc = f"FNC-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    if not ficha.data:
        ficha.data = datetime.utcnow().date()
    if not ficha.produto:
        ficha.produto = dados.get('produto') or dados.get('modelo') or 'NÃO INFORMADO'
    if ficha.status in (None, ''):
        ficha.status = 'Aberta'

    ficha.updated_at = datetime.utcnow()
    return ficha


@nao_conformidades_bp.route('', methods=['GET', 'POST', 'OPTIONS'])
@limiter.limit('100 per minute')
@auth_required()
def listar_nao_conformidades():
    """Lista registros reprovados e salva fichas NC completas."""
    if request.method == 'OPTIONS':
        return '', 200

    if request.method == 'GET':
        negado = _negar_se_sem_visualizacao()
        if negado:
            return negado

        try:
            page = request.args.get('page', 1, type=int)
            per_page = min(request.args.get('limit', 50, type=int), 100)
            search = request.args.get('search', '')
            status = request.args.get('status', 'reprovado')

            query = RegistroInspecao.query

            if status:
                query = query.filter(RegistroInspecao.status == status)

            if search:
                search_pattern = f'%{search}%'
                query = query.filter(
                    db.or_(
                        RegistroInspecao.cod_sap.like(search_pattern),
                        RegistroInspecao.modelo.like(search_pattern),
                        RegistroInspecao.inspetor.like(search_pattern),
                        RegistroInspecao.defeito.like(search_pattern),
                    )
                )

            query = query.order_by(RegistroInspecao.data_inspecao.desc(), RegistroInspecao.id.desc())
            paginated = query.paginate(page=page, per_page=per_page, error_out=False)

            dados = []
            for registro in paginated.items:
                ficha = _buscar_ficha_do_registro(registro)
                dados.append(_dados_ficha(registro=registro, ficha=ficha))

            manuais_query = FichaNC.query.filter(
                FichaNC.deleted_at.is_(None),
                FichaNC.fonte_registro_id.is_(None)
            )
            if search:
                search_pattern = f'%{search}%'
                manuais_query = manuais_query.filter(
                    db.or_(
                        FichaNC.numero_fnc.like(search_pattern),
                        FichaNC.codigo.like(search_pattern),
                        FichaNC.produto.like(search_pattern),
                        FichaNC.descricao_nc.like(search_pattern),
                    )
                )

            manuais = manuais_query.order_by(FichaNC.data.desc(), FichaNC.id.desc()).limit(per_page).all()
            dados.extend(_dados_ficha(ficha=ficha) for ficha in manuais)

            return create_response(
                success=True,
                data=dados,
                message=f'Encontradas {paginated.total + len(manuais)} fichas NC'
            )

        except Exception as e:
            current_app.logger.error(f'Erro ao buscar Fichas NC: {str(e)}')
            return create_response(success=False, message='Erro ao buscar Fichas NC', status_code=500)

    if request.method == 'POST':
        if not _tem_permissao_salvar():
            return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)

        try:
            dados = request.get_json() or {}
            registro = None
            fonte_id = dados.get('fonte_registro_id')
            if fonte_id:
                registro = RegistroInspecao.query.get(fonte_id)

            numero = dados.get('numero_fnc')
            ficha = None
            if registro:
                ficha = _buscar_ficha_do_registro(registro)
            if not ficha and numero:
                ficha = FichaNC.query.filter(FichaNC.deleted_at.is_(None), FichaNC.numero_fnc == numero).first()
            if not ficha:
                ficha = FichaNC(created_at=datetime.utcnow())
                db.session.add(ficha)

            _aplicar_payload(ficha, dados, registro=registro)
            db.session.commit()

            return create_response(
                success=True,
                message='Ficha NC salva com sucesso',
                data=_dados_ficha(registro=registro, ficha=ficha),
                status_code=201
            )
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f'Erro ao salvar Ficha NC: {str(e)}')
            return create_response(success=False, message=f'Erro ao salvar Ficha NC: {str(e)}', status_code=500)


@nao_conformidades_bp.route('/<int:id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'])
@auth_required()
def obter_nao_conformidade(id):
    """Busca, atualiza ou remove uma Ficha NC."""
    if request.method == 'OPTIONS':
        return '', 200

    if request.method == 'GET':
        negado = _negar_se_sem_visualizacao()
        if negado:
            return negado

        try:
            manual_id = id - MANUAL_ID_OFFSET if id >= MANUAL_ID_OFFSET else None
            registro = None if manual_id else RegistroInspecao.query.get(id)
            if registro:
                ficha = _buscar_ficha_do_registro(registro)
                return create_response(success=True, data=_dados_ficha(registro=registro, ficha=ficha))

            ficha_id = manual_id or id
            ficha = FichaNC.query.filter(FichaNC.deleted_at.is_(None), FichaNC.id == ficha_id).first()
            if not ficha:
                return create_response(success=False, message='Ficha NC não encontrada', status_code=404)
            return create_response(success=True, data=_dados_ficha(ficha=ficha))
        except Exception as e:
            current_app.logger.error(f'Erro ao buscar Ficha NC {id}: {str(e)}')
            return create_response(success=False, message='Erro ao buscar Ficha NC', status_code=500)

    if request.method == 'PUT':
        if not _tem_permissao_salvar():
            return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)

        try:
            dados = request.get_json() or {}
            manual_id = id - MANUAL_ID_OFFSET if id >= MANUAL_ID_OFFSET else None
            registro = None if manual_id else RegistroInspecao.query.get(id)
            numero = dados.get('numero_fnc') or (f'FNC-{id}' if registro else None)

            ficha = None
            if registro:
                ficha = _buscar_ficha_do_registro(registro)
            if not ficha and numero:
                ficha = FichaNC.query.filter(FichaNC.deleted_at.is_(None), FichaNC.numero_fnc == numero).first()
            if not ficha and not registro:
                ficha_id = manual_id or id
                ficha = FichaNC.query.filter(FichaNC.deleted_at.is_(None), FichaNC.id == ficha_id).first()
            if not ficha:
                ficha = FichaNC(created_at=datetime.utcnow())
                db.session.add(ficha)

            _aplicar_payload(ficha, dados, registro=registro)
            db.session.commit()

            return create_response(
                success=True,
                message='Ficha NC atualizada com sucesso',
                data=_dados_ficha(registro=registro, ficha=ficha)
            )
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f'Erro ao atualizar Ficha NC {id}: {str(e)}')
            return create_response(success=False, message=f'Erro ao atualizar Ficha NC: {str(e)}', status_code=500)

    if request.method == 'DELETE':
        if not _tem_permissao_excluir():
            return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)

        try:
            manual_id = id - MANUAL_ID_OFFSET if id >= MANUAL_ID_OFFSET else None
            registro = None if manual_id else RegistroInspecao.query.get(id)
            ficha = _buscar_ficha_do_registro(registro) if registro else None
            if not ficha:
                ficha_id = manual_id or id
                ficha = FichaNC.query.filter(FichaNC.deleted_at.is_(None), FichaNC.id == ficha_id).first()
            if not ficha:
                return create_response(success=False, message='Ficha NC não encontrada', status_code=404)

            ficha.deleted_at = datetime.utcnow()
            db.session.commit()
            return create_response(success=True, message='Ficha NC removida com sucesso')
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f'Erro ao remover Ficha NC {id}: {str(e)}')
            return create_response(success=False, message=f'Erro ao remover Ficha NC: {str(e)}', status_code=500)