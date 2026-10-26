"""Fotos de evidência em disco, no lugar de base64 dentro do banco.

O que importa aqui: nada de base64 sobra na coluna, o arquivo existe mesmo, a
rota devolve o conteúdo, e ninguém escapa da pasta de uploads.
"""
import base64
import json
import os

import pytest

from app.services.armazenamento import (
    apagar_arquivo, eh_caminho_salvo, normalizar_fotos, pasta_uploads, salvar_data_url
)

# PNG 1x1 de verdade, para o decode valer alguma coisa.
PNG_1X1 = base64.b64encode(bytes.fromhex(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4'
    '890000000a49444154789c6300010000050001' '0d0a2db4' '0000000049454e44ae426082'
)).decode()
DATA_URL = f'data:image/png;base64,{PNG_1X1}'


@pytest.fixture()
def contexto(app, tmp_path, monkeypatch):
    """Uploads num diretório temporário, para o teste não sujar o projeto."""
    with app.app_context():
        monkeypatch.setattr('app.services.armazenamento.pasta_uploads',
                            lambda: str(tmp_path))
        yield str(tmp_path)


def test_grava_arquivo_e_devolve_caminho(contexto):
    caminho = salvar_data_url(DATA_URL, 'injecao', 'B00100')

    assert caminho.startswith('uploads/fotos/injecao/')
    assert caminho.endswith('.png')
    assert eh_caminho_salvo(caminho)

    # O arquivo existe e tem o conteúdo decodificado, não o texto base64.
    no_disco = os.path.join(contexto, caminho[len('uploads/'):])
    assert os.path.isfile(no_disco)
    with open(no_disco, 'rb') as f:
        assert f.read().startswith(b'\x89PNG')


def test_nomes_nao_colidem(contexto):
    """Duas fotos do mesmo material no mesmo segundo não podem se sobrescrever."""
    a = salvar_data_url(DATA_URL, 'injecao', 'B00100')
    b = salvar_data_url(DATA_URL, 'injecao', 'B00100')
    assert a != b


def test_lista_de_fotos_vira_lista_de_caminhos(contexto):
    """Injeção, Montagem e Recebimento mandam um JSON com até três imagens."""
    entrada = json.dumps([DATA_URL, DATA_URL])
    saida = normalizar_fotos(entrada, 'injecao', 'B00100')

    caminhos = json.loads(saida)
    assert len(caminhos) == 2
    assert all(eh_caminho_salvo(c) for c in caminhos)
    assert 'base64' not in saida


def test_foto_unica_vira_caminho(contexto):
    """Fichas NC e Resumo de Bloqueio mandam uma imagem só."""
    saida = normalizar_fotos(DATA_URL, 'fichas-nc', 'FNC-101')
    assert eh_caminho_salvo(saida)
    assert 'base64' not in saida


def test_caminho_ja_salvo_passa_intacto(contexto):
    """Editar um registro sem trocar a foto reenvia o caminho que veio."""
    caminho = salvar_data_url(DATA_URL, 'injecao')
    assert normalizar_fotos(caminho, 'injecao') == caminho
    assert normalizar_fotos(json.dumps([caminho]), 'injecao') == json.dumps([caminho])


def test_mistura_de_caminho_e_foto_nova(contexto):
    """Uma foto antiga mantida e uma nova adicionada, no mesmo salvamento."""
    antiga = salvar_data_url(DATA_URL, 'injecao')
    saida = json.loads(normalizar_fotos(json.dumps([antiga, DATA_URL]), 'injecao'))

    assert saida[0] == antiga
    assert saida[1] != antiga
    assert all(eh_caminho_salvo(c) for c in saida)


def test_vazio_continua_vazio(contexto):
    assert normalizar_fotos('', 'injecao') == ''
    assert normalizar_fotos(None, 'injecao') is None
    assert normalizar_fotos(json.dumps([]), 'injecao') == json.dumps([])


def test_tipo_nao_aceito_e_recusado(contexto):
    with pytest.raises(ValueError):
        salvar_data_url('data:application/x-msdownload;base64,TVqQ', 'injecao')


def test_base64_quebrado_e_recusado(contexto):
    with pytest.raises(ValueError):
        salvar_data_url('data:image/png;base64,####', 'injecao')


def test_apagar_so_funciona_dentro_da_pasta(contexto):
    caminho = salvar_data_url(DATA_URL, 'injecao')
    assert apagar_arquivo(caminho) is True
    assert apagar_arquivo(caminho) is False          # já não existe
    assert apagar_arquivo('uploads/../../etc/passwd') is False
    assert apagar_arquivo('/etc/passwd') is False


# ── A rota que entrega o arquivo ────────────────────────────────────────────

def test_rota_entrega_a_imagem(client, contexto):
    caminho = salvar_data_url(DATA_URL, 'injecao')
    relativo = caminho[len('uploads/'):]

    resp = client.get(f'/api/arquivos/{relativo}')
    assert resp.status_code == 200
    assert resp.data.startswith(b'\x89PNG')
    # Nome com uuid: o conteúdo daquele endereço nunca muda.
    assert 'immutable' in resp.headers.get('Cache-Control', '')


def test_rota_nao_sai_da_pasta_de_uploads(client, contexto):
    """Sem a checagem de caminho, isto serviria qualquer arquivo do servidor."""
    assert client.get('/api/arquivos/../../etc/passwd').status_code in (404, 400)
    assert client.get('/api/arquivos/nao-existe.png').status_code == 404


# ── Migração do que já está em base64 no banco ──────────────────────────────

def test_migracao_converte_e_e_repetivel(app, contexto):
    """Converte o base64 que já está gravado e não mexe no que já é arquivo."""
    from datetime import date
    import json as _json
    from app.extensions import db as _db
    from app.models.injecao import RegistroInjecao
    from migrar_fotos_para_disco import migrar

    antigo = RegistroInjecao(data=date.today(), cod='B00100',
                             foto_peca=_json.dumps([DATA_URL, DATA_URL]))
    sem_foto = RegistroInjecao(data=date.today(), cod='B00200', foto_peca='')
    _db.session.add_all([antigo, sem_foto])
    _db.session.commit()

    primeira = migrar()
    assert primeira['convertidos'] == 1
    assert primeira['erros'] == 0

    _db.session.refresh(antigo)
    caminhos = _json.loads(antigo.foto_peca)
    assert len(caminhos) == 2
    assert all(eh_caminho_salvo(c) for c in caminhos)
    assert 'base64' not in antigo.foto_peca

    # Rodar de novo não converte nada nem estraga o que já foi convertido.
    segunda = migrar()
    assert segunda['convertidos'] == 0
    assert segunda['erros'] == 0
    _db.session.refresh(antigo)
    assert _json.loads(antigo.foto_peca) == caminhos


def test_simulacao_nao_grava(app, contexto):
    from datetime import date
    from app.extensions import db as _db
    from app.models.injecao import RegistroInjecao
    from migrar_fotos_para_disco import migrar

    registro = RegistroInjecao(data=date.today(), cod='B00300', foto_peca=DATA_URL)
    _db.session.add(registro)
    _db.session.commit()

    total = migrar(simular=True)
    assert total['convertidos'] == 1

    _db.session.refresh(registro)
    assert registro.foto_peca == DATA_URL      # intacto
