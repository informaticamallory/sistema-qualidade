# routes/resumo_bloqueio.py - Resumo Diário de Bloqueio
from datetime import datetime

from flask import Blueprint, current_app, request

from app.extensions import db, limiter
from app.models.resumo_bloqueio import ResumoBloqueio, ResumoBloqueioLinha
from app.services.r2_storage import salvar_data_url
from app.utils.auth_decorators import auth_required, check_permission
from app.utils.responses import create_response

resumo_bloqueio_bp = Blueprint('resumo_bloqueio', __name__)


def _parse_date(data_iso):
    return datetime.strptime(data_iso, '%Y-%m-%d').date()


def _can_save():
    return (
        check_permission('nao_conformidades', 'criar')
        or check_permission('nao_conformidades', 'editar')
    )


def _linha_from_payload(row, ordem, data=None):
    qtd = row.get('qtd')
    try:
        qtd_valor = int(qtd) if qtd not in (None, '') else None
    except (TypeError, ValueError):
        qtd_valor = None
    evidencia = row.get('evidencia') or {}
    evidencia_nome = evidencia.get('name') or ''
    evidencia_preview = row.get('evidenciaPreview') or evidencia.get('url') or ''
    if evidencia_preview:
        evidencia_preview = salvar_data_url(
            evidencia_preview,
            evidencia_nome,
            prefixo='resumo-bloqueio',
            identificador=data.isoformat() if data else ordem
        )

    return ResumoBloqueioLinha(
        ordem=ordem,
        turno=(row.get('turno') or '')[:1],
        qtd=qtd_valor,
        produto=row.get('produto') or '',
        peca=row.get('peca') or '',
        defeito=row.get('defeito') or '',
        evidencia_nome=evidencia_nome,
        evidencia_dados=evidencia_preview
    )


@resumo_bloqueio_bp.route('/<data_iso>', methods=['GET', 'PUT', 'OPTIONS'])
@limiter.limit('100 per minute')
@auth_required()
def handle_resumo_por_data(data_iso):
    if request.method == 'OPTIONS':
        return '', 200

    try:
        data = _parse_date(data_iso)
    except ValueError:
        return create_response(success=False, message='Data inválida. Use YYYY-MM-DD.', status_code=400)

    if request.method == 'GET':
        if not check_permission('nao_conformidades', 'visualizar'):
            return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)

        try:
            resumo = ResumoBloqueio.query.filter_by(data=data).first()
            payload = resumo.to_dict() if resumo else {'data': data.isoformat(), 'rows': []}
            return create_response(success=True, data=payload)
        except Exception as e:
            current_app.logger.error(f'Erro ao buscar resumo de bloqueio {data_iso}: {str(e)}')
            return create_response(success=False, message='Erro ao buscar resumo de bloqueio', status_code=500)

    if request.method == 'PUT':
        if not _can_save():
            return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)

        try:
            dados = request.get_json() or {}
            rows = dados.get('rows') or []
            if not isinstance(rows, list):
                return create_response(success=False, message='Linhas inválidas', status_code=400)

            resumo = ResumoBloqueio.query.filter_by(data=data).first()
            if not resumo:
                resumo = ResumoBloqueio(data=data)
                db.session.add(resumo)
                db.session.flush()

            resumo.linhas = [_linha_from_payload(row, index, data) for index, row in enumerate(rows)]
            resumo.updated_at = datetime.utcnow()
            db.session.commit()

            return create_response(
                success=True,
                message='Resumo de bloqueio salvo com sucesso',
                data=resumo.to_dict()
            )
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f'Erro ao salvar resumo de bloqueio {data_iso}: {str(e)}')
            return create_response(success=False, message=f'Erro ao salvar resumo de bloqueio: {str(e)}', status_code=500)