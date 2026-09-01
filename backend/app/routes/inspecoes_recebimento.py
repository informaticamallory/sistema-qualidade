# routes/inspecoes_recebimento.py - Inspeção de lote recebido
from flask import Blueprint, request
from datetime import datetime

from app.extensions import db, limiter
from app.models.material import Material, RevisaoDesenho
from app.models.inspecao_recebimento import InspecaoRecebimento, ResultadoInspecao
from app.utils.responses import create_response
from app.utils.auth_decorators import auth_required, check_permission, _current_user

inspecoes_recebimento_bp = Blueprint('inspecoes_recebimento', __name__)

_ACOES_LISTA = {'GET': 'visualizar', 'POST': 'criar'}
_ACOES_ITEM = {'GET': 'visualizar', 'PUT': 'editar', 'DELETE': 'excluir'}

_STATUS_VALIDOS = {'ok', 'nok'}


def _negar_se_sem_permissao(mapa):
    """Executar a inspeção fica no módulo 'registros', como o recebimento
    sempre esteve — cadastrar o desenho é que exige o módulo 'materiais'."""
    acao = mapa.get(request.method)
    if acao and not check_permission('registros', acao):
        return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)
    return None


def _parse_date(value):
    if value and isinstance(value, str):
        try:
            return datetime.strptime(str(value)[:10], '%Y-%m-%d').date()
        except ValueError:
            return None
    return None


def _texto(valor, limite=None):
    texto = str(valor).strip() if valor is not None else ''
    return texto[:limite] if limite else texto


def _inteiro(valor, padrao=0):
    try:
        return int(valor)
    except (TypeError, ValueError):
        return padrao


def _aplicar_resultados(inspecao, revisao, resultados):
    """Grava as medições, tomando a revisão como fonte da lista de posições.

    A posição e a cota são copiadas para dentro do resultado em vez de só
    referenciadas: se o desenho for revisado depois, a inspeção fechada
    continua mostrando o que foi de fato medido."""
    por_posicao = {p.id: p for p in revisao.posicoes}
    enviados = {}
    for item in (resultados or []):
        if isinstance(item, dict):
            enviados[_inteiro(item.get('posicao_revisao_id'), -1)] = item

    inspecao.resultados.clear()
    for indice, posicao in enumerate(revisao.posicoes):
        item = enviados.get(posicao.id, {})
        status = _texto(item.get('status')).lower()
        inspecao.resultados.append(ResultadoInspecao(
            posicao_revisao_id=posicao.id,
            ordem=indice,
            posicao=posicao.posicao,
            cota_nominal=posicao.cota,
            instrumento=posicao.instrumento,
            valor_medido=_texto(item.get('valor_medido'), 120),
            observacao=_texto(item.get('observacao')),
            status=status if status in _STATUS_VALIDOS else None
        ))

    # Posições enviadas que não existem mais na revisão são descartadas de
    # propósito: a revisão é a referência, não o payload da tela.
    return [pid for pid in enviados if pid not in por_posicao and pid != -1]


@inspecoes_recebimento_bp.route('', methods=['GET', 'POST', 'OPTIONS'])
@limiter.limit("120 per minute")
@auth_required()
def handle_inspecoes():
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_LISTA)
    if negado:
        return negado

    if request.method == 'GET':
        try:
            page = request.args.get('page', 1, type=int)
            per_page = min(request.args.get('limit', 50, type=int), 100)
            search = _texto(request.args.get('search', ''))
            status = _texto(request.args.get('status', ''))
            data_inicio = _parse_date(request.args.get('data_inicio'))
            data_fim = _parse_date(request.args.get('data_fim'))

            query = InspecaoRecebimento.query.join(Material)
            if search:
                like = f'%{search}%'
                query = query.filter(db.or_(
                    Material.codigo_sap.like(like),
                    Material.componente.like(like),
                    InspecaoRecebimento.lote.like(like),
                    InspecaoRecebimento.nota_fiscal.like(like),
                    InspecaoRecebimento.fornecedor.like(like)
                ))
            if status:
                query = query.filter(InspecaoRecebimento.status == status)
            if data_inicio:
                query = query.filter(InspecaoRecebimento.data_inspecao >= data_inicio)
            if data_fim:
                query = query.filter(InspecaoRecebimento.data_inspecao <= data_fim)

            paginado = query.order_by(
                InspecaoRecebimento.data_inspecao.desc(),
                InspecaoRecebimento.id.desc()
            ).paginate(page=page, per_page=per_page, error_out=False)

            return create_response(data={
                'inspecoes': [i.to_dict() for i in paginado.items],
                'total': paginado.total,
                'page': paginado.page,
                'pages': paginado.pages
            })
        except Exception as e:
            return create_response(success=False, message=f'Erro ao listar inspeções: {str(e)}', status_code=500)

    try:
        dados = request.get_json() or {}

        revisao_id = _inteiro(dados.get('revisao_id'), 0)
        revisao = RevisaoDesenho.query.get(revisao_id) if revisao_id else None
        if not revisao:
            return create_response(success=False,
                                   message='Selecione uma revisão de desenho válida',
                                   status_code=400)
        if not revisao.posicoes:
            return create_response(success=False,
                                   message='A revisão selecionada não tem posições cadastradas',
                                   status_code=400)

        usuario = _current_user()

        inspecao = InspecaoRecebimento(
            material_id=revisao.material_id,
            revisao_id=revisao.id,
            # Herda do material, mas aceita divergir: o mesmo item pode chegar
            # de outro fornecedor sem alterar o cadastro.
            fornecedor=_texto(dados.get('fornecedor'), 255) or (revisao.material.fornecedor if revisao.material else None),
            lote=_texto(dados.get('lote'), 100),
            data_entrada=_parse_date(dados.get('data_entrada')),
            data_inspecao=_parse_date(dados.get('data_inspecao')) or datetime.utcnow().date(),
            nota_fiscal=_texto(dados.get('nota_fiscal'), 50),
            quantidade_total=_inteiro(dados.get('quantidade_total')),
            # Vem da sessão, não do corpo: o inspetor é quem está logado.
            inspetor_id=usuario.id if usuario else None,
            inspetor_nome=usuario.nome if usuario else None,
            observacao=_texto(dados.get('observacao'))
        )
        db.session.add(inspecao)
        _aplicar_resultados(inspecao, revisao, dados.get('resultados'))

        status_informado = _texto(dados.get('status')).lower()
        inspecao.status = status_informado or inspecao.calcular_status()

        db.session.commit()
        return create_response(data=inspecao.to_dict(incluir_resultados=True),
                               message='Inspeção registrada com sucesso', status_code=201)
    except Exception as e:
        db.session.rollback()
        return create_response(success=False, message=f'Erro ao salvar inspeção: {str(e)}', status_code=500)


