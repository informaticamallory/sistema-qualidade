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


def _parse_date(value):
    if not value:
        return datetime.now().date()
    if hasattr(value, 'date') and not isinstance(value, str):
        return value
    return datetime.strptime(str(value)[:10], '%Y-%m-%d').date()

# Campos atualizáveis (todos exceto data, tratada à parte)
CAMPOS = [
    'semana', 'turno_injecao', 'maquina', 'modelo_maquina', 'cod', 'peca', 'molde',
    'amostra_insp', 'amostra_nc', 'qtde_lote', 'peso',
    'status', 'defeito', 'foto_peca', 'foto_peca_nome', 'cota1', 'cota2', 'cota3', 'cota4',
    'visual', 'cor_padrao', 'encaixe', 'contra_peca', 'rebarbas',
    'funcional', 'observacao', 'inspetor'
]



CAMPOS_AVALIACAO = ('visual', 'cor_padrao', 'encaixe', 'contra_peca', 'rebarbas', 'funcional')
VALORES_AVALIACAO_VALIDOS = {'C', 'NC', 'NA'}
STATUS_FINAIS_VALIDOS = {'aprovado', 'reprovado'}


def _validar_avaliacao(dados, registro=None):
    def valor_atual(campo):
        return dados.get(campo, getattr(registro, campo, None) if registro else None)

    for campo in ('turno_injecao', 'maquina', 'molde'):
        if not str(valor_atual(campo) or '').strip():
            return 'Turno de Injeção, Máquina e Molde são obrigatórios.'

    try:
        amostra_insp = int(valor_atual('amostra_insp'))
        amostra_nc = int(valor_atual('amostra_nc'))
        qtde_lote = int(valor_atual('qtde_lote'))
    except (TypeError, ValueError):
        return 'Amostra Inspecionada, Amostra NC e Quantidade do Lote são obrigatórias.'

    if amostra_insp <= 0 or qtde_lote <= 0 or amostra_nc < 0:
        return 'Amostra Inspecionada e Quantidade do Lote devem ser maiores que zero; Amostra NC não pode ser negativa.'

    for campo in CAMPOS_AVALIACAO:
        valor = dados.get(campo, getattr(registro, campo, None) if registro else None)
        if str(valor or '').strip().upper() not in VALORES_AVALIACAO_VALIDOS:
            return 'Todos os campos da avaliação devem ser preenchidos antes de salvar.'

    status = dados.get('status', getattr(registro, 'status', None) if registro else None)
    if str(status or '').strip().lower() not in STATUS_FINAIS_VALIDOS:
        return 'O status deve ser Aprovado ou Reprovado.'

    return None
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
            data_filtro = request.args.get('data', '')
            data_inicio_filtro = request.args.get('data_inicio', '')
            data_fim_filtro = request.args.get('data_fim', '')
            mes_filtro = request.args.get('mes', '')
            turno_filtro = (request.args.get('turno', '') or '').strip().upper()

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


            if turno_filtro:
                if turno_filtro not in ('A', 'B', 'C'):
                    return create_response(success=False, message='Turno inválido. Use A, B ou C.', status_code=400)
                turno_normalizado = db.func.upper(db.func.trim(RegistroInjecao.turno_injecao))
                query = query.filter(turno_normalizado.in_((turno_filtro, f'TURNO {turno_filtro}')))
            if data_filtro:
                try:
                    data_consulta = datetime.strptime(data_filtro, '%Y-%m-%d').date()
                except ValueError:
                    return create_response(success=False, message='Data inválida. Use o formato YYYY-MM-DD.', status_code=400)
                query = query.filter(RegistroInjecao.data == data_consulta)

            elif data_inicio_filtro or data_fim_filtro:
                try:
                    data_inicio = datetime.strptime(data_inicio_filtro, '%Y-%m-%d').date() if data_inicio_filtro else None
                    data_fim = datetime.strptime(data_fim_filtro, '%Y-%m-%d').date() if data_fim_filtro else None
                except ValueError:
                    return create_response(success=False, message='Intervalo inválido. Use o formato YYYY-MM-DD.', status_code=400)

                if data_inicio and data_fim and data_inicio > data_fim:
                    return create_response(success=False, message='A data inicial não pode ser posterior à data final.', status_code=400)
                if data_inicio:
                    query = query.filter(RegistroInjecao.data >= data_inicio)
                if data_fim:
                    query = query.filter(RegistroInjecao.data <= data_fim)

            if mes_filtro and not data_filtro and not data_inicio_filtro and not data_fim_filtro:
                try:
                    inicio_mes = datetime.strptime(mes_filtro, '%Y-%m').date().replace(day=1)
                    if inicio_mes.month == 12:
                        inicio_proximo_mes = inicio_mes.replace(year=inicio_mes.year + 1, month=1)
                    else:
                        inicio_proximo_mes = inicio_mes.replace(month=inicio_mes.month + 1)
                except ValueError:
                    return create_response(success=False, message='Mês inválido. Use o formato YYYY-MM.', status_code=400)
                query = query.filter(
                    RegistroInjecao.data >= inicio_mes,
                    RegistroInjecao.data < inicio_proximo_mes
                )
            query = query.order_by(RegistroInjecao.data.desc(), RegistroInjecao.id.desc())

            if data_filtro or data_inicio_filtro or data_fim_filtro or mes_filtro:
                registros_do_dia = query.all()
                return create_response(
                    success=True,
                    data=injecoes_schema.dump(registros_do_dia),
                    message=f"Encontrados {len(registros_do_dia)} registros"
                )
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
            dados = request.get_json() or {}

            erro_validacao = _validar_avaliacao(dados)

            if erro_validacao:

                return create_response(success=False, message=erro_validacao, status_code=400)

            novo = RegistroInjecao(
                data=_parse_date(dados.get('data')),
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
                foto_peca=dados.get('foto_peca'),
                foto_peca_nome=dados.get('foto_peca_nome'),
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

            dados = request.get_json() or {}

            erro_validacao = _validar_avaliacao(dados, registro)

            if erro_validacao:

                return create_response(success=False, message=erro_validacao, status_code=400)

            if 'data' in dados and dados['data'] and isinstance(dados['data'], str):
                registro.data = _parse_date(dados['data'])

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


