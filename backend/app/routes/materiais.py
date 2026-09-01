# routes/materiais.py - Cadastro de material, revisões de desenho e cotas
from flask import Blueprint, request
from datetime import datetime

from app.extensions import db, limiter
from app.models.material import Material, RevisaoDesenho, PosicaoRevisao
from app.utils.responses import create_response
from app.utils.auth_decorators import auth_required, check_permission

materiais_bp = Blueprint('materiais', __name__)
revisoes_bp = Blueprint('revisoes', __name__)

_ACOES_LISTA = {'GET': 'visualizar', 'POST': 'criar'}
_ACOES_ITEM = {'GET': 'visualizar', 'PUT': 'editar', 'DELETE': 'excluir'}


def _negar_se_sem_permissao(mapa):
    """O cadastro é do módulo 'materiais', separado de 'registros': quem
    executa a inspeção não precisa poder alterar o desenho de referência."""
    acao = mapa.get(request.method)
    if acao and not check_permission('materiais', acao):
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


def _aplicar_posicoes(revisao, posicoes):
    """Substitui as posições da revisão pela lista recebida.

    Troca em bloco em vez de casar item a item: a tela edita a tabela inteira,
    e reconciliar por id abriria espaço para posições órfãs quando o usuário
    remove uma linha do meio."""
    revisao.posicoes.clear()
    for indice, item in enumerate(posicoes):
        if not isinstance(item, dict):
            continue
        posicao = _texto(item.get('posicao'), 50)
        if not posicao:
            continue
        revisao.posicoes.append(PosicaoRevisao(
            ordem=indice,
            posicao=posicao,
            cota=_texto(item.get('cota'), 120),
            instrumento=_texto(item.get('instrumento'), 120),
            observacoes=_texto(item.get('observacoes'))
        ))


# ==================== MATERIAIS ====================
@materiais_bp.route('', methods=['GET', 'POST', 'OPTIONS'])
@limiter.limit("120 per minute")
@auth_required()
def handle_materiais():
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
            codigo_sap = _texto(request.args.get('codigo_sap', ''))

            query = Material.query
            if codigo_sap:
                query = query.filter(Material.codigo_sap == codigo_sap)
            if search:
                like = f'%{search}%'
                query = query.filter(db.or_(
                    Material.codigo_sap.like(like),
                    Material.componente.like(like),
                    Material.fornecedor.like(like)
                ))

            paginado = query.order_by(Material.codigo_sap).paginate(
                page=page, per_page=per_page, error_out=False)

            return create_response(data={
                'materiais': [m.to_dict(incluir_revisoes=True) for m in paginado.items],
                'total': paginado.total,
                'page': paginado.page,
                'pages': paginado.pages
            })
        except Exception as e:
            return create_response(success=False, message=f'Erro ao listar materiais: {str(e)}', status_code=500)

    # POST — cria material e revisão numa tacada. É como a tela salva: o
    # inspetor de engenharia digita o código e a revisão juntos, e o material
    # pode ainda não existir.
    try:
        dados = request.get_json() or {}

        codigo_sap = _texto(dados.get('codigo_sap'), 50)
        revisao_nome = _texto(dados.get('revisao_desenho') or dados.get('revisao'), 50)
        posicoes = dados.get('posicoes') or []

        faltando = [rotulo for valor, rotulo in (
            (codigo_sap, 'Cód. SAP'), (revisao_nome, 'Revisão do desenho')) if not valor]
        if faltando:
            return create_response(success=False,
                                   message=f'Campos obrigatórios: {", ".join(faltando)}',
                                   status_code=400)

        if not [p for p in posicoes if isinstance(p, dict) and _texto(p.get('posicao'))]:
            return create_response(success=False,
                                   message='Informe ao menos uma posição/cota para a revisão',
                                   status_code=400)

        material = Material.query.filter_by(codigo_sap=codigo_sap).first()
        if not material:
            material = Material(codigo_sap=codigo_sap)
            db.session.add(material)

        # Os dados do material acompanham a revisão mais recente informada.
        for campo, limite in (('componente', 255), ('aplicacao', 255),
                              ('setor', 100), ('fornecedor', 255)):
            if campo in dados:
                setattr(material, campo, _texto(dados.get(campo), limite))

        db.session.flush()

        duplicada = RevisaoDesenho.query.filter_by(
            material_id=material.id, revisao=revisao_nome).first()
        if duplicada:
            return create_response(
                success=False,
                message=f'A revisão "{revisao_nome}" já existe para o código {codigo_sap}',
                status_code=409)

        revisao = RevisaoDesenho(
            material=material,
            revisao=revisao_nome,
            data=_parse_date(dados.get('data')),
            observacoes=_texto(dados.get('observacoes'))
        )
        db.session.add(revisao)
        _aplicar_posicoes(revisao, posicoes)

        db.session.commit()
        return create_response(
            data=revisao.to_dict(incluir_posicoes=True, incluir_material=True),
            message='Material e revisão cadastrados com sucesso', status_code=201)
    except Exception as e:
        db.session.rollback()
        return create_response(success=False, message=f'Erro ao salvar material: {str(e)}', status_code=500)


