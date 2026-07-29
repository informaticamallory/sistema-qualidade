# routes/injecao.py - Rotas de inspeção de injeção (peças plásticas)
from flask import Blueprint, request, current_app
from datetime import datetime

from app.extensions import db, limiter
from app.models.injecao import RegistroInjecao
from app.schemas.injecao import injecao_schema, injecoes_schema
from app.utils.responses import create_response
from app.utils.auth_decorators import auth_required, check_permission

injecao_bp = Blueprint('injecao', __name__)

_ACOES_LISTA = {'GET': 'visualizar', 'POST': 'criar'}
_ACOES_ITEM = {'GET': 'visualizar', 'PUT': 'editar', 'DELETE': 'excluir'}


def _negar_se_sem_permissao(mapa):
    acao = mapa.get(request.method)
    if acao and not check_permission('injecao', acao):
        return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)
    return None

# Campos atualizáveis (todos exceto data, tratada à parte)
CAMPOS = [
    'semana', 'turno_injecao', 'maquina', 'modelo_maquina', 'cod', 'peca', 'molde',
    'amostra_insp', 'amostra_nc', 'qtde_lote', 'peso',
    'status', 'defeito', 'cota1', 'cota2', 'cota3', 'cota4',
    'visual', 'cor_padrao', 'encaixe', 'contra_peca', 'rebarbas',
    'funcional', 'observacao', 'inspetor'
]


@injecao_bp.route('/maquinas', methods=['GET'])
@limiter.limit('100 per minute')
@auth_required()
def buscar_maquinas_injecao():
    """Busca máquinas e seus modelos cadastrados para o autocomplete."""
    if not check_permission('injecao', 'visualizar'):
        return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)

    termo = (request.args.get('search') or '').strip()
    try:
        linhas = db.session.execute(
            db.text('''
                SELECT DISTINCT `maquina`, `modelo`
                FROM `tb_maquinas_inj`
                WHERE `maquina` IS NOT NULL
                  AND TRIM(`maquina`) <> ''
                  AND (`maquina` LIKE :termo OR `modelo` LIKE :termo)
                ORDER BY `maquina`
                LIMIT 15
            '''),
            {'termo': f'%{termo}%'}
        ).mappings().all()
        return create_response(success=True, data=[dict(linha) for linha in linhas])
    except Exception as e:
        current_app.logger.error(f'Erro ao buscar máquinas de injeção: {str(e)}')
        return create_response(success=False, message='Erro ao buscar máquinas', status_code=500)

@injecao_bp.route('/defeitos', methods=['GET'])
@limiter.limit('100 per minute')
@auth_required()
def buscar_defeitos_injecao():
    """Busca defeitos cadastrados para o autocomplete da injeção."""
    if not check_permission('injecao', 'visualizar'):
        return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)

    termo = (request.args.get('search') or '').strip()
    try:
        linhas = db.session.execute(
            db.text('''
                SELECT DISTINCT `defeito`
                FROM `tb_defeito_inj`
                WHERE `defeito` IS NOT NULL
                  AND TRIM(`defeito`) <> ''
                  AND `defeito` LIKE :termo
                ORDER BY `defeito`
                LIMIT 15
            '''),
            {'termo': f'%{termo}%'}
        ).mappings().all()
        return create_response(success=True, data=[dict(linha) for linha in linhas])
    except Exception as e:
        current_app.logger.error(f'Erro ao buscar defeitos de injeção: {str(e)}')
        return create_response(success=False, message='Erro ao buscar defeitos', status_code=500)