@inspecoes_recebimento_bp.route('/<int:id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'])
@limiter.limit("120 per minute")
@auth_required()
def handle_inspecao(id):
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_ITEM)
    if negado:
        return negado

    inspecao = InspecaoRecebimento.query.get(id)
    if not inspecao:
        return create_response(success=False, message='Inspeção não encontrada', status_code=404)

    if request.method == 'GET':
        return create_response(data=inspecao.to_dict(incluir_resultados=True))

    if request.method == 'PUT':
        try:
            dados = request.get_json() or {}

            if 'revisao_id' in dados:
                nova = RevisaoDesenho.query.get(_inteiro(dados.get('revisao_id'), 0))
                if not nova:
                    return create_response(success=False, message='Revisão inválida', status_code=400)
                inspecao.revisao_id = nova.id
                inspecao.material_id = nova.material_id

            for campo, limite in (('fornecedor', 255), ('lote', 100),
                                  ('nota_fiscal', 50)):
                if campo in dados:
                    setattr(inspecao, campo, _texto(dados.get(campo), limite))
            if 'observacao' in dados:
                inspecao.observacao = _texto(dados.get('observacao'))
            if 'quantidade_total' in dados:
                inspecao.quantidade_total = _inteiro(dados.get('quantidade_total'))
            for campo in ('data_entrada', 'data_inspecao'):
                if campo in dados:
                    setattr(inspecao, campo, _parse_date(dados.get(campo)))

            if 'resultados' in dados:
                _aplicar_resultados(inspecao, inspecao.revisao, dados.get('resultados'))

            status_informado = _texto(dados.get('status')).lower()
            inspecao.status = status_informado or inspecao.calcular_status()

            db.session.commit()
            return create_response(data=inspecao.to_dict(incluir_resultados=True),
                                   message='Inspeção atualizada com sucesso')
        except Exception as e:
            db.session.rollback()
            return create_response(success=False, message=f'Erro ao atualizar inspeção: {str(e)}', status_code=500)

    try:
        db.session.delete(inspecao)
        db.session.commit()
        return create_response(message='Inspeção excluída com sucesso')
    except Exception as e:
        db.session.rollback()
        return create_response(success=False, message=f'Erro ao excluir inspeção: {str(e)}', status_code=500)


@inspecoes_recebimento_bp.route('/<int:id>/resultados', methods=['PUT', 'OPTIONS'])
@limiter.limit("120 per minute")
@auth_required()
def salvar_resultados(id):
    """Grava só a matriz de medições, sem tocar nos dados gerais."""
    if request.method == 'OPTIONS':
        return '', 200

    if not check_permission('registros', 'editar'):
        return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)

    inspecao = InspecaoRecebimento.query.get(id)
    if not inspecao:
        return create_response(success=False, message='Inspeção não encontrada', status_code=404)

    try:
        dados = request.get_json() or {}
        _aplicar_resultados(inspecao, inspecao.revisao, dados.get('resultados'))
        status_informado = _texto(dados.get('status')).lower()
        inspecao.status = status_informado or inspecao.calcular_status()
        db.session.commit()
        return create_response(data=inspecao.to_dict(incluir_resultados=True),
                               message='Resultados salvos com sucesso')
    except Exception as e:
        db.session.rollback()
        return create_response(success=False, message=f'Erro ao salvar resultados: {str(e)}', status_code=500)