@materiais_bp.route('/<int:id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'])
@limiter.limit("120 per minute")
@auth_required()
def handle_material(id):
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_ITEM)
    if negado:
        return negado

    material = Material.query.get(id)
    if not material:
        return create_response(success=False, message='Material não encontrado', status_code=404)

    if request.method == 'GET':
        return create_response(data=material.to_dict(incluir_revisoes=True))

    if request.method == 'PUT':
        try:
            dados = request.get_json() or {}
            if 'codigo_sap' in dados:
                novo = _texto(dados.get('codigo_sap'), 50)
                if not novo:
                    return create_response(success=False, message='Cód. SAP é obrigatório', status_code=400)
                conflito = Material.query.filter(Material.codigo_sap == novo, Material.id != id).first()
                if conflito:
                    return create_response(success=False,
                                           message=f'Já existe material com o código {novo}',
                                           status_code=409)
                material.codigo_sap = novo
            for campo, limite in (('componente', 255), ('aplicacao', 255),
                                  ('setor', 100), ('fornecedor', 255)):
                if campo in dados:
                    setattr(material, campo, _texto(dados.get(campo), limite))
            db.session.commit()
            return create_response(data=material.to_dict(incluir_revisoes=True),
                                   message='Material atualizado com sucesso')
        except Exception as e:
            db.session.rollback()
            return create_response(success=False, message=f'Erro ao atualizar material: {str(e)}', status_code=500)

    # DELETE — barra a exclusão se houver inspeção apontando para o material,
    # senão o histórico ficaria com referência quebrada.
    try:
        from app.models.inspecao_recebimento import InspecaoRecebimento
        em_uso = InspecaoRecebimento.query.filter_by(material_id=id).count()
        if em_uso:
            return create_response(
                success=False,
                message=f'Material com {em_uso} inspeção(ões) registrada(s) não pode ser excluído',
                status_code=409)
        db.session.delete(material)
        db.session.commit()
        return create_response(message='Material excluído com sucesso')
    except Exception as e:
        db.session.rollback()
        return create_response(success=False, message=f'Erro ao excluir material: {str(e)}', status_code=500)


@materiais_bp.route('/<int:id>/revisoes', methods=['GET', 'POST', 'OPTIONS'])
@limiter.limit("120 per minute")
@auth_required()
def handle_revisoes_do_material(id):
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_LISTA)
    if negado:
        return negado

    material = Material.query.get(id)
    if not material:
        return create_response(success=False, message='Material não encontrado', status_code=404)

    if request.method == 'GET':
        return create_response(data={'revisoes': [r.to_dict() for r in material.revisoes]})

    try:
        dados = request.get_json() or {}
        revisao_nome = _texto(dados.get('revisao_desenho') or dados.get('revisao'), 50)
        if not revisao_nome:
            return create_response(success=False, message='Revisão do desenho é obrigatória', status_code=400)

        posicoes = dados.get('posicoes') or []
        if not [p for p in posicoes if isinstance(p, dict) and _texto(p.get('posicao'))]:
            return create_response(success=False,
                                   message='Informe ao menos uma posição/cota para a revisão',
                                   status_code=400)

        if RevisaoDesenho.query.filter_by(material_id=id, revisao=revisao_nome).first():
            return create_response(success=False,
                                   message=f'A revisão "{revisao_nome}" já existe para este material',
                                   status_code=409)

        revisao = RevisaoDesenho(
            material=material,
            revisao=revisao_nome,
            data=_parse_date(dados.get('data')),
            observacoes=_texto(dados.get('observacoes'))
        )
        db.session.add(revisao)
        _aplicar_posicoes(revisao, posicoes)
        db.session.commit()
        return create_response(data=revisao.to_dict(incluir_posicoes=True),
                               message='Revisão cadastrada com sucesso', status_code=201)
    except Exception as e:
        db.session.rollback()
        return create_response(success=False, message=f'Erro ao salvar revisão: {str(e)}', status_code=500)


