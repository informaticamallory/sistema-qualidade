# services/armazenamento.py - Fotos e anexos em disco, no volume do EasyPanel
#
# Por que existe: as fotos de evidência eram gravadas na própria linha do
# registro, em base64. Isso engorda o banco em ~33% sobre o tamanho do arquivo,
# faz toda listagem carregar imagem que ninguém vai abrir, e na Inspeção de
# Montagem a coluna é TEXT (64 KB), onde foto um pouco maior era truncada.
#
# Agora o arquivo vai para /app/uploads, que no EasyPanel é um volume e
# sobrevive aos deploys. Na coluna fica só o caminho.
#
# Sobre o nome do arquivo: ele carrega um uuid, e é isso que protege a imagem —
# a rota que serve os arquivos não exige token. O motivo é que <img src> não
# manda cabeçalho de autorização; exigir token obrigaria o front a buscar cada
# foto por fetch e montar um blob, nas cinco telas. Se um dia a evidência
# precisar de proteção de verdade, é esse o caminho.
import base64
import json
import os
import re
from datetime import datetime
from uuid import uuid4

from flask import current_app
from werkzeug.utils import secure_filename

DATA_URL_RE = re.compile(r'^data:(?P<mimetype>[-\w.+/]+);base64,(?P<dados>.+)$', re.DOTALL)

EXTENSOES = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'application/pdf': '.pdf'
}

# Teto por arquivo já decodificado. O front reduz a 1600px antes de enviar, o
# que costuma dar menos de 1 MB; 12 MB é folga para quem mandar de outro jeito.
LIMITE_BYTES = 12 * 1024 * 1024


def pasta_uploads():
    """Raiz dos arquivos. `root_path` é /app/app, então o pai é /app."""
    return os.path.abspath(os.path.join(current_app.root_path, '..', 'uploads'))


def eh_data_url(valor):
    return bool(DATA_URL_RE.match(str(valor or '')))


def eh_caminho_salvo(valor):
    return str(valor or '').startswith('uploads/')


def eh_url_publica(valor):
    return str(valor or '').startswith(('http://', 'https://'))


def salvar_data_url(data_url, subpasta, identificador=None, nome_original=None):
    """Grava uma imagem recebida em base64 e devolve o caminho relativo.

    Devolve None quando o valor não é uma data URL — assim o chamador pode
    passar qualquer conteúdo sem checar antes.
    """
    casou = DATA_URL_RE.match(str(data_url or ''))
    if not casou:
        return None

    mimetype = casou.group('mimetype').lower()
    try:
        conteudo = base64.b64decode(casou.group('dados'), validate=True)
    except Exception:
        raise ValueError('Imagem em base64 inválida.')

    if len(conteudo) > LIMITE_BYTES:
        raise ValueError('Arquivo acima do limite de 12 MB.')

    extensao = EXTENSOES.get(mimetype)
    if not extensao:
        raise ValueError(f'Tipo de arquivo não aceito: {mimetype}')

    # Uma pasta por mês: diretório com dezenas de milhares de arquivos fica
    # lento de listar, e separar por mês também facilita apagar um período.
    relativo = os.path.join('fotos', secure_filename(subpasta),
                            datetime.utcnow().strftime('%Y-%m'))
    destino = os.path.join(pasta_uploads(), relativo)
    os.makedirs(destino, exist_ok=True)

    partes = [p for p in (secure_filename(str(identificador)) if identificador else None,
                          uuid4().hex) if p]
    nome_arquivo = '-'.join(partes) + extensao

    with open(os.path.join(destino, nome_arquivo), 'wb') as arquivo:
        arquivo.write(conteudo)

    # Barra normal mesmo no Windows: o valor vira parte de uma URL.
    return 'uploads/' + relativo.replace(os.sep, '/') + '/' + nome_arquivo


def normalizar_fotos(valor, subpasta, identificador=None):
    """Converte o que vier do formulário em caminhos de arquivo.

    O front manda um JSON com a lista de imagens (Injeção, Montagem,
    Recebimento) ou uma imagem só (Fichas NC, Resumo de Bloqueio), e em ambos
    os casos pode vir base64 ou um caminho já salvo — o registro reenvia o que
    recebeu quando é editado sem trocar a foto.

    Devolve no mesmo formato que entrou: lista vira JSON de lista, valor único
    continua único. Nada de base64 sobra.
    """
    if valor in (None, ''):
        return valor

    texto = str(valor)

    # Lista em JSON
    if texto.lstrip().startswith('['):
        try:
            itens = json.loads(texto)
        except ValueError:
            itens = None

        if isinstance(itens, list):
            convertidos = []
            for item in itens:
                if eh_data_url(item):
                    salvo = salvar_data_url(item, subpasta, identificador)
                    if salvo:
                        convertidos.append(salvo)
                elif item:
                    convertidos.append(str(item))
            return json.dumps(convertidos)

    if eh_data_url(texto):
        return salvar_data_url(texto, subpasta, identificador) or ''

    return texto


def caminho_dentro_da_raiz(valor):
    """Converte o caminho guardado no banco em caminho absoluto, ou None.

    O valor gravado começa com 'uploads/', que é o prefixo da URL e não faz
    parte do caminho em disco — a raiz já é a pasta uploads. Devolve None
    quando o resultado escaparia dela, para que um valor adulterado no banco
    não alcance arquivo nenhum do servidor.
    """
    texto = str(valor or '').replace(os.sep, '/')
    if texto.startswith('uploads/'):
        texto = texto[len('uploads/'):]
    if not texto:
        return None

    raiz = pasta_uploads()
    alvo = os.path.abspath(os.path.join(raiz, texto))
    if os.path.commonpath([raiz, alvo]) != raiz:
        return None
    return alvo


def salvar_evidencia(data_url, nome_original=None, prefixo='evidencias',
                     identificador=None):
    """Grava uma evidência e devolve o caminho; o que não for base64 passa.

    Mantém a ordem de argumentos que as Fichas NC e o Resumo de Bloqueio já
    usavam quando chamavam o serviço do Cloudflare R2, que foi removido. O
    `nome_original` não entra no nome do arquivo — ele já é guardado em coluna
    própria, e o nome em disco é um uuid.
    """
    if not eh_data_url(data_url):
        return data_url
    return salvar_data_url(data_url, prefixo, identificador) or data_url


def apagar_arquivo(caminho_relativo):
    """Remove um arquivo gravado por aqui. Silencioso quando já não existe."""
    if not eh_caminho_salvo(caminho_relativo):
        return False

    alvo = caminho_dentro_da_raiz(caminho_relativo)

    if not alvo or not os.path.isfile(alvo):
        return False

    try:
        os.remove(alvo)
        return True
    except OSError:
        return False