@injecao_bp.route('', methods=['GET', 'POST', 'OPTIONS'])
@limiter.limit("100 per minute")
@auth_required()
def handle_injecoes():
    """Listar e criar registros de injeção"""
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

            query = RegistroInjecao.query

            if search:
                search_pattern = f"%{search}%"
                query = query.filter(
                    db.or_(
                        RegistroInjecao.cod.like(search_pattern),
                        RegistroInjecao.peca.like(search_pattern),
                        RegistroInjecao.maquina.like(search_pattern)
                    )
                )

            if status:
                query = query.filter(RegistroInjecao.status == status)

            query = query.order_by(RegistroInjecao.data.desc(), RegistroInjecao.id.desc())
            paginated = query.paginate(page=page, per_page=per_page, error_out=False)

            return create_response(
                success=True,
                data=injecoes_schema.dump(paginated.items),
                message=f"Encontrados {paginated.total} registros"
            )

        except Exception as e:
            current_app.logger.error(f"Erro ao buscar inspeções de injeção: {str(e)}")
            return create_response(
                success=False,
                message="Erro ao buscar inspeções de injeção",
                status_code=500
            )

    # POST - Criar novo registro
    if request.method == 'POST':
        try:
            dados = request.get_json()

            novo = RegistroInjecao(
                data=datetime.strptime(dados.get('data'), '%Y-%m-%d').date() if dados.get('data') else datetime.now().date(),
                semana=dados.get('semana'),
                turno_injecao=dados.get('turno_injecao'),
                maquina=dados.get('maquina'),
                modelo_maquina=dados.get('modelo_maquina'),
                cod=dados.get('cod'),
                peca=dados.get('peca'),
                molde=dados.get('molde'),
                amostra_insp=int(dados.get('amostra_insp', 0) or 0),
                amostra_nc=int(dados.get('amostra_nc', 0) or 0),
                qtde_lote=int(dados.get('qtde_lote', 0) or 0),
                peso=dados.get('peso'),
                status=dados.get('status', 'pendente'),
                defeito=dados.get('defeito'),
                cota1=dados.get('cota1'),
                cota2=dados.get('cota2'),
                cota3=dados.get('cota3'),
                cota4=dados.get('cota4'),
                visual=dados.get('visual'),
                cor_padrao=dados.get('cor_padrao'),
                encaixe=dados.get('encaixe'),
                contra_peca=dados.get('contra_peca'),
                rebarbas=dados.get('rebarbas'),
                funcional=dados.get('funcional'),
                observacao=dados.get('observacao'),
                inspetor=dados.get('inspetor', 'Sistema')
            )

            db.session.add(novo)
            db.session.commit()

            return create_response(
                success=True,
                message='Registro de injeção criado com sucesso',
                data=injecao_schema.dump(novo),
                status_code=201
            )

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Erro ao criar inspeção de injeção: {str(e)}")
            return create_response(
                success=False,
                message=f'Erro ao criar inspeção de injeção: {str(e)}',
                status_code=400
            )


@injecao_bp.route('/<int:id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'])
@auth_required()
def handle_injecao_individual(id):
    """GET, PUT ou DELETE em registro de injeção específico"""
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_ITEM)
    if negado:
        return negado

    if request.method == 'GET':
        try:
            registro = RegistroInjecao.query.get(id)
            if not registro:
                return create_response(success=False, message=f"Registro {id} não encontrado", status_code=404)
            return create_response(success=True, data=injecao_schema.dump(registro))
        except Exception as e:
            current_app.logger.error(f"Erro ao buscar inspeção de injeção {id}: {str(e)}")
            return create_response(success=False, message=f"Erro: {str(e)}", status_code=500)

    elif request.method == 'PUT':
        try:
            registro = RegistroInjecao.query.get(id)
            if not registro:
                return create_response(success=False, message=f"Registro {id} não encontrado", status_code=404)

            dados = request.get_json()

            if 'data' in dados and dados['data'] and isinstance(dados['data'], str):
                registro.data = datetime.strptime(dados['data'], '%Y-%m-%d').date()

            for campo in CAMPOS:
                if campo in dados:
                    setattr(registro, campo, dados[campo])

            registro.updated_at = datetime.utcnow()
            db.session.commit()

            return create_response(
                success=True,
                message="Registro atualizado com sucesso",
                data=injecao_schema.dump(registro)
            )

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Erro ao atualizar inspeção de injeção: {str(e)}")
            return create_response(success=False, message=f"Erro: {str(e)}", status_code=500)

    elif request.method == 'DELETE':
        try:
            registro = RegistroInjecao.query.get(id)
            if not registro:
                return create_response(success=False, message=f"Registro {id} não encontrado", status_code=404)

            db.session.delete(registro)
            db.session.commit()
            return create_response(success=True, message="Registro excluído com sucesso")

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Erro ao excluir inspeção de injeção: {str(e)}")
            return create_response(success=False, message=f"Erro ao excluir: {str(e)}", status_code=500)