# ==================== REVISÕES ====================
@revisoes_bp.route('/<int:rev_id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'])
@limiter.limit("120 per minute")
@auth_required()
def handle_revisao(rev_id):
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_ITEM)
    if negado:
        return negado

    revisao = RevisaoDesenho.query.get(rev_id)
    if not revisao:
        return create_response(success=False, message='Revisão não encontrada', status_code=404)

    if request.method == 'GET':
        return create_response(data=revisao.to_dict(incluir_posicoes=True, incluir_material=True))

    if request.method == 'PUT':
        try:
            dados = request.get_json() or {}

            if 'revisao_desenho' in dados or 'revisao' in dados:
                novo = _texto(dados.get('revisao_desenho') or dados.get('revisao'), 50)
                if not novo:
                    return create_response(success=False, message='Revisão do desenho é obrigatória', status_code=400)
                conflito = RevisaoDesenho.query.filter(
                    RevisaoDesenho.material_id == revisao.material_id,
                    RevisaoDesenho.revisao == novo,
                    RevisaoDesenho.id != rev_id).first()
                if conflito:
                    return create_response(success=False,
                                           message=f'A revisão "{novo}" já existe para este material',
                                           status_code=409)
                revisao.revisao = novo

            if 'data' in dados:
                revisao.data = _parse_date(dados.get('data'))
            if 'observacoes' in dados:
                revisao.observacoes = _texto(dados.get('observacoes'))

            if 'posicoes' in dados:
                posicoes = dados.get('posicoes') or []
                if not [p for p in posicoes if isinstance(p, dict) and _texto(p.get('posicao'))]:
                    return create_response(success=False,
                                           message='A revisão precisa de ao menos uma posição/cota',
                                           status_code=400)
                _aplicar_posicoes(revisao, posicoes)

            db.session.commit()
            return create_response(data=revisao.to_dict(incluir_posicoes=True),
                                   message='Revisão atualizada com sucesso')
        except Exception as e:
            db.session.rollback()
            return create_response(success=False, message=f'Erro ao atualizar revisão: {str(e)}', status_code=500)

    try:
        from app.models.inspecao_recebimento import InspecaoRecebimento
        em_uso = InspecaoRecebimento.query.filter_by(revisao_id=rev_id).count()
        if em_uso:
            return create_response(
                success=False,
                message=f'Revisão usada por {em_uso} inspeção(ões) não pode ser excluída',
                status_code=409)
        db.session.delete(revisao)
        db.session.commit()
        return create_response(message='Revisão excluída com sucesso')
    except Exception as e:
        db.session.rollback()
        return create_response(success=False, message=f'Erro ao excluir revisão: {str(e)}', status_code=500)


@revisoes_bp.route('/<int:rev_id>/posicoes', methods=['GET', 'OPTIONS'])
@limiter.limit("200 per minute")
@auth_required()
def listar_posicoes(rev_id):
    """Usado pela tela de inspeção para montar a aba de Resultados.

    Exige apenas leitura do módulo 'registros': quem inspeciona precisa ver as
    cotas mesmo sem poder cadastrá-las."""
    if request.method == 'OPTIONS':
        return '', 200

    if not (check_permission('registros', 'visualizar') or check_permission('materiais', 'visualizar')):
        return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)

    revisao = RevisaoDesenho.query.get(rev_id)
    if not revisao:
        return create_response(success=False, message='Revisão não encontrada', status_code=404)

    return create_response(data={'posicoes': [p.to_dict() for p in revisao.posicoes]})
